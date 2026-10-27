-- Overload: one JSON document per user. Paste into Supabase → SQL Editor → Run.

create table if not exists public.user_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  doc        jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

-- Each signed-in user can only see and write their own row.
create policy "own row: select" on public.user_state
  for select using ((select auth.uid()) = user_id);

create policy "own row: insert" on public.user_state
  for insert with check ((select auth.uid()) = user_id);

create policy "own row: update" on public.user_state
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own row: delete" on public.user_state
  for delete using ((select auth.uid()) = user_id);

-- Keep any one account's document to 1 MB (years of training are well under that).
alter table public.user_state
  add constraint doc_max_1mb check (pg_column_size(doc) <= 1048576);
