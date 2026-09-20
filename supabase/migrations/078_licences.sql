-- 078: Lisenser -- klareringsregisteret ved siden av forbruksmaaleren
-- (Lars 20.09.2026).
--
-- BAKGRUNN. TwinLedger priser i dag per genereringshendelse. Det er en
-- maalermodell, og den bommer systematisk: den underpriser ett generert bilde
-- som blir en riksdekkende kampanje, og overpriser hundre proevegenereringer
-- som aldri publiseres. Produsenter kjoeper ikke hendelser -- de kjoeper
-- BRUKSRETT: medium, territorium, periode, eksklusivitet.
--
-- Maaleren beholdes paa begge aktivatyper, men faar bare baere KOSTNADEN.
-- Den har nemlig to jobber, og bare den ene boer prises:
--   1) kostnadsdekning (ekte og variabel for stemme, naer null for ansikt)
--   2) PROVENIENS -- hvert generert aktivum trenger en rad, ellers finnes ikke
--      sporet som gjoer "var dette autorisert?" besvarbart
-- Rettigheten ligger i lisensen. Derfor `voice_usage_events.licence_id`.
--
-- TO REGIMER (Lars 20.09):
--   campaign -- reklame o.l. Tidsbegrenset og fornybar. term_end paakrevd.
--   work     -- spillefilm, serie, spill, lydbok. Verket finnes for alltid og
--               negativet kan ikke klippes om naar en lisens utloeper, saa
--               produsenten kjoeper evig, verden, alle medier. term_end null.
--               NB: evigheten er BUNDET TIL VERKET (se licences.work_title).
--               Uten den bindingen har produsenten ikke kjoept en lisens til
--               en film, men i praksis selve modellen -- en ansiktsmodell kan
--               kjoere i det uendelige.
--
-- NB: PRISEN FRYSES PAA RADEN. Den beregnes ALDRI fra takstkortet ved visning.
-- Endres kortet i 2027, ville gamle avtaler faatt nye tall, og hovedboken
-- mister det eneste den egentlig selger: at den ikke kan endres i ettertid.
-- Samme prinsipp som frosset samtyketekst paa skuespillerraden.
--
-- ASCII-only (Supabase-editoren tygger ae/oe/aa ved innliming).

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
end $$;

-- 1) Lisensen ---------------------------------------------------------------

create table if not exists public.licences (
  id                    uuid primary key default gen_random_uuid(),
  actor_id              uuid not null references public.voice_actors(id) on delete restrict,
  -- Den som har avtalen med rettighetshaveren, og dermed fakturerer.
  tenant_id             uuid not null references public.tenants(id) on delete restrict,
  -- Kunden. organization_id naar kunden finnes hos oss; ellers fritekst, fordi
  -- en filmprodusent sjelden har konto i verktoeyet.
  organization_id       uuid,
  customer_label        text,

  kind                  text not null check (kind in ('campaign', 'work')),
  asset_type            text not null check (asset_type in ('voice', 'face', 'both')),

  -- Kampanje-aksene
  media_class           text check (media_class in ('internal', 'online', 'broadcast')),
  territory             text check (territory in ('no', 'nordic', 'world')),
  term_start            date,
  term_end              date,
  exclusivity           text not null default 'none'
                          check (exclusivity in ('none', 'category', 'full')),

  -- Verk-aksene
  work_title            text,
  production_tier       text check (production_tier in ('short', 'national', 'major', 'international')),
  role_scope            text check (role_scope in ('line', 'supporting', 'lead')),

  -- Penger. FRYST ved inngaaelse.
  fee_customer_nok      numeric(12,2) not null,
  fee_actor_nok         numeric(12,2) not null,
  -- Hva takstkortet FORESLO, ved siden av det som ble avtalt. Avviket er
  -- gratis innsikt: etter tjue avtaler ser du om kortet er feil, i stedet for
  -- aa gjette i neste forhandling.
  list_fee_customer_nok numeric(12,2),
  rate_card_version     text,

  status                text not null default 'quote'
                          check (status in ('quote', 'active', 'expired', 'superseded', 'cancelled')),
  signed_at             timestamptz,
  notes                 text,
  created_at            timestamptz default now(),
  created_by            text,

  -- Regimene krever ulike felter. Databasen skal si fra, ikke UI-et alene.
  -- term_end null paa en kampanje = total buyout (takstkortets "evig", faktor
  -- 4). Det er en ekte avtaleform, saa sluttdato kan IKKE vaere paakrevd her --
  -- bare medium og territorium, som er det som definerer bruken.
  constraint licence_campaign_felter check (
    kind <> 'campaign' or (media_class is not null and territory is not null)
  ),
  constraint licence_work_felter check (
    kind <> 'work' or (work_title is not null and production_tier is not null and role_scope is not null)
  ),
  -- Et verk er evigvarende: en sluttdato der ville vaert en skjult loegn.
  constraint licence_work_uten_sluttdato check (kind <> 'work' or term_end is null)
);

