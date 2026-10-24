-- Cockroach Smash: tables, Row Level Security, server functions and Realtime.
-- Implements PLAN.md "Database and server rules". Run once in the Supabase SQL editor.
--
-- Who can do what:
--   roaches        everyone can read (select); nobody can write directly
--   roach_secrets  nobody can read or write directly (holds the complaints)
--   smashes        nobody can read or write directly
--   profiles       nobody can read or write directly
-- All writes go through the security definer functions below, which identify
-- the caller with auth.uid(). Every visitor signs in anonymously on page load.
--
-- Errors: functions raise with HINT set to a short code the page understands
-- (invalid_name, invalid_complaint, limit_reached, not_found, gone, too_slow,
-- not_owner, not_finisher, not_signed_in) and MESSAGE set to text for people.

-- ---------------------------------------------------------------------------
-- Tables

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 24),
  updated_at timestamptz not null default now()
);

create table public.roaches (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references auth.users (id) on delete set null,
  owner_name      text not null check (char_length(owner_name) between 1 and 24),
  seed            integer not null,                 -- drives movement in every browser
  size            real not null default 1,          -- about ±15%
  tint            real not null default 0,          -- -1 .. 1, slight colour variation
  created_at      timestamptz not null default now(),
  dead_until      timestamptz,                      -- null when alive and not respawning
  status          text not null default 'alive' check (status in ('alive', 'exterminated', 'self_destructed')),
  smash_count     integer not null default 0,       -- distinct smashers
  exterminated_at timestamptz,
  finisher_id     uuid references auth.users (id) on delete set null,
  finisher_name   text check (finisher_name is null or char_length(finisher_name) between 1 and 24)
);

create index roaches_alive_idx on public.roaches (created_at desc) where status = 'alive';
create index roaches_owner_alive_idx on public.roaches (owner_id) where status = 'alive';
create index roaches_hall_idx on public.roaches (exterminated_at desc) where status = 'exterminated';

create table public.roach_secrets (
  roach_id  uuid primary key references public.roaches (id) on delete cascade,
  complaint text not null check (char_length(complaint) between 1 and 280)
);

create table public.smashes (
  roach_id   uuid not null references public.roaches (id) on delete cascade,
  smasher_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (roach_id, smasher_id)   -- each person counts once per cockroach
);

-- ---------------------------------------------------------------------------
-- Row Level Security: on for every table. Only roaches gets a policy (read).

alter table public.profiles      enable row level security;
alter table public.roaches       enable row level security;
alter table public.roach_secrets enable row level security;
alter table public.smashes       enable row level security;

create policy "Anyone can read cockroaches"
  on public.roaches for select
  to anon, authenticated
  using (true);

-- Belt and braces: take away the table privileges Supabase grants by default,
-- so even a policy added by mistake later could not expose the locked tables.
revoke all on public.profiles, public.roach_secrets, public.smashes from anon, authenticated;
revoke all on public.roaches from anon, authenticated;
grant select on public.roaches to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers

-- The caller's user id, or an error when not signed in.
create function public._caller() returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign-in is needed. Reload the page.' using hint = 'not_signed_in';
  end if;
  return uid;
end;
$$;

-- Trims and checks a name (1 to 24 characters).
create function public._clean_name(p_name text) returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_name, ''));
  n int := char_length(v);
begin
  if n < 1 then
    raise exception 'Your name can''t be empty.' using hint = 'invalid_name';
  end if;
  if n > 24 then
    raise exception 'Your name is too long (%/24 characters).', n using hint = 'invalid_name';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- release_roach(name, complaint): any visitor, at most 2 living cockroaches.

create function public.release_roach(p_name text, p_complaint text)
returns public.roaches
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := public._caller();
  v_name text := public._clean_name(p_name);
  v_complaint text := btrim(coalesce(p_complaint, ''));
  n int := char_length(v_complaint);
  living int;
  r public.roaches;
begin
  if n < 1 then
    raise exception 'Your complaint can''t be empty.' using hint = 'invalid_complaint';
  end if;
  if n > 280 then
    raise exception 'Your complaint is too long (%/280 characters).', n using hint = 'invalid_complaint';
  end if;

  -- One release at a time per person, so two quick clicks can't both pass the limit.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  select count(*) into living from public.roaches where owner_id = uid and status = 'alive';
  if living >= 2 then
    raise exception 'You already have 2 cockroaches out. Self-destruct one to release another.'
      using hint = 'limit_reached';
  end if;

  insert into public.profiles (id, name) values (uid, v_name)
  on conflict (id) do update set name = excluded.name, updated_at = now();

  insert into public.roaches (owner_id, owner_name, seed, size, tint)
  values (
    uid, v_name,
    floor(random() * 2147483647)::int,
    round((0.85 + random() * 0.3)::numeric, 2),
    round((random() * 2 - 1)::numeric, 2)
  )
  returning * into r;

  insert into public.roach_secrets (roach_id, complaint) values (r.id, v_complaint);
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- smash(roach_id): any visitor. Locks the row so two smashes at the same
-- instant are applied one after the other and the count stays right.

