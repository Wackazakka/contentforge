-- 079: Oppgjoersvalg og royalty (Lars 20.09.2026)
--
-- BAKGRUNN. For en vokalist ligger den store pengen i at stemmen havner paa en
-- laat som gaar. Et fast honorar gir dem ingenting av den oppsiden; ren royalty
-- gir dem ingenting paa maaneder eller aar. Derfor tre modeller, valgt PER
-- AVTALE - ikke per artist, for samme vokalist vil ofte ha fast honorar for en
-- reklame og royalty for en utgivelse.
--
-- NB: ROYALTY KREVER EN KANAL VI KONTROLLERER.
-- Royalty av en masterinntekt vi ikke ser, er et loefte og ikke et produkt:
-- inntekten samles inn av distributoeren, og revisjonsrett er noe man har paa
-- papiret og aldri bruker. Gaar utgivelsen derimot gjennom IndigoBoom eller
-- TrickleTracks, passerer pengene vaart eget roer og royaltyen er
-- administrerbar. Derfor er betingelsen en REGEL I BASEN (se
-- licence_royalty_krever_kanal), ikke en advarsel i brukerflaten - da kan
-- ingen love noe vi ikke kan maale.
--
-- GRUNNLAGET er det TwinLedger FAKTISK MOTTAR for utgivelsen, ikke brutto fra
-- stroemmetjenesten. Det er det eneste tallet vi kan staa inne for, og
-- fradragskjeden er synlig i avregningen.
--
-- KADENSE: DSP-ene rapporterer 2-3 maaneder paa etterskudd via distributoeren.
-- En royalty-avregning kan derfor aldri vaere aa jour, og det maa staa i
-- avtalen med vokalisten - ikke oppdages av vedkommende.
--
-- ASCII-only (Supabase-editoren tygger ae/oe/aa ved innliming).

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'licences') then
    raise exception 'licences mangler - kjoer 078 foerst. Avbrutt uten endringer.';
  end if;
end $$;

-- 1) Oppgjoersvalget paa lisensen ------------------------------------------

alter table public.licences
  add column if not exists comp_model      text not null default 'fee',
  add column if not exists royalty_pct     numeric(6,3),
  add column if not exists royalty_basis   text not null default 'net_receipts',
  add column if not exists release_channel text,
  add column if not exists release_title   text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'licence_comp_model') then
    alter table public.licences add constraint licence_comp_model
      check (comp_model in ('fee', 'royalty', 'hybrid'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'licence_royalty_basis') then
    alter table public.licences add constraint licence_royalty_basis
      check (royalty_basis in ('net_receipts'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'licence_release_channel') then
    alter table public.licences add constraint licence_release_channel
      check (release_channel is null or release_channel in ('indigoboom', 'trickletracks', 'other'));
  end if;

  -- Kjernebetingelsen: royalty bare der vi ser inntekten.
  if not exists (select 1 from pg_constraint where conname = 'licence_royalty_krever_kanal') then
    alter table public.licences add constraint licence_royalty_krever_kanal
      check (
        comp_model = 'fee'
        or (release_channel in ('indigoboom', 'trickletracks') and royalty_pct is not null and royalty_pct > 0)
      );
  end if;
end $$;

-- 2) Artistens PREFERANSE (forslag, ikke laas) ------------------------------
-- Ligger paa artisten fordi den uttrykker hva vedkommende foretrekker; selve
-- valget tas per avtale. Samme moenster som takstkortet: foreslaas, ikke bestemmes.
alter table public.voice_actors
  add column if not exists comp_preference text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'actor_comp_preference') then
    alter table public.voice_actors add constraint actor_comp_preference
      check (comp_preference is null or comp_preference in ('fee', 'royalty', 'hybrid'));
  end if;
end $$;

-- 3) Avregningsperioder -----------------------------------------------------
-- En royalty er ikke ETT beloep, men en rapport som gjentar seg. Uten en egen
-- tabell ville den blitt et tall noen husket, og det er nettopp det
-- hovedboken finnes for aa slippe.

