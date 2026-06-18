# Styla

Phase 1 implements the Styla foundation:

- Next.js App Router and TypeScript
- Supabase Google-only auth helpers
- Login page matched to the uploaded visual reference
- Protected app shell and navigation
- Five-step Style DNA onboarding
- Supabase migration for `profiles` and `style_dna`

Phase 2 adds:

- Supabase `wardrobe_items` table
- `wardrobe-items` Storage bucket
- Wardrobe upload/dropzone UI
- Lightweight client-side background cleanup
- Server-side Gemini clothing categorization
- Type/color/season filters, stats, grouped cards, and delete

Phase 3 adds:

- Gemini outfit generation from the user's real wardrobe
- Occasion, mood, and weather controls
- Three generated look cards with wardrobe item photos
- Save Outfit persistence through `outfits` and `outfit_items`

Phase 4 adds:

- Outfit Check upload flow
- Style goal selection
- Gemini image evaluation using Style DNA, wardrobe, and saved outfit context
- Structured score, summary, strengths, fixes, fit notes, color notes, and missing-piece suggestions

Phase 5 adds:

- Saved outfit library with Mine and Saved tabs
- Outfit cards with tags, item thumbnails, saved date, and AI styling copy
- Share links for generated outfits
- Public shared outfit pages
- Bookmark table foundation for the later social phase

Phase 6 adds:

- Chat with Styla
- Suggested starter prompts
- Persisted chat history
- Stateless Gemini calls with Style DNA, wardrobe, saved outfits, and recent chat context
- Enter to send and Shift+Enter for new lines

Phase 7 adds:

- Profile editing
- Style DNA editing from the Profile tab
- Profile photo upload through Supabase Storage
- Public profile and show-outfits toggles
- Free/Pro/Elite membership UI state

Phase 8 adds:

- Explore public outfit feed
- Search for public profiles and shared looks
- Public `/u/[username]` profile pages
- Follow/unfollow, likes, bookmarks, and share-copy actions
- App-wide responsive UI polish and Styla logo asset

Messages adds:

- Private direct-message conversations between users
- Message entry point from public profile pages
- Saved/public outfit attachments inside DMs
- Protected conversation and message RLS
- Professional responsive inbox UI

Payments adds:

- Optional Stripe Payment Link buttons for Pro and Elite
- No feature gating between plans in v1
- Payments remain Stripe-hosted for the simplest production setup

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.example` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK=
NEXT_PUBLIC_STRIPE_ELITE_PAYMENT_LINK=
```

3. Apply the Supabase migrations:

```bash
supabase db push
```

Or paste and run these files in the Supabase SQL editor:

- `supabase/migrations/202606160001_phase1_auth_onboarding.sql`
- `supabase/migrations/202606160002_phase2_wardrobe.sql`
- `supabase/migrations/202606160003_phase3_outfit_generation.sql`
- `supabase/migrations/202606160004_phase5_outfit_library.sql`
- `supabase/migrations/202606160005_fix_outfit_item_rls_recursion.sql`
- `supabase/migrations/202606160006_phase6_chat_messages.sql`
- `supabase/migrations/202606160007_phase7_profile_settings.sql`
- `supabase/migrations/202606160008_phase8_social_discovery.sql`
- `supabase/migrations/202606160009_direct_messages.sql`

4. Run the app:

```bash
npm run dev
```

The local app runs at `http://localhost:3000`.

## Deploying

> For a step-by-step Vercel checklist (env vars, redirect URLs, migrations), see [DEPLOYMENT.md](DEPLOYMENT.md).

Deploy with Vercel using the same environment variables from `.env.local`.

In Supabase, add both local and production auth redirect URLs:

- `http://localhost:3000/auth/callback`
- `https://YOUR-VERCEL-DOMAIN.vercel.app/auth/callback`

In Vercel, use:

- Build command: `npm run build`
- Install command: `npm install`
- Output: Next.js default

After deploy, update Google OAuth authorized redirect URIs and Supabase redirect URLs with the final production domain.

## Stripe Payment Links

The simplest real payment setup is Stripe Payment Links:

1. Create Stripe products/prices for Pro and Elite.
2. Create a Payment Link for each paid plan.
3. Add the links to Vercel and `.env.local`:

```bash
NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK=
NEXT_PUBLIC_STRIPE_ELITE_PAYMENT_LINK=
```

4. Add your bank account in Stripe Dashboard payout settings.

This v1 keeps all app features the same across Free, Pro, and Elite. If you later want automatic plan syncing after payment, add Stripe webhooks for `checkout.session.completed` and update `profiles.membership_tier`.
