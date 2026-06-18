# Deploying Styla to Vercel

Checklist for a production deploy. Replace `<your-domain>` with your real Vercel
domain (e.g. `styla.vercel.app` or a custom domain) once you have it.

> Secrets are **not** committed here. Copy the actual key values from your local
> `.env.local` (which is gitignored).

## 1. Vercel environment variables

Set these in **Project → Settings → Environment Variables**, scoped to
**Production** (add **Preview** too if you want preview deploys to work).
`NEXT_PUBLIC_*` vars are **inlined at build time**, so they must exist *before*
the build, and changing one requires a **redeploy**.

| Variable | Value | Secret? | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://fjzinxngrqazjpefwzjt.supabase.co` | No | client-exposed by design |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | _(copy from `.env.local`)_ | No | public anon key; RLS-protected |
| `GEMINI_API_KEY` | _(copy from `.env.local`)_ | **Yes** | **no `NEXT_PUBLIC_` prefix** — keeps it server-only |
| `GEMINI_MODEL` | `gemini-2.5-flash` | No | ⚠️ required — the code default `gemini-3.5-flash` 404s for this key |
| `NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK` | _(your Stripe link, or omit)_ | No | optional |
| `NEXT_PUBLIC_STRIPE_ELITE_PAYMENT_LINK` | _(your Stripe link, or omit)_ | No | optional |

Do **not** set `NEXT_PUBLIC_SUPABASE_ANON_KEY` separately — it is only a fallback
that the publishable key already covers.

## 2. Supabase → Authentication → URL Configuration

- **Site URL:** `https://<your-domain>`
- **Redirect URLs** (allow-list — add these, keep the local one):
  - `https://<your-domain>/auth/callback`
  - `http://localhost:3001/auth/callback`  ← keep for local dev (note port **3001**)

The app builds `redirectTo` from `window.location.origin + /auth/callback`, so the
production URL must match an allow-listed entry **exactly** (scheme + host + path,
no trailing slash).

## 3. Google Cloud OAuth client

**APIs & Services → Credentials → your OAuth 2.0 Client → Authorized redirect URIs**

- Add (if not already present):
  `https://fjzinxngrqazjpefwzjt.supabase.co/auth/v1/callback`

This is the **only** Google entry needed — Google redirects to Supabase, which
then redirects to your app. Do not add the Vercel domain to Google. (If local
Google sign-in already works, this is likely set.)

## 4. Build settings (auto-detected; pinned in `vercel.json`)

- Framework preset: **Next.js**
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: **default** (Vercel manages the Next.js `.next` output)

## 5. Required before prod actually works

- **Apply all DB migrations** to Supabase — especially the two newest, which are
  not yet applied, in order:
  1. `supabase/migrations/202606170001_new_user_defaults.sql`
  2. `supabase/migrations/202606170002_backfill_existing_profiles.sql`
- Free-tier Gemini may return occasional transient errors under load (expected).

## Order of operations (first deploy)

1. Set the env vars (Section 1) → deploy.
2. Vercel assigns `https://<project>.vercel.app` → put it into **Site URL** +
   **Redirect URLs** (Section 2). No rebuild needed — Supabase config is runtime
   and the app reads the origin at runtime.
3. Confirm the Google redirect URI (Section 3) and apply migrations (Section 5).
4. Test **Continue with Google** on the live domain → should land on `/explore`
   (or `/onboarding` for a new account).

**#1 failure mode:** sign-in bounces back to `/login` → the exact
`https://<your-domain>/auth/callback` string is missing from the Supabase
Redirect URLs.
