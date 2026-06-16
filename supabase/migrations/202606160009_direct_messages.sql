create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  member_low uuid not null references public.profiles(id) on delete cascade,
  member_high uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (member_low <> member_high),
  unique (member_low, member_high)
);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  outfit_id uuid references public.outfits(id) on delete set null,
  created_at timestamptz not null default now(),
  check (length(trim(body)) > 0 or outfit_id is not null)
);

create index if not exists dm_conversations_member_low_idx
  on public.dm_conversations (member_low, last_message_at desc);

create index if not exists dm_conversations_member_high_idx
  on public.dm_conversations (member_high, last_message_at desc);

create index if not exists dm_messages_conversation_created_idx
  on public.dm_messages (conversation_id, created_at asc);

alter table public.dm_conversations enable row level security;
alter table public.dm_messages enable row level security;

drop policy if exists "Users can read own dm conversations" on public.dm_conversations;
create policy "Users can read own dm conversations"
  on public.dm_conversations for select
  using (auth.uid() = member_low or auth.uid() = member_high);

drop policy if exists "Users can create own dm conversations" on public.dm_conversations;
create policy "Users can create own dm conversations"
  on public.dm_conversations for insert
  with check (auth.uid() = member_low or auth.uid() = member_high);

drop policy if exists "Users can update own dm conversations" on public.dm_conversations;
create policy "Users can update own dm conversations"
  on public.dm_conversations for update
  using (auth.uid() = member_low or auth.uid() = member_high)
  with check (auth.uid() = member_low or auth.uid() = member_high);

drop policy if exists "Users can read messages in own conversations" on public.dm_messages;
create policy "Users can read messages in own conversations"
  on public.dm_messages for select
  using (
    exists (
      select 1
      from public.dm_conversations
      where dm_conversations.id = dm_messages.conversation_id
        and (dm_conversations.member_low = auth.uid() or dm_conversations.member_high = auth.uid())
    )
  );

drop policy if exists "Users can send messages in own conversations" on public.dm_messages;
create policy "Users can send messages in own conversations"
  on public.dm_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.dm_conversations
      where dm_conversations.id = dm_messages.conversation_id
        and (dm_conversations.member_low = auth.uid() or dm_conversations.member_high = auth.uid())
    )
    and (
      outfit_id is null
      or exists (
        select 1
        from public.outfits
        where outfits.id = dm_messages.outfit_id
          and (outfits.user_id = auth.uid() or outfits.is_public = true)
      )
    )
  );

drop policy if exists "Profiles visible to dm partners" on public.profiles;
create policy "Profiles visible to dm partners"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.dm_conversations
      where (
        (dm_conversations.member_low = auth.uid() and dm_conversations.member_high = profiles.id)
        or (dm_conversations.member_high = auth.uid() and dm_conversations.member_low = profiles.id)
      )
    )
  );
