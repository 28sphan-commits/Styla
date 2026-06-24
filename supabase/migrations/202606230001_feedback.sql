-- User feedback table. Stores messages sent from the profile page.
-- Each row counts toward the "send_feedback" quest metric.

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  message     text not null check (char_length(message) between 1 and 2000),
  created_at  timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "Users can insert their own feedback"
  on public.feedback for insert
  with check (auth.uid() = user_id);

create policy "Users can read their own feedback"
  on public.feedback for select
  using (auth.uid() = user_id);
