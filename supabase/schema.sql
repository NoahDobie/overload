-- Overload: one JSON document per user. Paste into Supabase → SQL Editor → Run.

create table if not exists public.user_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  doc        jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

-- Each signed-in user can only see and write their own row.
create policy "own row: select" on public.user_state
  for select using (auth.uid() = user_id);

create policy "own row: insert" on public.user_state
  for insert with check (auth.uid() = user_id);

create policy "own row: update" on public.user_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own row: delete" on public.user_state
  for delete using (auth.uid() = user_id);
