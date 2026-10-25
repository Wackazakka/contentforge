-- 2026-10-25: hovedboken kan bare legges til, og radene er hash-kjedet
-- (Lars: «Bygg punkt 1 nå»). Investordokumentet sier: «Hovedboken er en
-- hash-kjedet, append-only logg i vanlig database — ikke en offentlig
-- blokkjede.» Før dette var den en vanlig tabell: koden la bare til rader,
-- men basen hindret ingen i å endre eller slette dem.
--
-- 🔑 APPEND-ONLY. En rad kan ikke endres eller slettes, og tabellen kan ikke
-- tømmes. En feil rettes med en ny rad, slik som i regnskap. ÉN unntak:
-- pekerne til produkt, organisasjon, utkast og jobb kan settes til null når
-- det de peker på slettes (on delete set null) — ellers kunne ingen kunde
-- slette et produkt som har vært i bruk. Ingenting annet på raden kan røres.
--
-- 🔑 HASH-KJEDE. Hver rad får et fingeravtrykk (sha256) av innholdet sitt og
-- fingeravtrykket til raden før. Endres en gammel rad, stemmer ikke
-- fingeravtrykket — og kontroller_hovedboken() viser hvor. Siste fingeravtrykk
-- er hovedbokens ROTVERDI: den avhenger av hver eneste rad før den.
-- Neste trinn er å deponere rotverdien jevnlig hos en tredjepart, så heller
-- ikke vi kan skrive om historikken i ettertid uten at det oppdages.
--
-- 🔑 FINGERAVTRYKKET DEKKER EN FAST LISTE KOLONNER (versjon 1): hvem, hva,
-- når, hjemmel, beløpene, versjonen og meta. Listen er fast med vilje: en
-- kolonne som legges til senere, skal ikke endre fingeravtrykket til rader
-- som fantes før den. Pekerne som kan nulles (over), er ikke med.
-- Tidspunktet skrives alltid i UTC, uavhengig av hvem som regner.
--
-- 🔑 KJEDEN STARTER MED RADENE SLIK DE STÅR I DAG, i rekkefølgen de ble skrevet.
--
-- Stopper av seg selv om hovedboken har kaskadesletting fra en fremmednøkkel:
-- da ville en sletting et annet sted forsøkt å slette fra hovedboken, og det
-- må avklares først.

-- 0) Vern: ingen kaskadesletting inn i hovedboken
do $$
declare v text;
begin
  select string_agg(conname || ': ' || pg_get_constraintdef(oid), '; ') into v
  from pg_constraint
  where conrelid = 'public.voice_usage_events'::regclass and contype = 'f' and confdeltype = 'c';
  if v is not null then
    raise exception 'STOPP — hovedboken har kaskadesletting som må avklares før append-only: %', v;
  end if;
end $$;

-- 1) Kolonnene
alter table public.voice_usage_events
  add column if not exists kjede_seq bigint,
  add column if not exists prev_hash text,
  add column if not exists row_hash text,
  add column if not exists hash_versjon smallint;

create unique index if not exists voice_usage_events_kjede_seq_idx
  on public.voice_usage_events (kjede_seq) where kjede_seq is not null;

-- 2) Innholdet som fingeravtrykket regnes av (versjon 1)
create or replace function public.hovedbok_innhold(r public.voice_usage_events)
returns text
language sql stable
set timezone = 'UTC'
set extra_float_digits = 1
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', j->'id',
    'created_at', j->'created_at',
    'actor_id', j->'actor_id',
    'used_by_tenant_id', j->'used_by_tenant_id',
    'licence_id', j->'licence_id',
    'asset_type', j->'asset_type',
    'actor_rate_nok', j->'actor_rate_nok',
    'customer_price_nok', j->'customer_price_nok',
    'twin_version', j->'twin_version',
    'meta', j->'meta'
  ))::text
  from (select to_jsonb(r) as j) x
$$;

create or replace function public.hovedbok_hash(forrige text, innhold text)
returns text
language sql immutable
as $$
  select encode(sha256(convert_to(forrige || '|' || innhold, 'UTF8')), 'hex')
$$;

-- 3) Kjeden for radene som finnes (bare første gang)
do $$
declare
  r public.voice_usage_events%rowtype;
  forrige text := 'TwinLedger hovedbok · start';
  n bigint := 0;
  h text;
begin
  if exists (select 1 from public.voice_usage_events where row_hash is not null) then
    return;
  end if;
  for r in select * from public.voice_usage_events order by created_at, id loop
    n := n + 1;
    h := public.hovedbok_hash(forrige, public.hovedbok_innhold(r));
    update public.voice_usage_events
       set kjede_seq = n, prev_hash = forrige, row_hash = h, hash_versjon = 1
     where id = r.id;
    forrige := h;
  end loop;
