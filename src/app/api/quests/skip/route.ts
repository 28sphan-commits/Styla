import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { QUESTS, SKIP_COOLDOWN_DAYS, START_SKIPS } from "@/lib/quests/catalog";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("quest_skips_remaining, last_skip_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: "Quests aren't set up yet." },
      { status: 409 }
    );
  }

  const meta = profile as {
    quest_skips_remaining: number;
    last_skip_at: string | null;
  };
  const skipsRemaining = meta.quest_skips_remaining ?? START_SKIPS;

  if (skipsRemaining <= 0) {
    return NextResponse.json({ error: "No skips remaining." }, { status: 400 });
  }

  // Enforce the once-per-two-days skip cadence.
  const lastSkipMs = meta.last_skip_at ? Date.parse(meta.last_skip_at) : null;
  const cooldownMs = SKIP_COOLDOWN_DAYS * DAY_MS;
  if (lastSkipMs !== null && Date.now() - lastSkipMs < cooldownMs) {
    return NextResponse.json(
      {
        error: `You can skip again on ${new Date(
          lastSkipMs + cooldownMs
        ).toLocaleDateString()}.`
      },
      { status: 400 }
    );
  }

  const { data: rows } = await supabase
    .from("user_quests")
    .select("quest_key, status")
    .eq("user_id", user.id);

  const resolved = new Set(
    ((rows ?? []) as { quest_key: string; status: string }[])
      .filter((row) => row.status === "completed" || row.status === "skipped")
      .map((row) => row.quest_key)
  );

  const activeIndex = QUESTS.findIndex((quest) => !resolved.has(quest.key));
  const activeQuest = QUESTS[activeIndex];

  if (!activeQuest) {
    return NextResponse.json({ error: "No active quest to skip." }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Mark the active quest skipped (no reward) and burn a skip.
  await supabase.from("user_quests").upsert(
    {
      user_id: user.id,
      quest_key: activeQuest.key,
      status: "skipped",
      assigned_at: now
    },
    { onConflict: "user_id,quest_key" }
  );

  await supabase
    .from("profiles")
    .update({ quest_skips_remaining: skipsRemaining - 1, last_skip_at: now })
    .eq("id", user.id);

  // Assign the next quest, anchored from now.
  const nextQuest = QUESTS[activeIndex + 1];
  if (nextQuest) {
    await supabase.from("user_quests").upsert(
      {
        user_id: user.id,
        quest_key: nextQuest.key,
        status: "active",
        assigned_at: now
      },
      { onConflict: "user_id,quest_key", ignoreDuplicates: true }
    );
  }

  return NextResponse.json({
    ok: true,
    skipsRemaining: skipsRemaining - 1,
    nextQuestKey: nextQuest?.key ?? null
  });
}