create table if not exists public.royalty_statements (
  id               uuid primary key default gen_random_uuid(),
  licence_id       uuid not null references public.licences(id) on delete restrict,
  period_start     date not null,
  period_end       date not null,
  -- Hvor tallene kommer fra. Fritekst i tillegg, for en distributoer kan
  -- rapportere flere kilder i samme periode.
  source           text,
  -- Informativt: rapportert brutto fra tjenestene.
  gross_nok        numeric(12,2),
  -- GRUNNLAGET: det TwinLedger faktisk mottok for utgivelsen i perioden.
  net_receipts_nok numeric(12,2) not null,
  artist_pct       numeric(6,3) not null,
  -- FRYST, som alle beloep i hovedboken.
  artist_nok       numeric(12,2) not null,
  note             text,
  created_at       timestamptz default now(),
  created_by       text,
  constraint royalty_periode check (period_end >= period_start)
);

create index if not exists royalty_statements_licence_idx on public.royalty_statements(licence_id);
create index if not exists royalty_statements_periode_idx on public.royalty_statements(period_start);

revoke all on public.royalty_statements from anon, authenticated;
alter table public.royalty_statements enable row level security;
grant select, insert, update, delete on public.royalty_statements to service_role;

-- 4) Opptjent, med royalty-leddet -------------------------------------------
-- Tredje ledd i hovedboken: maaleren (per generering), lisensene (bruksrett)
-- og royalty (andel av det utgivelsen faktisk tjente).
--
-- NB: create or replace kan IKKE endre returtypen paa en tabellfunksjon
-- ("cannot change return type of existing function") - den maa slippes foerst.
-- Samme felle som i 078.
drop function if exists public.actor_earnings(uuid);

create or replace function public.actor_earnings(p_actor uuid)
returns table (
  uses bigint,
  to_actor_nok numeric,
  from_customers_nok numeric,
  licences bigint,
  licence_to_actor_nok numeric,
  licence_from_customers_nok numeric,
  royalty_periods bigint,
  royalty_to_actor_nok numeric
)
language sql
stable
as $$
  select
    (select count(*) from public.voice_usage_events where actor_id = p_actor)::bigint,
    (select coalesce(sum(actor_rate_nok), 0) from public.voice_usage_events where actor_id = p_actor)::numeric,
    (select coalesce(sum(customer_price_nok), 0) from public.voice_usage_events where actor_id = p_actor)::numeric,
    (select count(*) from public.licences
      where actor_id = p_actor and status in ('active', 'expired'))::bigint,
    (select coalesce(sum(fee_actor_nok), 0) from public.licences
      where actor_id = p_actor and status in ('active', 'expired'))::numeric,
    (select coalesce(sum(fee_customer_nok), 0) from public.licences
      where actor_id = p_actor and status in ('active', 'expired'))::numeric,
    (select count(*) from public.royalty_statements s
      join public.licences l on l.id = s.licence_id
      where l.actor_id = p_actor)::bigint,
    (select coalesce(sum(s.artist_nok), 0) from public.royalty_statements s
      join public.licences l on l.id = s.licence_id
      where l.actor_id = p_actor)::numeric
$$;

revoke all on function public.actor_earnings(uuid) from public;
grant execute on function public.actor_earnings(uuid) to service_role;

notify pgrst, 'reload schema';

-- Kontroll 1: kolonnene og tabellen finnes
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='licences'
      and column_name in ('comp_model','royalty_pct','royalty_basis','release_channel','release_title')) as licence_kolonner,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='voice_actors' and column_name='comp_preference') as preferanse,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='royalty_statements') as avregningstabell;

-- Kontroll 2: RPC-en svarer med aatte kolonner
select * from public.actor_earnings('00000000-0000-0000-0000-000000000000'::uuid);
