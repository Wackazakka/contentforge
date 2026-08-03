-- Koblinger til sosiale kontoer hoerer til ORGANISASJONEN, ikke til brukeren
-- (Lars 3/8: hans BilDeal- og Reforhandle-sider dukket opp paa Isabels domene).
--
-- Hvorfor organisasjon og ikke tenant: produktene henger paa organisasjonen, og
-- publisering handler alltid om et produkt. Ville vi festet koblingene til
-- tenanten, hadde ALLE artister paa IndigoBoom delt Facebook-sider - verre enn
-- i dag. Organisasjonen baerer dessuten tenant_id fra foer, saa
-- tenant-avgrensningen kommer gratis.
--
-- ASCII-only: Supabase-editoren tygger ae/oe/aa feil ved innliming.

-- ---------------------------------------------------------------------------
-- SPERRE: ReelHome har en tabell med SAMME navn i et ANNET Supabase-prosjekt
-- (jvnavubholyvihvytqkn). Kjoeres dette der, oedelegges publiseringen deres.
-- Denne blokken avbryter alt med en gang hvis vi ikke er i ContentForge.
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

-- 1) Kolonnen
alter table public.social_connections
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- 2) Etterfyll fra brukerens ELDSTE organisasjon. Det er den samme regelen
--    dashbordet bruker naar det velger organisasjon, saa eksisterende
--    koblinger havner der de faktisk har vaert i bruk.
update public.social_connections sc
set organization_id = o.id
from (
  select distinct on (owner_id) owner_id, id
  from public.organizations
  order by owner_id, created_at asc
) o
where sc.organization_id is null
  and sc.user_id = o.owner_id;

-- 3) Duplikater: behold NYESTE rad per (organisasjon, plattform, side).
--    Nyeste har det ferskeste tilgangstokenet - eldre rader ville gitt
--    utloepte tokens og stille publiseringsfeil.
--    ctid som tiebreaker: har to rader IDENTISK created_at (de ble laget i
--    samme oppdatering), ville «<» ikke slettet noen av dem - og da hadde den
--    unike indeksen under feilet, med halv migrasjon som resultat.
delete from public.social_connections a
using public.social_connections b
where a.organization_id is not distinct from b.organization_id
  and a.platform = b.platform
  and a.page_id  = b.page_id
  and (a.created_at < b.created_at
       or (a.created_at = b.created_at and a.ctid < b.ctid));

-- 4) Unik indeks - det er trolig DENNE som har manglet. Uten den gjoer
--    upsert med onConflict ingen oppdatering, og hver ny tilkobling blir
--    en ny rad i stedet.
create unique index if not exists social_connections_org_platform_page_key
  on public.social_connections (organization_id, platform, page_id);

comment on column public.social_connections.organization_id is
  'Organisasjonen koblingen tilhoerer. Publiseringslista filtrerer paa denne, saa en Facebook-side kun vises i tjenesten den ble koblet til.';

-- Kontroll
select count(*) filter (where organization_id is null) as uten_organisasjon,
       count(*) as totalt
from public.social_connections;