create index if not exists licences_actor_idx  on public.licences(actor_id);
create index if not exists licences_tenant_idx on public.licences(tenant_id);
create index if not exists licences_status_idx on public.licences(status);

-- 2) Fordelingen ------------------------------------------------------------
-- NB (Lars 20.09): det finnes TO beregningsgrunnlag. Kutt av KUNDEPRISEN
-- (infrastrukturavgift, byraaets margin) og kutt av SKUESPILLERENS HONORAR
-- (agent- og managerprovisjon). Forhandles honoraret ned, faller alt i den
-- andre gruppen forholdsmessig -- og det maa ligge i modellen, ikke i hodet
-- til den som fakturerer. Derfor `basis`.
--
-- Beloepet fryses som kroner. `pct` er bare spor av hva som ble avtalt.

create table if not exists public.licence_splits (
  id              uuid primary key default gen_random_uuid(),
  licence_id      uuid not null references public.licences(id) on delete cascade,
  party_type      text not null check (party_type in ('rights_holder', 'agent', 'agency', 'platform', 'other')),
  party_tenant_id uuid references public.tenants(id),
  party_label     text,
  basis           text not null check (basis in ('customer_fee', 'actor_fee')),
  pct             numeric(6,3),
  amount_nok      numeric(12,2) not null,
  created_at      timestamptz default now()
);

create index if not exists licence_splits_licence_idx on public.licence_splits(licence_id);

-- 3) Trinnene ---------------------------------------------------------------
-- Etterbetaling som RADER, ikke som prosa i en avtaletekst. "Kinopremiere
-- +25 %" er en FRAMTIDIG forpliktelse; staar den bare i avtaleteksten, blir
-- den aldri fakturert. Det er den klassiske lekkasjen i denne avtaletypen.
--
-- Trinn, ikke prosent av inntekt: prosent krever innsyn i produsentens
-- regnskap, og det faar du ikke. En hendelse begge parter kan observere er
-- haandhevbar uten revisjon.

create table if not exists public.licence_steps (
  id            uuid primary key default gen_random_uuid(),
  licence_id    uuid not null references public.licences(id) on delete cascade,
  trigger_kind  text not null check (trigger_kind in ('theatrical_release', 'international_sale', 'streamer_pickup', 'custom')),
  label         text,
  pct_of_fee    numeric(6,3),
  amount_nok    numeric(12,2) not null,
  actor_nok     numeric(12,2) not null default 0,
  status        text not null default 'pending'
                  check (status in ('pending', 'triggered', 'invoiced', 'paid', 'waived')),
  triggered_at  timestamptz,
  created_at    timestamptz default now()
);

create index if not exists licence_steps_licence_idx on public.licence_steps(licence_id);
create index if not exists licence_steps_status_idx  on public.licence_steps(status);

-- 4) Maaleren peker paa hjemmelen -------------------------------------------
-- Uten denne koblingen er hovedboken en forbruksmaaler. Med den er den et
-- klareringsregister: hvert generert aktivum peker paa lisensen som hjemler
-- det, og "var dette autorisert?" blir et oppslag i stedet for en gjetning.
alter table public.voice_usage_events
  add column if not exists licence_id uuid references public.licences(id);

