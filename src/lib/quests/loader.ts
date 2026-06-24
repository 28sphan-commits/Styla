import type { SupabaseClient } from "@supabase/supabase-js";
import {
  auraMultiplier,
  BASE_FREE_UPLOADS,
  MAX_FREE_UPLOADS,
  QUESTS,
  questAura,
  SKIP_COOLDOWN_DAYS,
  START_SKIPS,
  TOTAL_QUEST_BONUS,
  type Quest
} from "@/lib/quests/catalog";

export type QuestState = {
  // False until the quests migration is applied; the UI shows a preview + notice.
  persisted: boolean;
  active: { quest: Quest; progress: number } | null;
  completed: { quest: Quest; reward: number }[];
  skipsRemaining: number;
  canSkip: boolean;
  nextSkipAt: string | null;
  bonusSlots: number;
  totalBonus: number;
  baseUploads: number;
  uploadCap: number;
  allComplete: boolean;
  auraPoints: number;
  auraMultiplier: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Tables/columns each metric counts. Progress is the number of rows the user
// created since the active quest was assigned.
const METRIC_SOURCE: Record<
  Quest["metric"],
  { table: string; userColumn: string }
> = {
  scan: { table: "wardrobe_items", userColumn: "user_id" },
  scan_streak: { table: "wardrobe_items", userColumn: "user_id" },
  outfit: { table: "outfits", userColumn: "user_id" },
  follow: { table: "follows", userColumn: "follower_id" },
  save: { table: "bookmarks", userColumn: "user_id" },
  like: { table: "likes", userColumn: "user_id" },
  comment: { table: "comments", userColumn: "user_id" },
  feedback: { table: "feedback", userColumn: "user_id" }
};

async function countSince(
  supabase: SupabaseClient,
  table: string,
  userColumn: string,
  userId: string,
  since: string
): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(userColumn, userId)
    .gte("created_at", since);
  return count ?? 0;
}

// Longest run of consecutive calendar days (UTC) on which the user scanned an
// item since `since`. Powers the "2 days in a row" streak quest.
async function scanStreakSince(
  supabase: SupabaseClient,
  userId: string,
  since: string
): Promise<number> {
  const { data } = await supabase
    .from("wardrobe_items")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", since);

  const days = Array.from(
    new Set(
      ((data ?? []) as { created_at: string }[]).map((row) =>
        row.created_at.slice(0, 10)
      )
    )
  ).sort();

  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const day of days) {
    const t = Date.parse(`${day}T00:00:00Z`);
    run = prev !== null && t - prev === DAY_MS ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = t;
  }
  return longest;
}

async function questProgress(
  supabase: SupabaseClient,
  userId: string,
  quest: Quest,
  since: string
): Promise<number> {
  if (quest.metric === "scan_streak") {
    return scanStreakSince(supabase, userId, since);
  }
  const source = METRIC_SOURCE[quest.metric];
  return countSince(supabase, source.table, source.userColumn, userId, since);
}

function uploadCapFor(bonusSlots: number): number {
  return Math.min(MAX_FREE_UPLOADS, BASE_FREE_UPLOADS + bonusSlots);
}

type QuestRow = {
  quest_key: string;
  status: "active" | "completed" | "skipped";
  assigned_at: string;
  reward_granted: number;
};

