-- Cockroach Smash: close the gaps found by tests/hidden-text.test.js. Run after 003.
--
-- 1. Bit smuggling: 003 kept variation selectors 15 and 16 (emoji need them), so a
--    hidden message could ride on them, one bit per letter. Now they are kept only
--    right after an emoji or symbol (or in a keycap: 1 + U+FE0F + U+20E3), and at most one in
--    a row: no more than one hidden bit per emoji, too little to carry an instruction.
-- 2. Interlinear annotation markers (U+FFF9-FFFB), invisible musical formatting
--    characters (U+1D173-1D17A) and Unicode noncharacters (U+FDD0-FDEF, U+FFFE, U+FFFF)
--    are removed.
-- Everything already stored is cleaned the same way once.

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
  -- Hidden-text carriers and blank-looking characters.
  v := regexp_replace(v, '[\U000E0000-\U000E007F\U000E0100-\U000E01EF\uFE00-\uFE0D\u00AD\u034F\u115F\u1160\u180E\u3164\uFFA0]', '', 'g');
  -- Annotation markers, invisible musical formatting, noncharacters.
  v := regexp_replace(v, '[\uFFF9-\uFFFB\U0001D173-\U0001D17A\uFDD0-\uFDEF\uFFFE\uFFFF]', '', 'g');
  -- Variation selectors 15/16 only right after an emoji or symbol, or before a keycap mark.
  v := regexp_replace(v, '(?<![\u00A9\u00AE\u2000-\u2BFF\u3030\u303D\u3297\u3299\U0001F000-\U0001FAFF])[\uFE0E\uFE0F](?!\u20E3)', '', 'g');
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
