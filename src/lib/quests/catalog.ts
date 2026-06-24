// Quests let free users earn extra wardrobe upload slots by interacting with the
// app. They progress through this ordered catalog one quest at a time: finish
// the active quest to claim its reward and unlock the next.

export const BASE_FREE_UPLOADS = 40;
export const MAX_FREE_UPLOADS = 78;
// Total slots earnable across all quests (40 base + 35 earned = 75 cap).
export const TOTAL_QUEST_BONUS = MAX_FREE_UPLOADS - BASE_FREE_UPLOADS; // 35
export const START_SKIPS = 3;
export const SKIP_COOLDOWN_DAYS = 2;

// Aura points: the cross-tier status currency. A quest's base aura is its slot
// reward × this factor, then multiplied by the member's tier rate below — so
// paid members are rewarded more for the same effort (the incentive to keep
// questing once uploads are unlimited).
export const AURA_PER_REWARD = 10;
export const AURA_MULTIPLIER: Record<string, number> = {
  free: 1,
  pro: 3,
  elite: 5
};

export function auraMultiplier(tier: string): number {
  return AURA_MULTIPLIER[tier] ?? 1;
}

// Aura a quest awards for a given tier.
export function questAura(reward: number, tier: string): number {
  return reward * AURA_PER_REWARD * auraMultiplier(tier);
}

// Each metric maps to a table whose rows are counted (for the active quest)
// since the quest was assigned — so quests always reward *new* activity.
export type QuestMetric =
  | "scan" // wardrobe_items created
  | "scan_streak" // scans on consecutive days
  | "outfit" // outfits created
  | "follow" // people followed
  | "save" // looks bookmarked
  | "like" // looks liked
  | "comment" // comments posted
  | "feedback"; // feedback messages sent

export type Quest = {
  key: string;
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  reward: number; // wardrobe slots granted on completion
};

// Order matters — this is the progression. Rewards sum to TOTAL_QUEST_BONUS (35).
export const QUESTS: Quest[] = [
  {
    key: "scan_two",
    title: "Build your closet",
    description: "Scan 2 pieces of clothing into your wardrobe.",
    metric: "scan",
    target: 2,
    reward: 4
  },
  {
    key: "scan_streak_two",
    title: "Two days running",
    description: "Scan at least one item on 2 days in a row.",
    metric: "scan_streak",
    target: 2,
    reward: 5
  },
  {
    key: "outfit_three",
    title: "Curate your looks",
    description: "Create 3 new outfits.",
    metric: "outfit",
    target: 3,
    reward: 4
  },
  {
    key: "follow_three",
    title: "Find your circle",
    description: "Follow 3 stylists you like.",
    metric: "follow",
    target: 3,
    reward: 3
  },
  {
    key: "save_three",
    title: "Save the inspiration",
    description: "Bookmark 3 looks from Explore.",
    metric: "save",
    target: 3,
    reward: 3
  },
  {
    key: "like_five",
    title: "Spread the love",
    description: "Like 5 looks in the feed.",
    metric: "like",
    target: 5,
    reward: 3
  },
  {
    key: "comment_two",
    title: "Join the conversation",
    description: "Comment on 2 looks.",
    metric: "comment",
    target: 2,
    reward: 3
  },
  {
    key: "scan_five",
    title: "Stock the rail",
    description: "Scan 5 more pieces into your wardrobe.",
    metric: "scan",
    target: 5,
    reward: 4
  },
  {
    key: "outfit_five",
    title: "Style maven",
    description: "Create 5 more outfits.",
    metric: "outfit",
    target: 5,
    reward: 3
  },
  {
    key: "follow_five",
    title: "Grow your network",
    description: "Follow 5 more stylists.",
    metric: "follow",
    target: 5,
    reward: 3
  },
  {
    key: "send_feedback",
    title: "Tell us what you think",
    description: "Send us feedback from your profile page.",
    metric: "feedback",
    target: 1,
    reward: 3
  }
];

export const QUEST_BY_KEY = new Map(QUESTS.map((quest) => [quest.key, quest]));

// The next quest in the progression after the given key, or null if it's last.
export function nextQuestAfter(key: string | null): Quest | null {
  if (key === null) return QUESTS[0] ?? null;
  const index = QUESTS.findIndex((quest) => quest.key === key);
  if (index === -1) return QUESTS[0] ?? null;
  return QUESTS[index + 1] ?? null;
}
