-- 068: Utbetalingsspor per rettighetshaver + samlet opptjening uten radtak.
--
-- Bakgrunn (03.09.2026): hovedboken (voice_usage_events) registrerer hver bruk
-- perfekt, men systemet visste ikke hva som var BETALT til den enkelte
-- rettighetshaver. partner_payouts dekker byraaene; det fantes ingen
-- tilsvarende tabell for menneskene. Maaned to viste samme «til gode» om igjen.
--
-- To ting her:
--   1) actor_payouts — speiler partner_payouts, men per skuespiller.
--   2) actor_earnings(uuid) — SUM over hele historikken i databasen.
--      Admin-API-et aggregerer over de siste 1000 hendelsene; det er stille
--      feil for en travel stemme, og et utbetalingsgrunnlag maa vaere eksakt.
--
-- ---------------------------------------------------------------------------
-- SPERRE: ReelHome har tabeller med lignende navn i et ANNET Supabase-prosjekt.
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

-- 1) Utbetalinger til rettighetshaver ---------------------------------------

create table if not exists public.actor_payouts (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid not null references public.voice_actors(id) on delete restrict,
  -- Den som har avtalen med rettighetshaveren, og dermed betaler (avtalens pkt. 7).
  tenant_id    uuid not null references public.tenants(id) on delete restrict,
  periode_fra  date not null,
  periode_til  date not null,
  amount_nok   numeric(12,2) not null,
  betalt_dato  date not null default current_date,
  note         text,
  -- E-posten til adminen som registrerte utbetalingen. Revisjonsspor, ikke FK:
  -- en admin som slutter skal ikke rive historikken.
  created_by   text,
  created_at   timestamptz not null default now(),
  constraint actor_payouts_periode check (periode_til >= periode_fra),
  constraint actor_payouts_amount  check (amount_nok >= 0)
);

create index if not exists actor_payouts_actor_idx
  on public.actor_payouts (actor_id, periode_fra desc);

-- RLS paa, ingen policies: kun service_role kommer til. Samme moenster som
-- partner_payouts. Uten GRANT svarer PostgREST «table not found in schema cache».
alter table public.actor_payouts enable row level security;
grant select, insert on public.actor_payouts to service_role;

-- 2) Samlet opptjening per rettighetshaver ----------------------------------
--
-- Brukes som utbetalingsGRUNNLAG. Summerer ALLE rader, ikke de siste 1000.

create or replace function public.actor_earnings(p_actor uuid)
returns table (uses bigint, to_actor_nok numeric, from_customers_nok numeric)
language sql
stable
as $$
  select
    count(*)::bigint,
    coalesce(sum(actor_rate_nok), 0)::numeric,
    coalesce(sum(customer_price_nok), 0)::numeric
  from public.voice_usage_events
  where actor_id = p_actor
$$;

revoke all on function public.actor_earnings(uuid) from public;
grant execute on function public.actor_earnings(uuid) to service_role;

notify pgrst, 'reload schema';
