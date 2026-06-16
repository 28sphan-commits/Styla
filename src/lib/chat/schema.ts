import { z } from "zod";

export const chatRoleSchema = z.enum(["user", "assistant"]);

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(1600)
});

export type ChatRole = z.infer<typeof chatRoleSchema>;

export type ChatMessage = {
  id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
};
