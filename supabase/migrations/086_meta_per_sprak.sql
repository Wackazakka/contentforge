-- 086: Tenantens metatekst per spraak (Lars 21.09.2026)
--
-- BAKGRUNN. `meta_title` og `meta_description` er ENSPRAAKLIGE tekstkolonner.
-- Layouten bruker dem paa hver side som ikke setter egen metadata (/login,
-- /register, /white-label, dashbordet). En engelsk besoekende som slaar om
-- spraakvelgeren fikk dermed norsk tittel og norsk beskrivelse -- i fanen, i
-- soekeresultatet og i hvert delte lenkekort.
--
-- To ting var galt, og bare det ene krevde en kolonne:
--
--   1) Kolonnene kan bare holde ETT spraak. Det loeses her.
--   2) Selv MALEN (fallback naar kolonnene er tomme) leste
--      tenants.default_locale i stedet for besoekendes faktiske valg. Det var
--      ren kodefeil og er rettet i app/layout.tsx.
--
-- FORM: `meta_i18n` er jsonb keyet paa spraakkode:
--
--   {"no": {"title": "...", "description": "..."},
--    "en": {"title": "...", "description": "..."}}
--
-- Hvorfor jsonb og ikke `meta_title_en`: parallelle kolonner stopper ved to
-- spraak, og de foerste to er aldri de siste. Og hvorfor en NY kolonne og ikke
-- en typeendring paa de gamle: de gamle blir staaende som fallback for spraak
-- man ikke har fylt ut, saa ingen tenant mister teksten sin i overgangen.
--
-- OPPSLAGSREKKEFOELGEN i layouten: meta_i18n[spraak] -> meta_title/
-- meta_description (enspraaklig, som foer) -> malen, na paa riktig spraak.
--
-- ASCII-only (Supabase-editoren tygger ae/oe/aa ved innliming). Den norske
-- teksten under settes derfor med chr() og ikke som raa tekst.

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
end $$;

alter table public.tenants
  add column if not exists meta_i18n jsonb not null default '{}'::jsonb;

comment on column public.tenants.meta_i18n is
  'Tittel og beskrivelse per spraakkode: {"no":{"title","description"},"en":{...}}. '
  'Slaas opp foer de enspraaklige meta_title/meta_description, som fortsatt '
  'gjelder for spraak som ikke staar her.';

-- TwinLedger paa begge spraak. Teksten speiler overskriften paa landingssiden.
-- chr() i stedet for raa tegn: em-dash = 8212, oe = 248, aa = 229. Da er
-- HELE fila ren ASCII og taaler innliming i SQL-editoren uten aa bli tygd.
update public.tenants
set meta_i18n = jsonb_build_object(
  'no', jsonb_build_object(
    'title',       'TwinLedger ' || chr(8212) || ' klarerte stemmer og ansikter til film og reklame',
    'description', 'Stemmen og ansiktet du vil ha ' || chr(8212) || ' klarert, f' || chr(248) || 'rt og betalt. '
                || 'Bak hver bruk ligger avtalen som tillater den, og skuespilleren f' || chr(229) || 'r betalt hver gang.'
  ),
  'en', jsonb_build_object(
    'title',       'TwinLedger ' || chr(8212) || ' cleared voices and faces for film and advertising',
    'description', 'The voice and face you want ' || chr(8212) || ' cleared, logged and paid for. '
                || 'Behind every use is the agreement that permits it, and the performer is paid every time.'
  )
)
where slug = 'twinledger';

notify pgrst, 'reload schema';

select slug,
       meta_i18n -> 'no' ->> 'title' as tittel_no,
       meta_i18n -> 'en' ->> 'title' as tittel_en
from public.tenants
where slug = 'twinledger';