create index if not exists voice_usage_events_licence_idx on public.voice_usage_events(licence_id);

-- 5) Takstkort per tenant ---------------------------------------------------
-- Kortet er en TILBUDSGENERATOR, ikke en prisliste: den som har avtalen med
-- rettighetshaveren setter sine egne satser. Tom kolonne = plattformens kort
-- (lib/rateCard.ts). Oppslaget gaar lisens > skuespiller > tenant > plattform.
alter table public.tenants
  add column if not exists rate_card jsonb;

-- 6) Laasing ----------------------------------------------------------------
-- Samme moenster som 065/068: ingen anon-tilgang, RLS paa som belte og
-- bukseseler. Service-noekkelen gaar utenom RLS.
revoke all on public.licences       from anon, authenticated;
revoke all on public.licence_splits from anon, authenticated;
revoke all on public.licence_steps  from anon, authenticated;

alter table public.licences       enable row level security;
alter table public.licence_splits enable row level security;
alter table public.licence_steps  enable row level security;

grant select, insert, update on public.licences       to service_role;
grant select, insert, update, delete on public.licence_splits to service_role;
grant select, insert, update, delete on public.licence_steps  to service_role;

-- 7) Opptjent, utvidet ------------------------------------------------------
-- actor_earnings summerte bare maaleren. Naar rettigheten ligger i lisensen,
-- ville /min-stemme vist et honorar paa noen kroner mens de store pengene var
-- usynlige. Nye kolonner legges TIL; de tre gamle beholder navn og betydning,
-- saa eksisterende kallsteder er uroert.
-- NB: `create or replace` kan IKKE endre returtypen til en funksjon som
-- returnerer en tabell ("cannot change return type of existing function").
-- Den maa slippes foerst. Trygt her: hele skriptet kjoerer i en transaksjon,
-- saa RPC-en er aldri borte for en samtidig forespoersel.
drop function if exists public.actor_earnings(uuid);

create or replace function public.actor_earnings(p_actor uuid)
returns table (
  uses bigint,
  to_actor_nok numeric,
  from_customers_nok numeric,
  licences bigint,
  licence_to_actor_nok numeric,
  licence_from_customers_nok numeric
)
language sql
stable
as $$
  select
    (select count(*) from public.voice_usage_events where actor_id = p_actor)::bigint,
    (select coalesce(sum(actor_rate_nok), 0) from public.voice_usage_events where actor_id = p_actor)::numeric,
    (select coalesce(sum(customer_price_nok), 0) from public.voice_usage_events where actor_id = p_actor)::numeric,
    -- Kun lisenser som faktisk gjelder. Et TILBUD er ikke opptjent, og en
    -- kansellert avtale skal ikke staa som penger noen har til gode.
    (select count(*) from public.licences
      where actor_id = p_actor and status in ('active', 'expired'))::bigint,
    (select coalesce(sum(fee_actor_nok), 0) from public.licences
      where actor_id = p_actor and status in ('active', 'expired'))::numeric,
    (select coalesce(sum(fee_customer_nok), 0) from public.licences
      where actor_id = p_actor and status in ('active', 'expired'))::numeric
$$;

revoke all on function public.actor_earnings(uuid) from public;
grant execute on function public.actor_earnings(uuid) to service_role;

notify pgrst, 'reload schema';

-- Kontroll: tabellene finnes, koblingen finnes, og RPC-en svarer med seks
-- kolonner (null-uuid gir bare nuller -- poenget er at signaturen er ny).
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('licences', 'licence_splits', 'licence_steps')
order by table_name;

select count(*) as licence_id_paa_hendelser from information_schema.columns
where table_schema = 'public' and table_name = 'voice_usage_events' and column_name = 'licence_id';

select * from public.actor_earnings('00000000-0000-0000-0000-000000000000'::uuid);
