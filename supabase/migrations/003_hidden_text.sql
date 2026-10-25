-- Cockroach Smash: also remove "smuggled" hidden text. Run after 002_clean_text.sql.
--
-- Some invisible characters can carry whole hidden sentences inside a normal-looking
-- complaint: Unicode tag characters (U+E0000-E007F) and extended variation selectors
-- (U+E0100-E01EF). People hide instructions for AI tools this way ("ASCII
-- smuggling"). 002 did not remove them. Also removed now: other characters that
-- look blank (soft hyphen, combining grapheme joiner, Hangul fillers, Mongolian
-- vowel separator) and variation selectors 1-14 (15 and 16 stay: emoji use them).
-- The zero-width joiner is now kept where it builds an emoji (002 removed it everywhere,
-- which split family and flag emoji into pieces).
--
-- Afterwards, everything already stored is cleaned the same way once.

create or replace function public._clean_text(p_text text, p_multiline boolean)
returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  v text := coalesce(p_text, '');
begin
  -- Invisible formatting characters: bidi marks, overrides and isolates,
  -- zero-width space/non-joiner, word joiner and friends, byte order mark.
  v := regexp_replace(v, '[\u061C\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]', '', 'g');
  -- The zero-width joiner glues emoji together (families, rainbow flag, professions):
  -- kept only right before an emoji, removed everywhere else.
  v := regexp_replace(v, '\u200D(?![\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF])', '', 'g');
  -- Hidden-text carriers and blank-looking characters (see above).
  v := regexp_replace(v, '[\U000E0000-\U000E007F\U000E0100-\U000E01EF\uFE00-\uFE0D\u00AD\u034F\u115F\u1160\u180E\u3164\uFFA0]', '', 'g');
  -- Unusual spaces (no-break, en/em/thin..., ideographic) count as plain spaces.
  v := regexp_replace(v, '[\u00A0\u2000-\u200A\u202F\u205F\u3000\t]', ' ', 'g');
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

-- Clean what is already stored. Text that would become empty gets a placeholder,
-- so the length checks on the tables still hold.
update public.roach_secrets
  set complaint = coalesce(nullif(public._clean_text(complaint, true), ''), '(removed)')
  where complaint is distinct from public._clean_text(complaint, true);

update public.roaches
  set owner_name = coalesce(nullif(public._clean_text(owner_name, false), ''), '?')
  where owner_name is distinct from public._clean_text(owner_name, false);

update public.roaches
  set finisher_name = nullif(public._clean_text(finisher_name, false), '')
  where finisher_name is not null and finisher_name is distinct from public._clean_text(finisher_name, false);

update public.profiles
  set name = coalesce(nullif(public._clean_text(name, false), ''), '?')
  where name is distinct from public._clean_text(name, false);
