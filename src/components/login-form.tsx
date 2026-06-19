"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import {
  signInWithIdentifier,
  signUpWithEmail,
  type AuthFormState
} from "@/app/login/actions";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  isConfigured: boolean;
  oauthError?: boolean;
};

type Mode = "signin" | "signup";

export function LoginForm({ isConfigured, oauthError = false }: LoginFormProps) {
  const [mode, setMode] = useState<Mode>("signup");
  const [signInState, signInAction, signInPending] = useActionState<AuthFormState, FormData>(
    signInWithIdentifier,
    null
  );
  const [signUpState, signUpAction, signUpPending] = useActionState<AuthFormState, FormData>(
    signUpWithEmail,
    null
  );

  async function signInWithGoogle() {
    if (!isConfigured) {
      return;
    }

    const supabase = createClient();
    const origin = window.location.origin;

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
        queryParams: {
          prompt: "select_account"
        }
      }
    });
  }

  const activeState = mode === "signin" ? signInState : signUpState;

  return (
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand">
        <h1 id="login-title">Styla</h1>
        <p>AI Fashion Advisor</p>
      </div>

      <div className="auth-tabs" role="tablist" aria-label="Sign in or create an account">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin"}
          className={mode === "signin" ? "auth-tab is-active" : "auth-tab"}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          className={mode === "signup" ? "auth-tab is-active" : "auth-tab"}
          onClick={() => setMode("signup")}
        >
          Create account
        </button>
      </div>

      {mode === "signin" ? (
        <form className="auth-form" action={signInAction}>
          <label className="auth-field">
            <span>Email or username</span>
            <input
              name="identifier"
              type="text"
              autoComplete="username"
              placeholder="you@example.com"
              required
              disabled={!isConfigured || signInPending}
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              required
              disabled={!isConfigured || signInPending}
            />
          </label>
          <button className="auth-submit" type="submit" disabled={!isConfigured || signInPending}>
            {signInPending ? <Loader2 size={16} className="spin" aria-hidden="true" /> : null}
            {signInPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <form className="auth-form" action={signUpAction}>
          <label className="auth-field">
            <span>Email (optional)</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              disabled={!isConfigured || signUpPending}
            />
            <small className="auth-hint">Add one to enable password recovery.</small>
          </label>
          <label className="auth-field">
            <span>Username</span>
            <input
              name="username"
              type="text"
              autoComplete="username"
              placeholder="e.g. style_maven"
              pattern="[A-Za-z0-9_]{3,20}"
              title="3–20 letters, numbers, or underscores"
              required
              disabled={!isConfigured || signUpPending}
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              minLength={8}
              required
              disabled={!isConfigured || signUpPending}
            />
          </label>
          <label className="auth-field">
            <span>Confirm password</span>
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter your password"
              minLength={8}
              required
              disabled={!isConfigured || signUpPending}
            />
          </label>
          <button className="auth-submit" type="submit" disabled={!isConfigured || signUpPending}>
            {signUpPending ? <Loader2 size={16} className="spin" aria-hidden="true" /> : null}
            {signUpPending ? "Creating account…" : "Create account"}
          </button>
        </form>
      )}

      {activeState?.error ? (
        <p className="auth-message is-error" role="alert">
          {activeState.error}
        </p>
      ) : null}
      {activeState?.success ? (
        <p className="auth-message is-success" role="status">
          {activeState.success}
        </p>
      ) : null}
      {oauthError && !activeState ? (
        <p className="auth-message is-error" role="alert">
          Google sign-in didn&apos;t complete. Please try again.
        </p>
      ) : null}

      <div className="auth-or" aria-hidden="true">
        <span />
        <small>or</small>
        <span />
      </div>

      <button
        className="google-button"
        type="button"
        onClick={signInWithGoogle}
        disabled={!isConfigured}
      >
        <span className="google-mark">G</span>
        <span>Continue with Google</span>
        <ArrowRight size={18} strokeWidth={1.6} />
      </button>

      {!isConfigured ? (
        <p className="login-note">Add Supabase values to .env.local to enable sign-in.</p>
      ) : (
        <p className="login-note">
          By continuing you agree to let Styla analyze your wardrobe and provide
          personalized style recommendations.
        </p>
      )}
    </section>
  );
}
