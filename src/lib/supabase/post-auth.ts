import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where a freshly-authenticated user should land: onboarding until they have a
 * Style DNA row, otherwise the requested destination. Shared by the Google OAuth
 * callback and the email/username sign-in + sign-up actions so the routing rule
 * lives in exactly one place.
 */
export async function destinationForUser(
  supabase: SupabaseClient,
  userId: string,
  fallback = "/explore"
): Promise<string> {
  const { data: styleDna } = await supabase
    .from("style_dna")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  return styleDna ? fallback : "/onboarding";
}
