-- Run this in Supabase SQL Editor
create table if not exists public.user_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_saves enable row level security;

drop policy if exists "Users can read own save" on public.user_saves;
drop policy if exists "Users can insert own save" on public.user_saves;
drop policy if exists "Users can update own save" on public.user_saves;

create policy "Users can read own save"
  on public.user_saves
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own save"
  on public.user_saves
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own save"
  on public.user_saves
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
