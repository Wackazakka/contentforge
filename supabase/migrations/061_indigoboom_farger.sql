-- IndigoBooms egne farger (Lars 5/8: "kan du se litt paa fargene").
--
-- Hva som var galt: tenanten sto med en blek GROENN sideflate (#E3F0DE) og en
-- dempet rosalilla aksent (#D317B1). Ingen av delene finnes i merkevaren deres.
-- Gronnfargen er arv fra et gammelt oppsett, ikke et valg noen har tatt.
--
-- Hvor tallene kommer fra -- maalt, ikke gjettet:
--   * #EC3DFA er hentet fra favikonet paa indigoboom.com og utgjoer 52 % av
--     flatene i merket. Det er merkefargen deres, eksakt.
--   * Moerke, NOEYTRALE flater fordi indigoboom.no er naer-svart uten
--     fargestikk -- menyknappene deres er graa, ikke lilla. paletteFromBrand
--     toner flatene i merkefargens kuloer; her er den metningen tatt bort.
--   * Resten er utledet av paletteFromBrand() med WCAG-gulv, ikke haandplukket.
--
-- Maalte kontraster mot sideflaten:
--   ink 15,60 : soft 11,73 : muted 8,02 : faint 5,21 : aksent 5,39
--   knappetekst mot --ember-deep: 4,77 (gulvet er 4,5)
--
-- Sluttplakaten gaar moerkere enn dashbordet (#0F0E0F, 19,27:1 mot hvit
-- tekst): en plakat skal foles som en plakat, ikke som en side.
--
-- Reversering: gamle verdier staar nederst i denne fila, utkommentert.
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
set colors = jsonb_build_object(
  '--ember',             '#EC3DFA',
  '--ember-deep',        '#C606D6',
  '--ember-tint-bg',     '#421C45',
  '--ember-tint-border', '#68276D',
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
  '--ds-border-strong',  '#59535A',
  '--ds-border-faint',   '#2F2C30',
  '--brand-card-bg',     '#0F0E0F'
)
where slug = 'indigoboom';

-- Kontroll
select slug, colors->>'--ember' as aksent, colors->>'--paper' as flate,
       colors->>'--on-ember' as knappetekst
from public.tenants where slug = 'indigoboom';

-- ---------------------------------------------------------------------------
-- ANGRE (kjoer denne hvis fargene skal tilbake til slik de sto 5. august):
--
-- update public.tenants set colors = jsonb_build_object(
--   '--ember', '#D317B1', '--ember-deep', '#A5128A',
--   '--ember-tint-bg', '#F3E7F1', '--ember-tint-border', '#E1C6DC',
--   '--paper', '#E3F0DE', '--paper-raised', '#EDF3EA', '--paper-sunken', '#DCECD5'
-- ) where slug = 'indigoboom';
-- ---------------------------------------------------------------------------
