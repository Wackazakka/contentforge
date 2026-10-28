-- 129: Standardlisens — lisens med en gang der rettighetshaveren har sagt ja
-- på forhånd (Lars 28.10.2026).
--
-- ⚠️ NUMMERET. Kjørt i produksjon 28.10.2026 som «128», før en annen økt la
-- 128_innsyn_per_lisens.sql på main. Omnummerert til 129 uten endringer i
-- SQL-en; den er idempotent og trygg å kjøre på nytt.
--
-- BAKGRUNNEN. Hver lisens ble forhandlet: kunden ba, vi svarte med et tilbud.
-- Mye bruk er rutine — en nettkampanje i Norge i tre måneder — og der er det
-- unødvendig at kunden må vente. Nå kan rettighetshaveren (eller byrået på
-- hennes vegne) forhåndsgodkjenne et utvalg, og kunden får lisensen med en gang
-- til takstkortets pris, trukket fra saldoen.
--
-- 🔑 GRENSENE STÅR I KODEN (lib/standardLisens.ts), ikke bare her:
--   aldri kjente navn · aldri verk (film, serie, spill) · aldri eksklusivitet ·
--   aldri uten sluttdato · aldri sensitive kategorier (kunden erklærer det).
-- Det rettighetshaveren velger, er et utvalg INNENFOR dem.
--
-- 🔑 VILKÅRENE KUNDEN GODTOK, FRYSES PÅ LISENSEN — som samtykket (089). En
-- standardlisens uten frosne vilkår finnes ikke.
--
-- Idempotent: trygg å kjøre på nytt.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tenants'
  ) or not exists (
    select 1 from public.tenants where slug = 'centerforge'
  ) then
    raise exception 'FEIL PROSJEKT. Denne migrasjonen hører til ContentForge (wxnevywhtmovangkobal). Avbrutt uten endringer.';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Hva rettighetshaveren har forhåndsgodkjent
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.standard_licence_terms (
  actor_id        uuid primary key references public.voice_actors(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  enabled         boolean not null default false,
  assets          text[] not null default array['voice', 'face', 'both'],
  media           text[] not null default array['internal', 'online'],
  territories     text[] not null default array['no', 'nordic'],
  max_term_months int not null default 12,
  updated_by      text,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  constraint standard_terms_assets check (assets <@ array['voice', 'face', 'both']),
  constraint standard_terms_media check (media <@ array['internal', 'online', 'broadcast']),
  constraint standard_terms_territories check (territories <@ array['no', 'nordic', 'world']),
  -- Uten sluttdato avtales alltid; 3 eller 12 måneder er takstkortets perioder.
  constraint standard_terms_term check (max_term_months in (3, 12))
);

comment on table public.standard_licence_terms is
  'Forhåndsgodkjent standardlisens per rettighetshaver (128). Av til den slås på.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Lisensen vet hvordan den ble til
-- ─────────────────────────────────────────────────────────────────────────
alter table public.licences
  add column if not exists source text not null default 'negotiated',
  add column if not exists terms_text text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_accepted_by text;

alter table public.licences drop constraint if exists licences_source_check;
alter table public.licences
  add constraint licences_source_check check (source in ('negotiated', 'standard'));

alter table public.licences drop constraint if exists licences_standard_vilkaar;
alter table public.licences
  add constraint licences_standard_vilkaar
    check (source <> 'standard' or (terms_text is not null and terms_accepted_at is not null and terms_accepted_by is not null));

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Stenging (096/097)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.standard_licence_terms enable row level security;
revoke all on table public.standard_licence_terms from anon, authenticated;
grant select, insert, update on table public.standard_licence_terms to service_role;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Kontroll (én rad, alle skal være true)
-- ─────────────────────────────────────────────────────────────────────────
select
  (select relrowsecurity from pg_class where oid = 'public.standard_licence_terms'::regclass) as vilkaar_rls,
  not exists (select 1 from information_schema.role_table_grants
               where table_schema = 'public' and table_name = 'standard_licence_terms'
                 and grantee in ('anon', 'authenticated')) as stengt_for_anon,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'licences' and column_name = 'source') as lisens_kjenner_kilden,
  not exists (select 1 from public.licences where source <> 'negotiated') as alle_lisenser_forhandlet_hittil;
