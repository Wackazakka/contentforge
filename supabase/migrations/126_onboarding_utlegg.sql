-- 126: Hvem betaler stemmeabonnementet ved onboarding, og påmeldingsavgift
-- for drop-ins (Lars 28.10.2026).
--
-- BAKGRUNNEN. Stemmeklonen lages på skuespillerens EGEN konto hos
-- stemmeleverandøren, som må stå på Creator (~22 USD) én måned for at klonen
-- kan deles med oss. Abonnementet må betales med et kort på den kontoen — vi
-- kan ikke betale det for dem. I praksis betaler skuespilleren i møtet.
--
-- REGLENE (Lars 28.10):
--   Kom hun gjennom et byrå  -> abonnementet dekkes, enten av TwinLedger eller
--                               av byrået. Det er en innstilling PER BYRÅ.
--                               Hun får pengene tilbake MED EN GANG, ikke ved
--                               neste oppgjør. Dekker byrået, faktureres byrået.
--   Drop-in (ingen byrå)     -> betaler abonnementet selv, og betaler en
--                               påmeldingsavgift til oss som dekker treningen
--                               av ansiktsmodellen.
--
-- 🔑 HVEM SOM BETALER, FRYSES PÅ RADEN. En endret byråinnstilling gjelder neste
-- skuespiller, ikke den som alt er refundert — samme prinsipp som byråets
-- prosent (117).
--
-- 🔑 UTLEGG ER IKKE OPPTJENING. Refusjonen går aldri gjennom actor_payouts:
-- der ville den blitt trukket fra det hun har til gode, og byrået ville tatt
-- sin prosent av den. Egen tabell, egen sum.
--
-- 🔑 AVGIFTEN ER AV TIL DEN SETTES. tenants.enrollment_fee_nok er null, og da
-- skjer ingenting nytt. ⚠️ Sett den IKKE før Stripe står med live-nøkkel i
-- produksjon: med testnøkkelen avvises ekte kort, og en drop-in ville blitt
-- stående uten trening (admin kan frita, men det er ingen løsning).
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
-- 1. Byråets innstilling
-- ─────────────────────────────────────────────────────────────────────────
alter table public.talent_agents
  add column if not exists covers_onboarding text not null default 'platform';

alter table public.talent_agents drop constraint if exists talent_agents_covers_onboarding_gyldig;
alter table public.talent_agents
  add constraint talent_agents_covers_onboarding_gyldig
    check (covers_onboarding in ('platform', 'agency'));

comment on column public.talent_agents.covers_onboarding is
  'Hvem dekker stemmeabonnementet for skuespillere fra dette byrået: platform (TwinLedger) eller agency (byrået, faktureres).';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Påmeldingsavgiften, per bank
-- ─────────────────────────────────────────────────────────────────────────
alter table public.tenants
  add column if not exists enrollment_fee_nok numeric(12,2);

alter table public.tenants drop constraint if exists tenants_enrollment_fee_gyldig;
alter table public.tenants
  add constraint tenants_enrollment_fee_gyldig
    check (enrollment_fee_nok is null or enrollment_fee_nok >= 0);

comment on column public.tenants.enrollment_fee_nok is
  'Påmeldingsavgift for drop-ins som vil ha ansiktsmodell (dekker treningen). Null = ingen avgift.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Utlegget
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.onboarding_expenses (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  actor_id        uuid not null references public.voice_actors(id) on delete restrict,
  kind            text not null default 'voice_subscription',
  -- Det kortet hennes faktisk ble belastet, i kroner. Dollarbeløpet er
  -- informasjon; refusjonen er kronene.
  amount_nok      numeric(12,2) not null,
  amount_usd      numeric(12,2),
  payer           text not null,
  talent_agent_id uuid references public.talent_agents(id),
  refunded_at     timestamptz,
  refunded_by     text,
  invoiced_at     timestamptz,
  invoiced_by     text,
  note            text,
  created_by      text,
  created_at      timestamptz not null default now(),
  constraint onboarding_expenses_kind check (kind in ('voice_subscription')),
  constraint onboarding_expenses_beloep check (amount_nok > 0 and (amount_usd is null or amount_usd > 0)),
  constraint onboarding_expenses_payer check (payer in ('platform', 'agency', 'actor')),
  -- Dekker byrået, må vi vite hvilket — ellers vet ingen hvem som skal faktureres.
  constraint onboarding_expenses_byraa check (payer <> 'agency' or talent_agent_id is not null),
  -- Betaler hun selv, finnes det ingenting å refundere eller fakturere.
  constraint onboarding_expenses_egen check (payer <> 'actor' or (refunded_at is null and invoiced_at is null)),
  -- Byrået faktureres for det vi har lagt ut, ikke før.
  constraint onboarding_expenses_faktura check (invoiced_at is null or (payer = 'agency' and refunded_at is not null))
);

-- Ett abonnement per skuespiller. Det er også dobbeltklikk-vernet: samme
-- refusjon kan ikke føres to ganger.
create unique index if not exists onboarding_expenses_unik
  on public.onboarding_expenses (actor_id, kind);

create index if not exists onboarding_expenses_tenant_idx
  on public.onboarding_expenses (tenant_id, created_at desc);

create index if not exists onboarding_expenses_byraa_idx
  on public.onboarding_expenses (talent_agent_id) where talent_agent_id is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Påmeldingsavgiften som betaling
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.enrollment_fees (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete restrict,
  actor_id          uuid not null references public.voice_actors(id) on delete restrict,
  amount_nok        numeric(12,2) not null,
  status            text not null default 'pending',
  -- Idempotens-ankeret for webhooken, som production_payments.
  stripe_session_id text unique,
  paid_at           timestamptz,
  waived_by         text,
  created_at        timestamptz not null default now(),
  constraint enrollment_fees_beloep check (amount_nok >= 0),
  constraint enrollment_fees_status check (status in ('pending', 'paid', 'waived')),
  constraint enrollment_fees_fritak check (status <> 'waived' or waived_by is not null)
);

-- Én betalt (eller fritatt) avgift per skuespiller. Påbegynte økter kan det
-- være flere av — hun kan lukke kassen og prøve igjen.
create unique index if not exists enrollment_fees_en_per_aktoer
  on public.enrollment_fees (actor_id) where status in ('paid', 'waived');

create index if not exists enrollment_fees_actor_idx
  on public.enrollment_fees (actor_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Stenging (lærdommen fra 096/097): RLS på OG rettighetene trukket
-- ─────────────────────────────────────────────────────────────────────────
alter table public.onboarding_expenses enable row level security;
alter table public.enrollment_fees     enable row level security;
revoke all on table public.onboarding_expenses from anon, authenticated;
revoke all on table public.enrollment_fees     from anon, authenticated;
grant select, insert, update, delete on table public.onboarding_expenses to service_role;
grant select, insert, update on table public.enrollment_fees to service_role;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Kontroll (én rad, alle skal være true)
-- ─────────────────────────────────────────────────────────────────────────
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'talent_agents' and column_name = 'covers_onboarding') as har_byraa_innstilling,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'tenants' and column_name = 'enrollment_fee_nok') as har_avgift_kolonne,
  (select relrowsecurity from pg_class where oid = 'public.onboarding_expenses'::regclass) as utlegg_rls,
  (select relrowsecurity from pg_class where oid = 'public.enrollment_fees'::regclass) as avgift_rls,
  not exists (select 1 from information_schema.role_table_grants
               where table_schema = 'public' and table_name in ('onboarding_expenses', 'enrollment_fees')
                 and grantee in ('anon', 'authenticated')) as stengt_for_anon;
