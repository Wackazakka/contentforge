-- Innkrevingsmodellen: hva som faktisk ble betalt, og hva vi har betalt videre.
-- (Lars 2026-08-07, etter aa ha veid faktura- mot innkrevingsmodellen.)
--
-- MODELLEN: sluttkunden (artisten) betaler med kort til OSS. Vi holder pengene,
-- trekker vaar andel, og betaler white-labelen resten hver maaned. Kredittene er
-- forskuddsbetalt, saa kontantene er inne foer noe forbrukes - vi legger aldri ut
-- for leverandoerene.
--
-- HULL 1 - vi lagret ikke hva kunden faktisk betalte.
-- org_topups.amount_nok er SALDOVERDIEN (kreditter x katalogkurs 0,10), ikke
-- belopet som ble trukket paa kortet. De er FORSKJELLIGE: pakken
-- «privat-mellom» koster 500 kr og gir 5 500 kreditter = 550 kr i kjoepekraft.
-- Det virkelige belopet laa kun i Stripe-metadataen og forsvant. Uten det kan
-- ingen regne ut hvor mye kontanter som er kommet inn, som er hele grunnlaget
-- for modellen.
--
-- HULL 2 - ingen kvittering paa utbetaling. Betalte du partneren i august,
-- husket ingenting det, og samme tall dukket opp igjen i september.
--
-- RABATTEN: differansen mellom betalt og saldoverdi er en volumrabatt VI gir.
-- Uten fordeling ble den tatt helt fra vaar margin, selv om det var partnerens
-- kunde som fikk den. Avregningen deler den naa forholdsmessig - se
-- app/api/settlement/route.ts.
--
-- ASCII-only: Supabase-editoren tygger ae/oe/aa feil ved innliming.

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

-- 1) Hva kunden faktisk betalte, ved siden av saldoverdien.
alter table public.org_topups add column if not exists paid_nok numeric(12,2);
alter table public.org_topups add column if not exists paid_currency text;

comment on column public.org_topups.amount_nok is
  'SALDOVERDI som legges til kontoen (kreditter x 0,10). IKKE det kunden betalte - se paid_nok.';
comment on column public.org_topups.paid_nok is
  'Belopet som faktisk ble trukket, i paid_currency. Tomt for manuelle/gave-paafyll (bonus_nok) og for rader fra foer 2026-08-07.';
comment on column public.org_topups.paid_currency is
  'Valutaen kunden betalte i (nok/gbp). Tomt naar paid_nok er tomt.';

-- 2) Utbetalinger til white-labelen. En rad per gang du betaler ut.
create table if not exists public.partner_payouts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete restrict,
  periode_fra  date not null,
  periode_til  date not null,
  amount_nok   numeric(12,2) not null,
  betalt_dato  date not null default current_date,
  note         text,
  created_at   timestamptz not null default now(),
  constraint partner_payouts_periode_check check (periode_til >= periode_fra),
  constraint partner_payouts_amount_check check (amount_nok >= 0)
);

comment on table public.partner_payouts is
  'Registrerte utbetalinger til en white-label. Avregningen trekker disse fra, saa «til gode» ikke viser samme belop igjen maaneden etter.';

create index if not exists partner_payouts_tenant_periode_idx
  on public.partner_payouts (tenant_id, periode_fra, periode_til);

-- Kun service_role skriver her (avregnings-endepunktet). Ingen anon-tilgang.
alter table public.partner_payouts enable row level security;

-- PostgREST cacher skjemaet; uten dette svarer API-et «table not found».
notify pgrst, 'reload schema';

-- GRANT-fella: uten dette svarer PostgREST «table not found in schema cache»,
-- som ser ut som feil prosjekt. Kun service_role - tabellen er intern.
grant select, insert on public.partner_payouts to service_role;
notify pgrst, 'reload schema';
