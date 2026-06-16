"use client";

import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  isConfigured: boolean;
};

export function LoginForm({ isConfigured }: LoginFormProps) {
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

  return (
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand">
        <h1 id="login-title">Styla</h1>
        <p>AI Fashion Advisor</p>
      </div>

      <div className="login-divider">
        <span />
        <strong>Sign in to continue</strong>
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
        <p className="login-note">
          Add Supabase values to .env.local to enable Google sign-in.
        </p>
      ) : (
        <p className="login-note">
          By signing in you agree to let Styla analyze your wardrobe and provide
          personalized style recommendations.
        </p>
      )}
    </section>
  );
}
