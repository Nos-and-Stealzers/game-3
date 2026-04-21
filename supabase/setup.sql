-- Run this in Supabase SQL Editor
create extension if not exists pgcrypto;

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

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  username text,
  language text,
  time_zone text,
  email_updates boolean not null default false,
  game_alerts boolean not null default true,
  profile_public boolean not null default false,
  show_online boolean not null default true,
  avatar_url text,
  bio text,
  custom_status text,
  pronouns text,
  accent_color text,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

alter table public.user_settings add column if not exists display_name text;
alter table public.user_settings add column if not exists username text;
alter table public.user_settings add column if not exists language text;
alter table public.user_settings add column if not exists time_zone text;
alter table public.user_settings add column if not exists email_updates boolean not null default false;
alter table public.user_settings add column if not exists game_alerts boolean not null default true;
alter table public.user_settings add column if not exists profile_public boolean not null default false;
alter table public.user_settings add column if not exists show_online boolean not null default true;
alter table public.user_settings add column if not exists avatar_url text;
alter table public.user_settings add column if not exists bio text;
alter table public.user_settings add column if not exists custom_status text;
alter table public.user_settings add column if not exists pronouns text;
alter table public.user_settings add column if not exists accent_color text;
alter table public.user_settings add column if not exists updated_at timestamptz not null default now();

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'online',
  current_game_id text,
  current_game_title text,
  message_opt_in boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_presence enable row level security;

create table if not exists public.friend_links (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  friend_user_id uuid not null references auth.users(id) on delete cascade,
  friend_email text not null,
  note text,
  can_message boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, friend_user_id)
);

alter table public.friend_links enable row level security;

create table if not exists public.friend_messages (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.friend_messages enable row level security;

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  actor_email text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_activity_logs enable row level security;

create index if not exists admin_activity_logs_created_at_idx
  on public.admin_activity_logs (created_at desc);

create index if not exists admin_activity_logs_action_idx
  on public.admin_activity_logs (action);

create index if not exists admin_activity_logs_actor_email_idx
  on public.admin_activity_logs (actor_email);

create index if not exists admin_activity_logs_target_email_idx
  on public.admin_activity_logs (target_email);

create table if not exists public.user_staff_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('moderator', 'admin')),
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.user_staff_roles enable row level security;

create index if not exists user_staff_roles_role_idx
  on public.user_staff_roles (role);

create index if not exists user_staff_roles_user_idx
  on public.user_staff_roles (user_id);

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

create or replace function public.current_user_staff_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when public.is_admin_email(auth.jwt() ->> 'email') then 'admin'
    when exists (
      select 1
      from public.user_staff_roles r
      where r.user_id = auth.uid()
        and r.role = 'admin'
    ) then 'admin'
    when exists (
      select 1
      from public.user_staff_roles r
      where r.user_id = auth.uid()
        and r.role = 'moderator'
    ) then 'moderator'
    else null
  end;
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_user_staff_role() = 'admin';
$$;

create or replace function public.current_user_is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_user_staff_role() in ('admin', 'moderator');
$$;

create or replace function public.public_online_user_count()
returns integer
language sql
stable
security definer
set search_path = public, auth
as $$
  select count(*)::integer
  from public.user_presence pres
  left join public.user_profiles prof on prof.user_id = pres.user_id
  left join public.user_settings settings on settings.user_id = pres.user_id
  where coalesce(settings.show_online, true)
    and coalesce(prof.banned, false) = false
    and pres.updated_at is not null
    and pres.updated_at > now() - interval '15 minutes'
    and coalesce(pres.status, 'offline') in ('online', 'playing');
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

drop policy if exists "Users can read own settings" on public.user_settings;
drop policy if exists "Users can insert own settings" on public.user_settings;
drop policy if exists "Users can update own settings" on public.user_settings;

