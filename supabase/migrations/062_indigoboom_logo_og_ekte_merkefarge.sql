-- IndigoBooms logo + korrigert merkefarge (Lars 5/8).
--
-- LOGO: tenanten sto uten logo, saa baade toppen av siden og den genererte
-- sluttplakaten viste CenterForges eget merke. Originalen er hentet fra
-- headeren paa indigoboom.no -- 1882x444 PNG med ekte gjennomsiktighet, ikke
-- et skjermbildeutsnitt -- og lastet opp til vaar egen R2 i stedet for aa
-- hotlinke Wix' CDN, som doer den dagen de bygger om siden.
--
-- MERKEFARGE: 061 satte #EC3DFA, maalt i favikonet. Originallogoen viser at
-- den ekte fargen er #EC08FA -- favikonet var mykgjort av Wix' skarphets- og
-- avif-filter, som trakk groennkanalen fra 8 til 61. Bare --ember, --ember-deep
-- og de to tint-verdiene flytter seg; flater og tekst er identiske med 061.
--
-- Maalte kontraster:
--   ink 15,60 : soft 11,73 : muted 8,02 : faint 5,21
--   knappetekst mot --ember-deep 5,13 (gulvet er 4,5) : aksent mot flate 4,88
--   logoen er HVIT tekst + magenta ring: hvit mot flate 17,12, mot plakat
--   19,27, og ringen mot plakat 5,49 -- den baerer paa begge moerke flater.
--
-- ASCII-only: Supabase-editoren tygger ae/oe/aa feil ved innliming.

-- ---------------------------------------------------------------------------
-- SPERRE: ReelHome har en tabell med SAMME navn i et ANNET Supabase-prosjekt
-- (jvnavubholyvihvytqkn). Denne blokken avbryter uten endringer der.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tenants'
  ) or not exists (
    select 1 from public.tenants where slug = 'centerforge'
  ) then
    raise exception 'FEIL PROSJEKT. Denne migrasjonen hoerer til ContentForge (wxnevywhtmovangkobal). Avbrutt uten endringer.';
  end if;
end $$;

update public.tenants
set logo_url = 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/logos/indigoboom/logo.png',
    colors = jsonb_build_object(
      '--ember',             '#EC08FA',
      '--ember-deep',        '#BF04CB',
      '--ember-tint-bg',     '#421C45',
      '--ember-tint-border', '#69266D',
      '--on-ember',          '#FFFFFF',
      '--paper',             '#1D1B1D',
      '--paper-raised',      '#2A272A',
      '--paper-sunken',      '#232123',
      '--band',              '#322F32',
      '--ink',               '#F5F4F5',
      '--ink-soft',          '#D7D5D7',
      '--text-muted',        '#B5B0B5',
      '--text-faint',        '#928C92',
      '--ds-border',         '#3F3B3F',
      '--ds-border-strong',  '#5A535A',
      '--ds-border-faint',   '#2F2C30',
      '--brand-card-bg',     '#0F0E0F'
    )
where slug = 'indigoboom';

-- Kontroll
select slug, logo_url, colors->>'--ember' as aksent, colors->>'--on-ember' as knappetekst
from public.tenants where slug = 'indigoboom';
