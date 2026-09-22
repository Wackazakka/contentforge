-- 2026-09-22: agent/manager-provisjon paa bruksinntekt.
-- Kjoert mot wxnevywhtmovangkobal. Verifisert: 2 nye tabeller, 2 kolonner paa
-- voice_actors, 4 paa actor_payouts, 0 rader uten gross_nok etter backfill,
-- og begge nye tabeller staar med RLS paa og uten anon-rettigheter.
-- Skrankene er proevd begge veier i en transaksjon som ble rullet tilbake:
-- 150 % avvist med 23514, 15 % sluppet gjennom. Ingen testrader staar igjen.
--
-- PROBLEMET. Pengene kommer to veier, og bare den ene kjenner en agent:
--   Lisens   -> licence_splits med party_type 'agent', basis 'actor_fee'.
--               Ferdig bygget og testet. 0 lisenser solgt.
--   Per bruk -> voice_usage_events har actor_rate_nok og customer_price_nok.
--               Ingen tredjepart finnes. 55 rader, og all bevegelse hittil.
-- Et byraa som kommer med stallen sin ville faatt 0 kr av det banken
-- faktisk gjoer.
--
-- 🔑 IKKE EN RAD PER GENERERING. licence_splits virker fordi en lisens er
-- EN hendelse med store tall. Bruk er tusenvis av hendelser med smaa: en
-- audition-lesning til 0,6 kr skal ikke foede tre regnskapsrader. Prosenten
-- ligger derfor paa RELASJONEN, og beloepet regnes og FRYSES ved avregning
-- — samme prinsipp som lisensen bruker naar den fryser det avtalte beloepet
-- paa raden. Uten frysing ville en justert prosent skrevet om historikken,
-- og et oppgjoer som endrer seg i ettertid er ikke et oppgjoer.
--
-- 🔑 EN AGENT ER IKKE EN TENANT. En tenant er en egen doer med egen
-- merkevare og EGEN BANK — og banken arves nedover, aldri oppover. Legges
-- Pullman inn som tenant under twinledger, blir skuespillerne deres eid av
-- Pullmans bank og USYNLIGE i TwinLedgers katalog. Stikk motsatt av hensikten.
-- Agenten bringer folk inn i VAAR bank og tar sitt av honoraret deres.
--
-- ⚠️ NAVNET. `agent_profiles` finnes allerede og er noe HELT annet — en doed
-- ReelHome-tabell for eiendomsmeglere (portrett, logo, jingle), brukt i null
-- filer. Derfor `talent_agents`, saa ingen forveksler dem om to aar.
--
-- ⚠️ DENNE MIGRASJONEN ENDRER INGEN OPPFOERSEL. Den legger ut kolonnene.
-- Avregningen maa laere aa regne og fryse kuttet, og /min-stemme maa laere aa
-- vise brutto/kutt/netto — ellers ser skuespilleren et tall som ikke stemmer
-- med kontoutskriften hennes. Skjema foerst, kode etterpaa; motsatt vei gaar
-- ikke, for koden har ingenting aa skrive til.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Agenten
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.talent_agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,                 -- hvilken bank agenten opererer i
  name text not null,
  contact_email text,
  org_nr text,                             -- utbetaling gaar til et foretak
  -- Standardsats. En stjerne forhandler egen sats; den settes paa raden
  -- hennes og overstyrer denne. Null her = maa settes per skuespiller.
  default_commission_pct numeric,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint talent_agents_pct_gyldig
    check (default_commission_pct is null
           or (default_commission_pct >= 0 and default_commission_pct <= 100))
);

