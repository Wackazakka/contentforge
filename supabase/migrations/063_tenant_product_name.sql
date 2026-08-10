-- Produktnavn per tenant (Lars/David 2026-08-07).
--
-- IndigoBoom er SELSKAPET; produktet heter PromoMaker. Foer dette fantes bare
-- app_name, saa et produktnavn maatte enten overskrive selskapsnavnet overalt
-- -- og dermed spise opphavsrettslinja i bunnteksten og «Bli en stemme hos
-- ...» -- eller ikke finnes i det hele tatt. Nytt felt skiller de to:
--
--   app_name     = avsenderen  (bunntekst, stemmesoeknader)
--   product_name = tjenesten   (fanetittel, innlogging, merkekort)
--
-- Tomt felt => fall tilbake til app_name. Alle andre tenants er derfor uroert.
--
-- MERKEKORTET: teksten ble bygget som «<app_name> VideoMaker» med ordet
-- HARDKODET i to filer, likt for alle seks white-labels. Naa er den
-- «<app_name> <product_name>» med 'VideoMaker' som standard, og samme
-- dublett-vern som foer (Isabel heter allerede «Isabel's VideoMaker» og skal
-- ikke bli «Isabel's VideoMaker VideoMaker»).
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

alter table public.tenants add column if not exists product_name text;

comment on column public.tenants.product_name is
  'Produktnavnet naar det avviker fra selskapsnavnet (app_name). Tomt = bruk app_name. Brukes i fanetittel, innlogging og merkekort.';

update public.tenants set product_name = 'PromoMaker' where slug = 'indigoboom';

-- PostgREST cacher skjemaet; uten dette svarer API-et «column not found».
notify pgrst, 'reload schema';
