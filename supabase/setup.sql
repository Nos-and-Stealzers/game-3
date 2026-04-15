-- Run this in Supabase SQL Editor
create table if not exists public.user_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_saves enable row level security;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  banned boolean not null default false,
  ban_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create or replace function public.is_admin_email(email_input text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(email_input, ''))) in (
    '9152@mail.cadott.k12.wi.us',
    'lucasgrimm854@gmail.com',
    'stealzers.com@gmail.com'
  );
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_admin_email(auth.jwt() ->> 'email');
$$;

create or replace function public.sync_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.user_profiles (user_id, email, created_at, updated_at)
  values (new.id, lower(coalesce(new.email, '')), now(), now())
  on conflict (user_id)
  do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_changed_sync_profile on auth.users;
create trigger on_auth_user_changed_sync_profile
after insert or update on auth.users
for each row execute procedure public.sync_user_profile();

insert into public.user_profiles (user_id, email, created_at, updated_at)
select u.id, lower(coalesce(u.email, '')), coalesce(u.created_at, now()), now()
from auth.users u
on conflict (user_id)
do update
  set email = excluded.email,
      updated_at = now();

drop policy if exists "Users can read own save" on public.user_saves;
drop policy if exists "Users can insert own save" on public.user_saves;
drop policy if exists "Users can update own save" on public.user_saves;

create policy "Users can read own save"
  on public.user_saves
  for select
  using (
    auth.uid() = user_id
    and not exists (
      select 1
      from public.user_profiles p
      where p.user_id = auth.uid()
        and p.banned = true
    )
  );

create policy "Users can insert own save"
  on public.user_saves
  for insert
  with check (
    auth.uid() = user_id
    and not exists (
      select 1
      from public.user_profiles p
      where p.user_id = auth.uid()
        and p.banned = true
    )
  );

create policy "Users can update own save"
  on public.user_saves
  for update
  using (
    auth.uid() = user_id
    and not exists (
      select 1
      from public.user_profiles p
      where p.user_id = auth.uid()
        and p.banned = true
    )
  )
  with check (
    auth.uid() = user_id
    and not exists (
      select 1
      from public.user_profiles p
      where p.user_id = auth.uid()
        and p.banned = true
    )
  );

drop policy if exists "Users can read own profile" on public.user_profiles;
drop policy if exists "Users can update own profile" on public.user_profiles;
drop policy if exists "Admins can read all profiles" on public.user_profiles;
drop policy if exists "Admins can update all profiles" on public.user_profiles;

create policy "Users can read own profile"
  on public.user_profiles
  for select
  using (auth.uid() = user_id);

create policy "Users can update own profile"
  on public.user_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Admins can read all profiles"
  on public.user_profiles
  for select
  using (public.current_user_is_admin());

create policy "Admins can update all profiles"
  on public.user_profiles
  for update
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  banned boolean,
  ban_reason text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.id,
    lower(coalesce(u.email, p.email, '')) as email,
    u.created_at,
    u.last_sign_in_at,
    coalesce(p.banned, false) as banned,
    p.ban_reason
  from auth.users u
  left join public.user_profiles p on p.user_id = u.id
  where public.current_user_is_admin()
  order by u.created_at desc;
$$;

create or replace function public.admin_set_ban(target_user_id uuid, should_ban boolean, reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_email text;
begin
  if not public.current_user_is_admin() then
    raise exception 'Not authorized.';
  end if;

  if target_user_id is null then
    raise exception 'Target user is required.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot ban your own account.';
  end if;

  select lower(coalesce(email, '')) into target_email
  from auth.users
  where id = target_user_id;

  if target_email is null then
    raise exception 'User not found.';
  end if;

  insert into public.user_profiles (user_id, email, banned, ban_reason, updated_at)
  values (target_user_id, target_email, should_ban, reason, now())
  on conflict (user_id)
  do update
    set email = excluded.email,
        banned = excluded.banned,
        ban_reason = excluded.ban_reason,
        updated_at = now();

  if should_ban then
    delete from public.user_saves where user_id = target_user_id;
  end if;

  return true;
end;
$$;

create or replace function public.admin_delete_account(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Not authorized.';
  end if;

  if target_user_id is null then
    raise exception 'Target user is required.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot delete your own account.';
  end if;

  delete from public.user_saves where user_id = target_user_id;
  delete from public.user_profiles where user_id = target_user_id;
  delete from auth.users where id = target_user_id;

  return true;
end;
$$;

revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_set_ban(uuid, boolean, text) from public;
revoke all on function public.admin_delete_account(uuid) from public;

grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_ban(uuid, boolean, text) to authenticated;
grant execute on function public.admin_delete_account(uuid) to authenticated;