end $$;

-- 4) Hver ny rad lenkes på kjeden. Navnet begynner med zz_ så den kjører
--    sist av før-triggerne: fingeravtrykket regnes av raden slik den lagres.
create or replace function public.hovedbok_kjed()
returns trigger
language plpgsql
as $$
declare siste record;
begin
  -- Én om gangen, ellers kunne to rader fått samme forgjenger.
  perform pg_advisory_xact_lock(hashtext('twinledger_hovedbok'));
  select kjede_seq, row_hash into siste
    from public.voice_usage_events
   where kjede_seq is not null
   order by kjede_seq desc
   limit 1;
  new.kjede_seq := coalesce(siste.kjede_seq, 0) + 1;
  new.prev_hash := coalesce(siste.row_hash, 'TwinLedger hovedbok · start');
  new.hash_versjon := 1;
  new.row_hash := public.hovedbok_hash(new.prev_hash, public.hovedbok_innhold(new));
  return new;
end $$;

drop trigger if exists zz_hovedbok_kjed on public.voice_usage_events;
create trigger zz_hovedbok_kjed
  before insert on public.voice_usage_events
  for each row execute function public.hovedbok_kjed();

-- 5) Append-only
create or replace function public.hovedbok_bare_tillegg()
returns trigger
language plpgsql
as $$
declare
  ny jsonb; gml jsonb; k text;
  frie text[] := array['product_id', 'organization_id', 'draft_id', 'job_id'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Hovedboken kan bare legges til — en rad kan ikke slettes. Rett med en ny rad.'
      using errcode = 'P0001', hint = 'LEDGER_APPEND_ONLY';
  end if;
  ny := to_jsonb(new); gml := to_jsonb(old);
  if (ny - frie) is distinct from (gml - frie) then
    raise exception 'Hovedboken kan bare legges til — en rad kan ikke endres. Rett med en ny rad.'
      using errcode = 'P0001', hint = 'LEDGER_APPEND_ONLY';
  end if;
  foreach k in array frie loop
    if (ny -> k) is distinct from (gml -> k) and (ny -> k) <> 'null'::jsonb then
      raise exception 'Hovedboken: pekeren % kan bare fjernes, ikke flyttes.', k
        using errcode = 'P0001', hint = 'LEDGER_APPEND_ONLY';
    end if;
  end loop;
  return new;
end $$;

create or replace function public.hovedbok_ingen_toemming()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Hovedboken kan ikke tømmes.' using errcode = 'P0001', hint = 'LEDGER_APPEND_ONLY';
end $$;

drop trigger if exists hovedbok_bare_tillegg on public.voice_usage_events;
create trigger hovedbok_bare_tillegg
  before update or delete on public.voice_usage_events
  for each row execute function public.hovedbok_bare_tillegg();

drop trigger if exists hovedbok_ingen_toemming on public.voice_usage_events;
create trigger hovedbok_ingen_toemming
  before truncate on public.voice_usage_events
  for each statement execute function public.hovedbok_ingen_toemming();

-- 6) Kontrollen: går hele kjeden og regner hvert fingeravtrykk på nytt
create or replace function public.kontroller_hovedboken()
returns table (rader bigint, uten_kjede bigint, brudd bigint, foerste_brudd bigint, rotverdi text)
language plpgsql stable
as $$
declare
  r public.voice_usage_events%rowtype;
  forrige text := 'TwinLedger hovedbok · start';
  forventet bigint := 0;
  b bigint := 0;
  fb bigint := null;
begin
  for r in select * from public.voice_usage_events where kjede_seq is not null order by kjede_seq loop
    forventet := forventet + 1;
    if r.kjede_seq <> forventet
       or r.prev_hash is distinct from forrige
       or r.row_hash is distinct from public.hovedbok_hash(r.prev_hash, public.hovedbok_innhold(r)) then
      b := b + 1;
      if fb is null then fb := r.kjede_seq; end if;
    end if;
    forrige := r.row_hash;
  end loop;
  return query
    select forventet,
           (select count(*) from public.voice_usage_events where kjede_seq is null),
           b, fb, forrige;
end $$;

revoke execute on function public.kontroller_hovedboken() from public, anon, authenticated;
grant execute on function public.kontroller_hovedboken() to service_role;

notify pgrst, 'reload schema';

-- Kontroll: select * from public.kontroller_hovedboken();
--   forventet: rader = antall rader, uten_kjede = 0, brudd = 0
