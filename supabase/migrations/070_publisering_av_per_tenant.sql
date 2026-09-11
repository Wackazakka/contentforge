-- Publiser + Kalender av for IndigoBoom (Lars 11/9: "vi har blitt enige om
-- aa, ihvertfall forelopig, fjerne Publisering og Kalender fra PromoMaker").
--
-- Hvorfor et flagg og ikke sletting: "forelopig". Aa fjerne koden ville
-- kostet en ny deploy aa angre. Dette er en linje aa reversere.
--
-- Hvorfor per tenant og ikke per vertikal: musikk-vertikalen er IndigoBooms i
-- dag, men den er ikke reservert for dem. Aa henge dette paa vertical='music'
-- ville vaert samme feil som twinledger_enabled rettet opp i -- en
-- tilfeldighet som venter paa at en ny tenant skal bite.
--
-- Hva flagget gjoer i koden (app/dashboard/NavBar.tsx m.fl.):
--   * skjuler Publiser og Kalender i dashbord-menyen
--   * skjuler Publiser-knappene paa produktsiden (video/avatar/artikkel) og
--     paa artikkelsiden
--   * sender /dashboard/publish og /dashboard/calendar til /dashboard, slik
--     at et bokmerke eller en gammel OAuth-retur ikke lander paa en halv side
--
-- NULL betyr synlig. Alle andre tenanter er derfor uroerte av denne
-- migrasjonen, og kolonnen trenger ingen backfill.
--
-- Merk: selve publiserings-API-ene og de lagrede social_connections roeres
-- IKKE. Dette er en skjuling av flaten, ikke en avvikling av funksjonen.
-- Allerede planlagte publiseringer vil fortsatt kjoere.
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

alter table public.tenants
  add column if not exists publishing_enabled boolean;

comment on column public.tenants.publishing_enabled is
  'Viser Publiser + Kalender. NULL/true = synlig, false = skjult. Se lib/tenantServer.ts.';

update public.tenants
set publishing_enabled = false
where slug = 'indigoboom';

-- Kontroll: kun indigoboom skal staa med false. Alle andre skal vaere NULL.
select slug,
       app_name,
       publishing_enabled
from public.tenants
order by publishing_enabled nulls last, slug;