create index if not exists talent_agents_tenant_idx
  on public.talent_agents (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Koblingen skuespiller -> agent
-- ─────────────────────────────────────────────────────────────────────────
alter table public.voice_actors
  add column if not exists talent_agent_id uuid references public.talent_agents(id),
  -- Null = bruk agentens standardsats. Satt = forhandlet for nettopp henne.
  add column if not exists agent_commission_pct numeric;

alter table public.voice_actors
  drop constraint if exists voice_actors_agent_pct_gyldig;
alter table public.voice_actors
  add constraint voice_actors_agent_pct_gyldig
    check (agent_commission_pct is null
           or (agent_commission_pct >= 0 and agent_commission_pct <= 100));

create index if not exists voice_actors_agent_idx
  on public.voice_actors (talent_agent_id) where talent_agent_id is not null;

-- ⚠️ AA SLETTE KOBLINGEN AVSLUTTER FORHOLDET, den omskriver ikke historikk:
-- kuttene som alt er frosset paa utbetalingene staar. Det er med vilje at
-- det ikke finnes `agent_since`/`agent_until` her — datoene som betyr noe
-- er periodene paa utbetalingsradene, og de er allerede der.

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Det frosne kuttet paa skuespillerens oppgjoer
-- ─────────────────────────────────────────────────────────────────────────
-- `amount_nok` betyr fortsatt «det skuespilleren faar». Uten agent er netto
-- lik brutto, saa meningen skifter ikke — men regnestykket maa kunne leses
-- av raden alene den dagen noen spoer hvorfor beloepet ble som det ble.
alter table public.actor_payouts
  add column if not exists gross_nok numeric,
  add column if not exists talent_agent_id uuid references public.talent_agents(id),
  add column if not exists agent_pct numeric,
  add column if not exists agent_cut_nok numeric not null default 0;

-- Historikken far et aerlig tall framfor null: uten agent var brutto = netto.
update public.actor_payouts set gross_nok = amount_nok where gross_nok is null;

alter table public.actor_payouts
  drop constraint if exists actor_payouts_kutt_gyldig;
alter table public.actor_payouts
  add constraint actor_payouts_kutt_gyldig
    check (agent_cut_nok >= 0
           and (gross_nok is null or agent_cut_nok <= gross_nok));

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Agentens eget oppgjoer
-- ─────────────────────────────────────────────────────────────────────────
-- 🔑 EGEN TABELL, ikke en rad i actor_payouts. Pullman vil ha EN overfoering
-- i maaneden som dekker hele stallen — ikke tretti. Samme grep som
-- skuespilleren: mange hendelser, ett oppgjoer. Fordelingen per skuespiller
-- ligger paa actor_payouts-radene, saa summen kan alltid etterproeves.
-- (Formen speiler `partner_payouts`, som gjoer det samme for tenant-ledd.)
create table if not exists public.talent_agent_payouts (
  id uuid primary key default gen_random_uuid(),
  talent_agent_id uuid not null references public.talent_agents(id),
  tenant_id uuid not null,
  periode_fra date not null,
  periode_til date not null,
  amount_nok numeric not null,
  betalt_dato date,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint talent_agent_payouts_beloep check (amount_nok >= 0)
);

create index if not exists talent_agent_payouts_agent_idx
  on public.talent_agent_payouts (talent_agent_id, periode_fra);

-- Ett oppgjoer per agent per periode — ellers dobbeltbetaler man ved et
-- dobbeltklikk, og det oppdages foerst i banken.
create unique index if not exists talent_agent_payouts_unik
  on public.talent_agent_payouts (talent_agent_id, tenant_id, periode_fra, periode_til);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Stenging — laerdommen fra 096
-- ─────────────────────────────────────────────────────────────────────────
-- `ALTER DEFAULT PRIVILEGES` gir anon og authenticated fulle rettigheter paa
-- hver NY tabell. `enable row level security` alene slaar paa laget, men
-- lar rettigheten staa. Begge deler, ellers staar utbetalingssporet med
-- ett lag der resten av banken har to.
alter table public.talent_agents        enable row level security;
alter table public.talent_agent_payouts enable row level security;
revoke all on table public.talent_agents        from anon, authenticated;
revoke all on table public.talent_agent_payouts from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Verifisering
-- ─────────────────────────────────────────────────────────────────────────
-- select count(*) as agenter from public.talent_agents;
-- select count(*) filter (where gross_nok is null) as uten_brutto from public.actor_payouts;  -- skal vaere 0
-- select c.relname, c.relrowsecurity,
--        exists(select 1 from information_schema.role_table_grants g
--                where g.table_schema='public' and g.table_name=c.relname
--                  and g.grantee in ('anon','authenticated')) as har_grant
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relname like 'talent_agent%';
--  -- forventet: relrowsecurity=true, har_grant=false paa begge
