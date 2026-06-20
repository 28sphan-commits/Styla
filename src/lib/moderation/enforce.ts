// Server-side moderation enforcement shared by every text-submitting route.
//
// Pass the text fields you're about to persist; get back either the cleaned
// (censored) values to store, or a structured rejection. Severe content blocks
// the submission AND records a strike via the SECURITY DEFINER RPC (which may
// trip the 3-strike auto-ban). Mild content is censored and allowed through —
// unless the field is marked `block` (e.g. usernames), where any profanity is
// rejected outright.

import { moderateText, type Severity } from "@/lib/moderation/filter";

// Structural subset of the Supabase client. `from` returns `unknown` (cast at
// use-sites) to avoid the "excessively deep" instantiation that comes from
// matching the full builder generics — the same approach as lib/outfits/loaders.
type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => unknown;
};

type ProfileStatusQuery = {
  select: (columns: string) => {
    eq: (column: string, value: unknown) => {
      maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
};

export type ModerationField = {
  value: string | null | undefined;
  // When true, ANY profanity (mild or severe) rejects the value rather than
  // censoring it. Use for identifiers like usernames that can't be masked.
  block?: boolean;
};

export type ModerationOutcome =
  | { ok: true; values: string[] }
  | { ok: false; status: number; error: string; banned: boolean };

const STRIKE_LIMIT = 3;

function worst(a: Severity, b: Severity): Severity {
  if (a === "severe" || b === "severe") return "severe";
  if (a === "mild" || b === "mild") return "mild";
  return "none";
}

/**
 * Moderates a batch of fields against the same submission.
 * - On success: returns censored values in the SAME order as `fields`.
 * - Severe term anywhere: blocks + records a strike (auto-bans at 3).
 * - Mild term in a `block` field: blocks without a strike.
 * - Mild term in a normal field: censored and allowed.
 */
export async function enforceModeration(
  supabase: RpcClient,
  fields: ModerationField[]
): Promise<ModerationOutcome> {
  const scanned = fields.map((field) => ({
    field,
    result: moderateText(field.value)
  }));

  const overall = scanned.reduce<Severity>(
    (acc, item) => worst(acc, item.result.severity),
    "none"
  );

  if (overall === "severe") {
    const { data, error } = await supabase.rpc("record_text_violation");
    let strikes = 0;
    let banned = false;

    if (!error && data) {
      const row = (Array.isArray(data) ? data[0] : data) as
        | { strikes?: number; status?: string }
        | undefined;
      strikes = row?.strikes ?? 0;
      banned = row?.status === "banned";
    }

    return {
      ok: false,
      status: banned ? 403 : 400,
      banned,
      error: banned
        ? "Your account has been suspended for repeated community guidelines violations."
        : `That language isn't allowed on Styla. This is strike ${strikes} of ${STRIKE_LIMIT} — at ${STRIKE_LIMIT} strikes your account is suspended.`
    };
  }

  const blockedMild = scanned.some(
    (item) => item.field.block && item.result.severity === "mild"
  );
  if (blockedMild) {
    return {
      ok: false,
      status: 400,
      banned: false,
      error: "Please choose different wording — that contains language we don't allow here."
    };
  }

  return { ok: true, values: scanned.map((item) => item.result.censored) };
}

/** True if the user's account is currently banned. */
export async function isBanned(
  supabase: RpcClient,
  userId: string
): Promise<boolean> {
  const { data } = await (supabase.from("profiles") as ProfileStatusQuery)
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  return (data as { status?: string } | null)?.status === "banned";
}