create policy "Users can read own settings"
  on public.user_settings
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own settings"
  on public.user_settings
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own settings"
  on public.user_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.upsert_my_user_settings(target_user_id uuid, payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized.';
  end if;

  if target_user_id is null then
    raise exception 'Target user is required.';
  end if;

  if target_user_id <> auth.uid() then
    raise exception 'You can only update your own settings.';
  end if;

  insert into public.user_settings (
    user_id,
    display_name,
    username,
    language,
    time_zone,
    email_updates,
    game_alerts,
    profile_public,
    show_online,
    avatar_url,
    bio,
    custom_status,
    pronouns,
    accent_color,
    updated_at
  )
  values (
    auth.uid(),
    coalesce(payload ->> 'displayName', payload ->> 'display_name'),
    coalesce(payload ->> 'username', ''),
    coalesce(payload ->> 'language', 'en'),
    coalesce(payload ->> 'timeZone', payload ->> 'time_zone', 'UTC'),
    coalesce((payload ->> 'emailUpdates')::boolean, false),
    coalesce((payload ->> 'gameAlerts')::boolean, true),
    coalesce((payload ->> 'profilePublic')::boolean, false),
    coalesce((payload ->> 'showOnline')::boolean, true),
    nullif(coalesce(payload ->> 'avatarUrl', payload ->> 'avatar_url', ''), ''),
    nullif(coalesce(payload ->> 'bio', ''), ''),
    nullif(coalesce(payload ->> 'customStatus', payload ->> 'custom_status', ''), ''),
    nullif(coalesce(payload ->> 'pronouns', ''), ''),
    nullif(coalesce(payload ->> 'accentColor', payload ->> 'accent_color', ''), ''),
    now()
  )
  on conflict (user_id)
  do update
    set display_name = excluded.display_name,
        username = excluded.username,
        language = excluded.language,
        time_zone = excluded.time_zone,
        email_updates = excluded.email_updates,
        game_alerts = excluded.game_alerts,
        profile_public = excluded.profile_public,
        show_online = excluded.show_online,
        avatar_url = excluded.avatar_url,
        bio = excluded.bio,
        custom_status = excluded.custom_status,
        pronouns = excluded.pronouns,
        accent_color = excluded.accent_color,
        updated_at = now();

  return true;
end;
$$;

drop policy if exists "Users can read own profile" on public.user_profiles;
drop policy if exists "Users can update own profile" on public.user_profiles;
drop policy if exists "Admins can read all profiles" on public.user_profiles;
drop policy if exists "Admins can update all profiles" on public.user_profiles;

drop policy if exists "Users can read own presence" on public.user_presence;
drop policy if exists "Users can insert own presence" on public.user_presence;
drop policy if exists "Users can update own presence" on public.user_presence;

create policy "Users can read own presence"
  on public.user_presence
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own presence"
  on public.user_presence
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own presence"
  on public.user_presence
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own friend links" on public.friend_links;
drop policy if exists "Users can insert own friend links" on public.friend_links;
drop policy if exists "Users can update own friend links" on public.friend_links;
drop policy if exists "Users can delete own friend links" on public.friend_links;

create policy "Users can read own friend links"
  on public.friend_links
  for select
  using (auth.uid() = owner_user_id);

create policy "Users can insert own friend links"
  on public.friend_links
  for insert
  with check (auth.uid() = owner_user_id);

create policy "Users can update own friend links"
  on public.friend_links
  for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy "Users can delete own friend links"
  on public.friend_links
  for delete
  using (auth.uid() = owner_user_id);

drop policy if exists "Users can read own friend messages" on public.friend_messages;
drop policy if exists "Users can insert own friend messages" on public.friend_messages;
drop policy if exists "Users can update own friend messages" on public.friend_messages;

create policy "Users can read own friend messages"
  on public.friend_messages
  for select
  using (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

create policy "Users can insert own friend messages"
  on public.friend_messages
  for insert
  with check (auth.uid() = sender_user_id);

create policy "Users can update own friend messages"
  on public.friend_messages
  for update
  using (auth.uid() = recipient_user_id)
  with check (auth.uid() = recipient_user_id);

create or replace function public.upsert_my_presence(
  current_game_id text default null,
  current_game_title text default null,
  status text default 'online',
  message_opt_in boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized.';
  end if;

  insert into public.user_presence (user_id, status, current_game_id, current_game_title, message_opt_in, updated_at)
  values (
    auth.uid(),
    case when trim(coalesce(status, '')) = '' then 'online' else left(trim(status), 32) end,
    nullif(trim(coalesce(current_game_id, '')), ''),
    nullif(trim(coalesce(current_game_title, '')), ''),
    coalesce(message_opt_in, true),
    now()
  )
  on conflict (user_id)
  do update
    set status = excluded.status,
        current_game_id = excluded.current_game_id,
        current_game_title = excluded.current_game_title,
        message_opt_in = excluded.message_opt_in,
        updated_at = now();

  return true;
end;
$$;

create or replace function public.upsert_friend_link(friend_email text, note text default null, can_message boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
  target_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authorized.';
  end if;

  select id, lower(coalesce(email, '')) into target_user_id, target_email
  from auth.users
  where lower(coalesce(email, '')) = lower(trim(coalesce(friend_email, '')))
  limit 1;

  if target_user_id is null then
    raise exception 'No account found for that email.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot add yourself.';
  end if;

  insert into public.friend_links (owner_user_id, friend_user_id, friend_email, note, can_message, updated_at)
  values (
    auth.uid(),
    target_user_id,
    target_email,
    nullif(trim(coalesce(note, '')), ''),
    coalesce(can_message, true),
    now()
  )
  on conflict (owner_user_id, friend_user_id)
  do update
    set friend_email = excluded.friend_email,
        note = excluded.note,
        can_message = excluded.can_message,
        updated_at = now();

  return true;
end;
$$;

create or replace function public.remove_friend_link(target_friend_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized.';
  end if;

  delete from public.friend_links
  where owner_user_id = auth.uid()
    and public.friend_links.friend_user_id = target_friend_user_id;

  return true;
end;
$$;

create or replace function public.list_my_friends()
returns table (
  friend_user_id uuid,
  friend_email text,
  display_name text,
  username text,
  current_game_id text,
  current_game_title text,
  status text,
  message_opt_in boolean,
  can_message boolean,
  note text,
  updated_at timestamptz,
  mutual boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select
    fl.friend_user_id,
    fl.friend_email,
    coalesce(nullif(trim(us.display_name), ''), split_part(fl.friend_email, '@', 1), fl.friend_email) as display_name,
    coalesce(nullif(trim(us.username), ''), split_part(fl.friend_email, '@', 1)) as username,
    case
      when reciprocal.is_mutual and coalesce(pres.updated_at, now() - interval '1 day') > now() - interval '15 minutes' then pres.current_game_id
      else null
    end as current_game_id,
    case
      when reciprocal.is_mutual and coalesce(pres.updated_at, now() - interval '1 day') > now() - interval '15 minutes' then pres.current_game_title
      else null
    end as current_game_title,
    case
      when reciprocal.is_mutual and coalesce(pres.updated_at, now() - interval '1 day') > now() - interval '15 minutes' then coalesce(pres.status, 'online')
      when reciprocal.is_mutual then 'offline'
      else 'pending'
    end as status,
    case
      when reciprocal.is_mutual and coalesce(pres.updated_at, now() - interval '1 day') > now() - interval '15 minutes' then coalesce(pres.message_opt_in, false)
      else false
    end as message_opt_in,
    fl.can_message and reciprocal.is_mutual as can_message,
    fl.note,
    greatest(fl.updated_at, coalesce(pres.updated_at, fl.updated_at)) as updated_at,
    reciprocal.is_mutual as mutual
  from public.friend_links fl
  left join public.user_settings us on us.user_id = fl.friend_user_id
  left join public.user_presence pres on pres.user_id = fl.friend_user_id
  left join lateral (
    select exists(
      select 1
      from public.friend_links reverse_link
      where reverse_link.owner_user_id = fl.friend_user_id
        and reverse_link.friend_user_id = fl.owner_user_id
    ) as is_mutual
  ) reciprocal on true
  where fl.owner_user_id = auth.uid()
  order by reciprocal.is_mutual desc, display_name asc;
$$;

create or replace function public.send_friend_message(recipient_user_id uuid, body text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  message_id uuid;
  clean_body text;
begin
  if auth.uid() is null then
    raise exception 'Not authorized.';
  end if;

  clean_body := nullif(trim(coalesce(body, '')), '');
  if recipient_user_id is null then
    raise exception 'Recipient is required.';
  end if;
  if recipient_user_id = auth.uid() then
    raise exception 'You cannot message yourself.';
  end if;
  if clean_body is null then
    raise exception 'Message cannot be blank.';
  end if;
  if length(clean_body) > 1000 then
    raise exception 'Message is too long.';
  end if;

  if not exists (
    select 1 from public.friend_links fl
    where fl.owner_user_id = auth.uid()
      and fl.friend_user_id = recipient_user_id
      and fl.can_message = true
  ) then
    raise exception 'You can only message mutual friends.';
  end if;

  if not exists (
    select 1 from public.friend_links fl
    where fl.owner_user_id = recipient_user_id
      and fl.friend_user_id = auth.uid()
      and fl.can_message = true
  ) then
    raise exception 'That friend has not opted into messaging yet.';
  end if;

  insert into public.friend_messages (sender_user_id, recipient_user_id, body)
  values (auth.uid(), recipient_user_id, clean_body)
  returning id into message_id;

  return message_id;
end;
$$;

create or replace function public.list_my_unread_friend_messages(limit_count integer default 20)
returns table (
  message_id uuid,
  sender_user_id uuid,
  sender_email text,
  sender_display_name text,
  sender_username text,
  sender_current_game_title text,
  body text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    m.id,
    m.sender_user_id,
    lower(coalesce(su.email, sp.email, '')) as sender_email,
    coalesce(nullif(trim(us.display_name), ''), split_part(lower(coalesce(su.email, sp.email, '')), '@', 1), 'Friend') as sender_display_name,
    coalesce(nullif(trim(us.username), ''), split_part(lower(coalesce(su.email, sp.email, '')), '@', 1)) as sender_username,
    case
      when coalesce(p.updated_at, now() - interval '1 day') > now() - interval '15 minutes' then p.current_game_title
      else null
    end as sender_current_game_title,
    m.body,
    m.created_at
  from public.friend_messages m
  left join auth.users su on su.id = m.sender_user_id
  left join public.user_profiles sp on sp.user_id = m.sender_user_id
  left join public.user_settings us on us.user_id = m.sender_user_id
  left join public.user_presence p on p.user_id = m.sender_user_id
  where m.recipient_user_id = auth.uid()
    and m.read_at is null
  order by m.created_at desc
  limit greatest(1, least(coalesce(limit_count, 20), 50));
$$;

create or replace function public.mark_friend_message_read(message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized.';
  end if;

  update public.friend_messages
  set read_at = now()
  where id = message_id
    and recipient_user_id = auth.uid();

  return true;
end;
$$;

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

drop policy if exists "Admins can read admin activity logs" on public.admin_activity_logs;

create policy "Admins can read admin activity logs"
  on public.admin_activity_logs
  for select
  using (public.current_user_is_admin());

create or replace function public.admin_log_action(
  target_user_id uuid,
  target_email text,
  action text,
  details jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_email text;
begin
  if not public.current_user_is_moderator() then
    raise exception 'Not authorized.';
  end if;

  select lower(coalesce(email, '')) into actor_email
  from auth.users
  where id = auth.uid();

  insert into public.admin_activity_logs (
    actor_user_id,
    actor_email,
    target_user_id,
    target_email,
    action,
    details,
    created_at
  )
  values (
    auth.uid(),
    coalesce(actor_email, ''),
    target_user_id,
    nullif(lower(trim(coalesce(target_email, ''))), ''),
    left(trim(coalesce(action, 'unknown')), 64),
    coalesce(details, '{}'::jsonb),
    now()
  );

  return true;
end;
$$;

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  staff_role text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  banned boolean,
  ban_reason text,
  presence_status text,
  presence_updated_at timestamptz,
  current_game_title text,
  is_online boolean,
  in_tab boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.id,
    lower(coalesce(u.email, p.email, '')) as email,
    case
      when public.is_admin_email(auth.jwt() ->> 'email') then 'admin'
      when exists (
        select 1
        from public.user_staff_roles r
        where r.user_id = u.id
          and r.role = 'admin'
      ) then 'admin'
      when exists (
        select 1
        from public.user_staff_roles r
        where r.user_id = u.id
          and r.role = 'moderator'
      ) then 'moderator'
      else null
    end as staff_role,
    u.created_at,
    u.last_sign_in_at,
    coalesce(p.banned, false) as banned,
    p.ban_reason,
    coalesce(pres.status, 'offline') as presence_status,
    pres.updated_at as presence_updated_at,
    pres.current_game_title,
    (
      coalesce(us.show_online, true)
      and coalesce(p.banned, false) = false
      and pres.updated_at is not null
      and pres.updated_at > now() - interval '2 minutes'
      and coalesce(pres.status, 'offline') <> 'background'
    ) as is_online,
    (
      coalesce(us.show_online, true)
      and coalesce(p.banned, false) = false
      and pres.updated_at is not null
      and pres.updated_at > now() - interval '2 minutes'
      and coalesce(pres.status, 'offline') in ('online', 'playing')
    ) as in_tab
  from auth.users u
  left join public.user_profiles p on p.user_id = u.id
  left join public.user_presence pres on pres.user_id = u.id
  left join public.user_settings us on us.user_id = u.id
  where public.current_user_is_moderator()
  order by u.created_at desc;
$$;

create or replace function public.admin_list_activity(limit_count integer default 120, offset_count integer default 0)
returns table (
  id uuid,
  actor_user_id uuid,
  actor_email text,
  target_user_id uuid,
  target_email text,
  action text,
  details jsonb,
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    l.id,
    l.actor_user_id,
    l.actor_email,
    l.target_user_id,
    l.target_email,
    l.action,
    l.details,
    l.created_at
  from public.admin_activity_logs l
  where public.current_user_is_moderator()
  order by l.created_at desc
  limit greatest(1, least(coalesce(limit_count, 120), 300))
  offset greatest(0, coalesce(offset_count, 0));
$$;

create or replace function public.admin_list_activity_filtered(
  limit_count integer default 120,
  offset_count integer default 0,
  action_filter text default null,
  actor_email_filter text default null,
  target_email_filter text default null,
  from_ts timestamptz default null,
  to_ts timestamptz default null
)
returns table (
  id uuid,
  actor_user_id uuid,
  actor_email text,
  target_user_id uuid,
  target_email text,
  action text,
  details jsonb,
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    l.id,
    l.actor_user_id,
    l.actor_email,
    l.target_user_id,
    l.target_email,
    l.action,
    l.details,
    l.created_at
  from public.admin_activity_logs l
  where public.current_user_is_moderator()
    and (
      action_filter is null
      or action_filter = ''
      or lower(l.action) = lower(action_filter)
    )
    and (
      actor_email_filter is null
      or actor_email_filter = ''
      or l.actor_email ilike ('%' || actor_email_filter || '%')
    )
    and (
      target_email_filter is null
      or target_email_filter = ''
      or coalesce(l.target_email, '') ilike ('%' || target_email_filter || '%')
    )
    and (
      from_ts is null
      or l.created_at >= from_ts
    )
    and (
      to_ts is null
      or l.created_at <= to_ts
    )
  order by l.created_at desc
  limit greatest(1, least(coalesce(limit_count, 120), 300))
  offset greatest(0, coalesce(offset_count, 0));
$$;

create or replace function public.admin_set_ban(target_user_id uuid, should_ban boolean, reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_email text;
  normalized_reason text;
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

  normalized_reason := nullif(trim(coalesce(reason, '')), '');

  insert into public.user_profiles (user_id, email, banned, ban_reason, updated_at)
  values (target_user_id, target_email, should_ban, normalized_reason, now())
  on conflict (user_id)
  do update
    set email = excluded.email,
        banned = excluded.banned,
        ban_reason = excluded.ban_reason,
        updated_at = now();

  if should_ban then
    delete from public.user_saves where user_id = target_user_id;
  end if;

  perform public.admin_log_action(
    target_user_id,
    target_email,
    case when should_ban then 'ban' else 'unban' end,
    jsonb_build_object(
      'reason', normalized_reason,
      'cleared_user_saves', should_ban
    )
  );

  return true;
end;
$$;

create or replace function public.admin_set_staff_role(target_user_id uuid, role text, enabled boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_email text;
  normalized_role text;
begin
  if not public.current_user_is_admin() then
    raise exception 'Not authorized.';
  end if;

  if target_user_id is null then
    raise exception 'Target user is required.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot change your own staff role.';
  end if;

  normalized_role := lower(trim(coalesce(role, '')));
  if normalized_role not in ('moderator', 'admin') then
    raise exception 'Role must be moderator or admin.';
  end if;

  select lower(coalesce(email, '')) into target_email
  from auth.users
  where id = target_user_id;

  if target_email is null then
    raise exception 'User not found.';
  end if;

  if enabled then
    insert into public.user_staff_roles (user_id, role, assigned_by, created_at, updated_at)
    values (target_user_id, normalized_role, auth.uid(), now(), now())
    on conflict (user_id, role)
    do update
      set assigned_by = excluded.assigned_by,
          updated_at = now();
  else
    delete from public.user_staff_roles
    where user_id = target_user_id
      and role = normalized_role;
  end if;

  perform public.admin_log_action(
    target_user_id,
    target_email,
    case when enabled then 'set_staff_role' else 'clear_staff_role' end,
    jsonb_build_object(
      'role', normalized_role,
      'enabled', enabled
    )
  );

  return true;
end;
$$;

create or replace function public.admin_set_staff_role_by_email(target_email text, role text, enabled boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
begin
  if not public.current_user_is_admin() then
    raise exception 'Not authorized.';
  end if;

  select u.id
  into target_user_id
  from auth.users u
  where lower(trim(coalesce(u.email, ''))) = lower(trim(coalesce(target_email, '')))
  limit 1;

  if target_user_id is null then
    raise exception 'User not found.';
  end if;

  return public.admin_set_staff_role(target_user_id, role, enabled);
end;
$$;

create or replace function public.admin_delete_account(target_user_id uuid)
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
    raise exception 'You cannot delete your own account.';
  end if;

  select lower(coalesce(email, '')) into target_email
  from auth.users
  where id = target_user_id;

  delete from public.user_saves where user_id = target_user_id;
  delete from public.user_profiles where user_id = target_user_id;
  delete from auth.users where id = target_user_id;

  perform public.admin_log_action(
    target_user_id,
    target_email,
    'delete_account',
    jsonb_build_object('hard_delete', true)
  );

  return true;
end;
$$;

revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_list_activity(integer, integer) from public;
revoke all on function public.admin_list_activity_filtered(integer, integer, text, text, text, timestamptz, timestamptz) from public;
revoke all on function public.admin_set_staff_role(uuid, text, boolean) from public;
revoke all on function public.admin_set_staff_role_by_email(text, text, boolean) from public;
revoke all on function public.admin_set_ban(uuid, boolean, text) from public;
revoke all on function public.admin_delete_account(uuid) from public;
revoke all on function public.admin_log_action(uuid, text, text, jsonb) from public;
revoke all on function public.current_user_staff_role() from public;
revoke all on function public.current_user_is_moderator() from public;
revoke all on function public.public_online_user_count() from public;

grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_list_activity(integer, integer) to authenticated;
grant execute on function public.admin_list_activity_filtered(integer, integer, text, text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_set_staff_role(uuid, text, boolean) to authenticated;
grant execute on function public.admin_set_staff_role_by_email(text, text, boolean) to authenticated;
grant execute on function public.admin_set_ban(uuid, boolean, text) to authenticated;
grant execute on function public.admin_delete_account(uuid) to authenticated;
grant execute on function public.admin_log_action(uuid, text, text, jsonb) to authenticated;
grant execute on function public.current_user_staff_role() to authenticated;
grant execute on function public.current_user_is_moderator() to authenticated;
grant execute on function public.public_online_user_count() to anon;
grant execute on function public.public_online_user_count() to authenticated;
grant execute on function public.upsert_my_user_settings(uuid, jsonb) to authenticated;
grant execute on function public.upsert_my_presence(text, text, text, boolean) to authenticated;
grant execute on function public.upsert_friend_link(text, text, boolean) to authenticated;
grant execute on function public.remove_friend_link(uuid) to authenticated;
grant execute on function public.list_my_friends() to authenticated;
grant execute on function public.send_friend_message(uuid, text) to authenticated;
grant execute on function public.list_my_unread_friend_messages(integer) to authenticated;
grant execute on function public.mark_friend_message_read(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('friend-chat-attachments', 'friend-chat-attachments', true, 5242880)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Public can read friend chat attachments" on storage.objects;
drop policy if exists "Users can upload own friend chat attachments" on storage.objects;
drop policy if exists "Users can update own friend chat attachments" on storage.objects;
drop policy if exists "Users can delete own friend chat attachments" on storage.objects;

create policy "Public can read friend chat attachments"
  on storage.objects
  for select
  using (bucket_id = 'friend-chat-attachments');

create policy "Users can upload own friend chat attachments"
  on storage.objects
  for insert
  with check (
    bucket_id = 'friend-chat-attachments'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own friend chat attachments"
  on storage.objects
  for update
  using (
    bucket_id = 'friend-chat-attachments'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'friend-chat-attachments'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own friend chat attachments"
  on storage.objects
  for delete
  using (
    bucket_id = 'friend-chat-attachments'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Quick smoke tests (safe to run in SQL Editor after this script)
-- These checks confirm objects exist and core admin RPCs are registered.
select 'user_saves table exists' as check_name, to_regclass('public.user_saves') is not null as ok;
select 'user_profiles table exists' as check_name, to_regclass('public.user_profiles') is not null as ok;
select 'user_settings table exists' as check_name, to_regclass('public.user_settings') is not null as ok;
select 'user_presence table exists' as check_name, to_regclass('public.user_presence') is not null as ok;
select 'friend_links table exists' as check_name, to_regclass('public.friend_links') is not null as ok;
select 'friend_messages table exists' as check_name, to_regclass('public.friend_messages') is not null as ok;
select 'admin_activity_logs table exists' as check_name, to_regclass('public.admin_activity_logs') is not null as ok;

select 'admin_list_users rpc exists' as check_name,
  to_regprocedure('public.admin_list_users()') is not null as ok;
select 'admin_list_activity rpc exists' as check_name,
  to_regprocedure('public.admin_list_activity(integer,integer)') is not null as ok;
select 'admin_list_activity_filtered rpc exists' as check_name,
  to_regprocedure('public.admin_list_activity_filtered(integer,integer,text,text,text,timestamptz,timestamptz)') is not null as ok;
select 'admin_set_ban rpc exists' as check_name,
  to_regprocedure('public.admin_set_ban(uuid,boolean,text)') is not null as ok;
select 'admin_delete_account rpc exists' as check_name,
  to_regprocedure('public.admin_delete_account(uuid)') is not null as ok;

-- Optional: should return 0 rows when not signed in as an admin.
select count(*) as admin_list_users_preview_count from public.admin_list_users();
