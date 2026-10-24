-- Cockroach Smash: stricter cleaning of names and complaints. Run after 001_init.sql.
--
-- 001 trimmed spaces only, so a name or complaint made of newlines or tabs got
-- through, and invisible characters were stored as typed: right-to-left
-- overrides (to display a name reversed or spoof another), zero-width
-- characters and control codes. Now:
--   names:      control characters and line breaks become spaces, runs of
--               spaces collapse to one, invisible characters are removed
--   complaints: line breaks are kept (at most one empty line in a row), other
--               control and invisible characters are removed
--   both:       all leading and trailing whitespace is trimmed before the length check

create function public._clean_text(p_text text, p_multiline boolean)
returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  v text := coalesce(p_text, '');
begin
  -- Invisible formatting characters: bidi marks, overrides and isolates,
  -- zero-width space/joiners, word joiner and friends, byte order mark.
  v := regexp_replace(v, '[؜​-‏‪-‮⁠-⁤⁦-⁩﻿]', '', 'g');
  -- Unusual spaces (no-break, en/em/thin..., ideographic) count as plain spaces.
  v := regexp_replace(v, '[  -   　\t]', ' ', 'g');
  if p_multiline then
    v := replace(replace(v, E'\r\n', E'\n'), E'\r', E'\n');
    v := regexp_replace(v, '[\u0001-\u0009\u000B-\u001F\u007F-\u009F]', '', 'g');
    v := regexp_replace(v, E' +\n', E'\n', 'g');          -- trailing spaces on a line
    v := regexp_replace(v, E'\n{3,}', E'\n\n', 'g');     -- at most one empty line
  else
    v := regexp_replace(v, '[\u0001-\u001F\u007F-\u009F]', ' ', 'g');
    v := regexp_replace(v, ' {2,}', ' ', 'g');
  end if;
  return btrim(v, E' \n');
end;
$$;

-- Names: same checks as before, on the cleaned text.
create or replace function public._clean_name(p_name text) returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  v text := public._clean_text(p_name, false);
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

-- release_roach: unchanged except that the complaint is cleaned first.
create or replace function public.release_roach(p_name text, p_complaint text)
returns public.roaches
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := public._caller();
  v_name text := public._clean_name(p_name);
  v_complaint text := public._clean_text(p_complaint, true);
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

-- Supabase lets anon and authenticated execute new functions by default; the helper is internal.
revoke execute on function public._clean_text(text, boolean) from public, anon, authenticated;