// Loads the user's quest state, reconciling progress on read: if the active
// quest's target is met, it's marked complete, the reward is granted, and the
// next quest is assigned. Writes are best-effort and skipped before migration.
export async function loadQuestState(
  supabase: SupabaseClient,
  userId: string,
  tier = "free"
): Promise<QuestState> {
  const baseState = {
    completed: [] as { quest: Quest; reward: number }[],
    skipsRemaining: START_SKIPS,
    canSkip: false,
    nextSkipAt: null as string | null,
    bonusSlots: 0,
    totalBonus: TOTAL_QUEST_BONUS,
    baseUploads: BASE_FREE_UPLOADS,
    uploadCap: BASE_FREE_UPLOADS,
    allComplete: false,
    auraPoints: 0,
    auraMultiplier: auraMultiplier(tier)
  };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("quest_skips_remaining, wardrobe_bonus_slots, aura_points, last_skip_at")
    .eq("id", userId)
    .maybeSingle();

  const { data: rows, error: rowsError } = await supabase
    .from("user_quests")
    .select("quest_key, status, assigned_at, reward_granted")
    .eq("user_id", userId);

  const persisted = !profileError && !rowsError && profile != null;

  // Degraded preview: show the catalog with the first quest active at 0 progress.
  if (!persisted) {
    return {
      ...baseState,
      persisted: false,
      active: QUESTS[0] ? { quest: QUESTS[0], progress: 0 } : null
    };
  }

  const meta = profile as {
    quest_skips_remaining: number;
    wardrobe_bonus_slots: number;
    aura_points: number;
    last_skip_at: string | null;
  };
  let bonusSlots = meta.wardrobe_bonus_slots ?? 0;
  let auraPoints = meta.aura_points ?? 0;
  const questRows = (rows ?? []) as QuestRow[];
  const rowByKey = new Map(questRows.map((row) => [row.quest_key, row]));

  const resolvedKeys = new Set(
    questRows
      .filter((row) => row.status === "completed" || row.status === "skipped")
      .map((row) => row.quest_key)
  );

  const completed: { quest: Quest; reward: number }[] = QUESTS.filter(
    (quest) => rowByKey.get(quest.key)?.status === "completed"
  ).map((quest) => ({ quest, reward: rowByKey.get(quest.key)!.reward_granted }));

  // The active quest is the first one not yet completed or skipped.
  const activeQuest = QUESTS.find((quest) => !resolvedKeys.has(quest.key)) ?? null;

  let active: { quest: Quest; progress: number } | null = null;

  if (activeQuest) {
    let row = rowByKey.get(activeQuest.key);

    // Ensure an active row exists so progress is anchored from now.
    if (!row) {
      const assignedAt = new Date().toISOString();
      await supabase.from("user_quests").upsert(
        {
          user_id: userId,
          quest_key: activeQuest.key,
          status: "active",
          assigned_at: assignedAt
        },
        { onConflict: "user_id,quest_key", ignoreDuplicates: true }
      );
      row = {
        quest_key: activeQuest.key,
        status: "active",
        assigned_at: assignedAt,
        reward_granted: 0
      };
    }

    const progress = await questProgress(
      supabase,
      userId,
      activeQuest,
      row.assigned_at
    );

    if (progress >= activeQuest.target) {
      // Complete the quest. Free members earn wardrobe slots (clamped to the
      // total cap); everyone earns aura, scaled by their tier multiplier.
      const reward = Math.min(
        activeQuest.reward,
        Math.max(0, TOTAL_QUEST_BONUS - bonusSlots)
      );
      bonusSlots += reward;
      auraPoints += questAura(activeQuest.reward, tier);

      await supabase
        .from("user_quests")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          reward_granted: reward
        })
        .eq("user_id", userId)
        .eq("quest_key", activeQuest.key);

      await supabase
        .from("profiles")
        .update({ wardrobe_bonus_slots: bonusSlots, aura_points: auraPoints })
        .eq("id", userId);

      completed.push({ quest: activeQuest, reward });

      // Assign the next quest (anchored to now), shown at 0 progress this load.
      const nextQuest =
        QUESTS[QUESTS.findIndex((q) => q.key === activeQuest.key) + 1] ?? null;
      if (nextQuest) {
        await supabase.from("user_quests").upsert(
          {
            user_id: userId,
            quest_key: nextQuest.key,
            status: "active",
            assigned_at: new Date().toISOString()
          },
          { onConflict: "user_id,quest_key", ignoreDuplicates: true }
        );
        active = { quest: nextQuest, progress: 0 };
      }
    } else {
      active = { quest: activeQuest, progress };
    }
  }

  const skipsRemaining = meta.quest_skips_remaining ?? START_SKIPS;
  const lastSkipMs = meta.last_skip_at ? Date.parse(meta.last_skip_at) : null;
  const cooldownMs = SKIP_COOLDOWN_DAYS * DAY_MS;
  const cooldownOver = lastSkipMs === null || Date.now() - lastSkipMs >= cooldownMs;
  const nextSkipAt =
    lastSkipMs !== null && !cooldownOver
      ? new Date(lastSkipMs + cooldownMs).toISOString()
      : null;

  return {
    persisted: true,
    active,
    completed,
    skipsRemaining,
    canSkip: skipsRemaining > 0 && cooldownOver && active !== null,
    nextSkipAt,
    bonusSlots,
    totalBonus: TOTAL_QUEST_BONUS,
    baseUploads: BASE_FREE_UPLOADS,
    uploadCap: uploadCapFor(bonusSlots),
    allComplete: active === null,
    auraPoints,
    auraMultiplier: auraMultiplier(tier)
  };
}