create function public.smash(p_roach_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := public._caller();
  r public.roaches;
  n int;
  v_final boolean;
  v_complaint text;
begin
  select * into r from public.roaches where id = p_roach_id for update;
  if not found then
    raise exception 'That cockroach no longer exists.' using hint = 'not_found';
  end if;
  if r.status <> 'alive' then
    raise exception 'This cockroach is already gone.' using hint = 'gone';
  end if;
  if r.dead_until is not null and r.dead_until > now() then
    raise exception 'Too slow, someone got it first' using hint = 'too_slow';
  end if;

  insert into public.smashes (roach_id, smasher_id) values (r.id, uid)
  on conflict do nothing;
  select count(*) into n from public.smashes where roach_id = r.id;
  v_final := n >= 10;

  if v_final then
    update public.roaches set
      smash_count = n,
      status = 'exterminated',
      exterminated_at = now(),
      dead_until = null,
      finisher_id = uid,
      finisher_name = (select p.name from public.profiles p where p.id = uid)
    where id = r.id
    returning * into r;
  else
    update public.roaches set
      smash_count = n,
      dead_until = now() + interval '30 seconds'
    where id = r.id
    returning * into r;
  end if;

  select complaint into v_complaint from public.roach_secrets where roach_id = r.id;
  return jsonb_build_object(
    'complaint', v_complaint,
    'owner_name', r.owner_name,
    'smash_count', n,
    'final', v_final,
    'finisher_name', r.finisher_name
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- self_destruct(roach_id): the owner only, while it is alive. The complaint is
-- deleted, as the confirmation promises, and it never reaches the Hall of fame.

create function public.self_destruct(p_roach_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := public._caller();
  r public.roaches;
begin
  select * into r from public.roaches where id = p_roach_id for update;
  if not found then
    raise exception 'That cockroach no longer exists.' using hint = 'not_found';
  end if;
  if r.owner_id is distinct from uid then
    raise exception 'Only its owner can self-destruct a cockroach.' using hint = 'not_owner';
  end if;
  if r.status <> 'alive' then
    raise exception 'This cockroach is already gone.' using hint = 'gone';
  end if;

  update public.roaches set status = 'self_destructed', dead_until = null where id = r.id;
  delete from public.roach_secrets where roach_id = r.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- hall_of_fame(limit, offset): exterminated cockroaches, newest first.

create function public.hall_of_fame(p_limit int default 30, p_offset int default 0)
returns table (
  roach_id        uuid,
  owner_name      text,
  complaint       text,
  finisher_name   text,
  exterminated_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select r.id, r.owner_name, s.complaint, r.finisher_name, r.exterminated_at
  from public.roaches r
  join public.roach_secrets s on s.roach_id = r.id
  where r.status = 'exterminated'
  order by r.exterminated_at desc, r.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- set_finisher_name(roach_id, name): the finisher only.

create function public.set_finisher_name(p_roach_id uuid, p_name text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := public._caller();
  v_name text := public._clean_name(p_name);
  r public.roaches;
begin
  select * into r from public.roaches where id = p_roach_id for update;
  if not found then
    raise exception 'That cockroach no longer exists.' using hint = 'not_found';
  end if;
  if r.status <> 'exterminated' or r.finisher_id is distinct from uid then
    raise exception 'Only the person who finished it can sign it.' using hint = 'not_finisher';
  end if;
  update public.roaches set finisher_name = v_name where id = r.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- server_now(): the database clock, so every browser moves the cockroaches
-- on the same timeline. Reveals nothing else.

create function public.server_now()
returns timestamptz
language sql volatile
set search_path = ''
as $$
  select clock_timestamp();
$$;

-- ---------------------------------------------------------------------------
-- Who may call what. Supabase lets anon and authenticated execute new functions
-- by default; take that away and grant only what each role needs. Anonymous
-- sign-ins get the authenticated role.

revoke execute on function
  public._caller(),
  public._clean_name(text),
  public.release_roach(text, text),
  public.smash(uuid),
  public.self_destruct(uuid),
  public.hall_of_fame(int, int),
  public.set_finisher_name(uuid, text),
  public.server_now()
from public, anon, authenticated;
grant execute on function
  public.release_roach(text, text),
  public.smash(uuid),
  public.self_destruct(uuid),
  public.hall_of_fame(int, int),
  public.set_finisher_name(uuid, text)
to authenticated;
grant execute on function public.server_now() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast changes to roaches only. Nothing secret is in that table.

alter publication supabase_realtime add table public.roaches;
