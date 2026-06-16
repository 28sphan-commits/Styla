import { z } from "zod";
import { styleDnaSchema } from "@/lib/onboarding";

export const membershipTiers = ["free", "pro", "elite"] as const;

export const profileUpdateSchema = z
  .object({
    username: z
      .string()
      .trim()
      .transform((value) => (value ? value : null))
      .nullable()
      .refine((value) => !value || /^[A-Za-z0-9_]{3,20}$/.test(value), {
        message: "Username must be 3-20 letters, numbers, or underscores."
      }),
    bio: z.string().trim().max(160),
    is_public: z.boolean(),
    show_outfits: z.boolean(),
    membership_tier: z.enum(membershipTiers),
    ...styleDnaSchema.shape
  })
  .refine((value) => !value.is_public || Boolean(value.username), {
    message: "Choose a username before making your profile public.",
    path: ["username"]
  });

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export type ProfileRecord = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  username: string | null;
  bio: string | null;
  membership_tier: (typeof membershipTiers)[number];
  is_public: boolean;
  show_outfits: boolean;
};
