"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { destinationForUser } from "@/lib/supabase/post-auth";
import { createClient } from "@/lib/supabase/server";

// Username-only sign-ups still need a unique address for Supabase Auth, so we
// mint a synthetic, non-routable one on the RFC 2606 reserved ".invalid" TLD.
// Must match the suffix handled in migration 202606180003_optional_email_signup.sql.
const PLACEHOLDER_EMAIL_DOMAIN = "placeholder.invalid";

export type AuthFormState = {
  error?: string;
  success?: string;
} | null;

const signInSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or username."),
  password: z.string().min(1, "Enter your password.")
});

const signUpSchema = z
  .object({
    // Email is optional: blank means a username-only account.
    email: z
      .string()
      .trim()
      .toLowerCase()
      .refine((value) => value === "" || z.string().email().safeParse(value).success, {
        message: "Enter a valid email address."
      }),
    username: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9_]{3,20}$/,
        "Username must be 3–20 letters, numbers, or underscores."
      ),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Those passwords don't match.",
    path: ["confirmPassword"]
  });

export async function signInWithIdentifier(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const supabase = await createClient();
  if (!supabase) {
    return { error: "Authentication isn't configured yet." };
  }

  const parsed = signInSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password")
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details and try again." };
  }

  const { identifier, password } = parsed.data;

  // Email-shaped identifiers skip the DB entirely; usernames resolve via the
  // SECURITY DEFINER function (resolve_login_email), which returns null if no
  // such username exists.
  let email: string | null = null;
  if (identifier.includes("@")) {
    email = identifier.toLowerCase();
  } else {
    const { data, error } = await supabase.rpc("resolve_login_email", { identifier });
    if (error) {
      return { error: "Username sign-in isn't available yet — try your email instead." };
    }
    email = (data as string | null) ?? null;
  }

  if (!email) {
    return { error: "We couldn't find an account with that email or username." };
  }

  const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: friendlySignInError(error.message) };
  }

  const userId = signIn.user?.id;
  if (!userId) {
    return { error: "Something went wrong signing you in. Please try again." };
  }

  redirect(await destinationForUser(supabase, userId));
}

export async function signUpWithEmail(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const supabase = await createClient();
  if (!supabase) {
    return { error: "Authentication isn't configured yet." };
  }

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    username: formData.get("username"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword")
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details and try again." };
  }

  const { email, username, password } = parsed.data;
  const providedEmail = email.length > 0 ? email : null;

  // Reject taken usernames up front so we never create an account that then
  // silently falls back to an auto-generated handle.
  const { data: usernameAvailable, error: usernameError } = await supabase.rpc(
    "is_username_available",
    { candidate: username }
  );
  if (usernameError) {
    return { error: "Username sign-up isn't available yet — run the latest database migration." };
  }
  if (usernameAvailable === false) {
    return { error: "That username is taken. Try another one." };
  }

  // Supabase requires an email for password auth, so username-only sign-ups get a
  // synthetic, non-routable address. The handle_new_user() trigger keeps these out
  // of profiles.email, and resolve_login_email() reads the real auth email, so
  // username login still works.
  const authEmail = providedEmail ?? `${username.toLowerCase()}@${PLACEHOLDER_EMAIL_DOMAIN}`;

  // The username rides along as auth metadata; the handle_new_user() trigger
  // applies it to the new profile (with the same availability guard).
  const { data, error } = await supabase.auth.signUp({
    email: authEmail,
    password,
    options: { data: { username } }
  });
  if (error) {
    return { error: friendlySignUpError(error.message) };
  }

  // Supabase signals "email already in use" with an obfuscated user that has no
  // identities. This keeps a new real-email signup from colliding with an existing
  // Google account on the same address. (Synthetic addresses are unique per
  // username, so this never trips for username-only signups.)
  if (providedEmail && data.user && (data.user.identities?.length ?? 0) === 0) {
    return {
      error:
        "An account with this email already exists. Try signing in, or use Continue with Google."
    };
  }

  // With email confirmation disabled, sign-up returns a live session and the
  // user is logged straight in.
  if (data.session && data.user) {
    redirect(await destinationForUser(supabase, data.user.id));
  }

  // Fallback for if email confirmation is later turned back on in Supabase.
  return {
    success: providedEmail
      ? `Almost there — check ${providedEmail} for a link to confirm your account, then sign in.`
      : "Your account is ready — sign in with your username and password."
  };
}

function friendlySignInError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "Incorrect email/username or password.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Please confirm your email before signing in.";
  }
  return message;
}

function friendlySignUpError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("already registered") || normalized.includes("already been registered")) {
    return "An account with this email already exists. Try signing in, or use Continue with Google.";
  }
  if (normalized.includes("password")) {
    // Surfaces Supabase's own policy text, e.g. "Password should be at least N characters".
    return message;
  }
  if (normalized.includes("valid email") || normalized.includes("invalid email")) {
    return "Enter a valid email address.";
  }
  return message;
}
