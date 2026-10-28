-- 127: Sangere — ekte og virtuelle — og sangmodellene deres (Lars 28.10.2026).
--
-- HVA SOM KOMMER INN:
--   1. En tvilling kan være et menneske eller en VIRTUELL ARTIST: en fiktiv
--      artist med stemme og utseende laget med verktøy (Suno, bildeprogrammer).
--      Rettighetshaveren er eieren av artisten, og det er eierens identitet
--      som bekreftes — med de samme reglene som for alle andre (116/125).
--   2. Sang som eget tilbud, ved siden av stemme (tale) og ansikt.
--   3. Sangmodeller: én RVC-modell per sanger (lib/rvc.ts), trent hos
--      Replicate og lagret i vår private bøtte, slik ansiktsmodellene er.
--
-- 🔑 MISBRUKET VI MÅ STENGE: noen registrerer en kjent sanger som «virtuell».
-- Derfor erklæringen fryst på raden (lib/sang.ts, VIRTUELL_ERKLAERING), merking
-- der artisten vises, og kilden til hver modell: laget med verktøy, eller sunget
-- av et menneske som står navngitt. Ansiktene går gjennom den samme
-- dublettsjekken som alle andre (102).
--
-- 🔑 EN MODELL TAS I BRUK FØRST NÅR RETTIGHETSHAVEREN HAR SAGT JA, og den
-- aktive modellen er en del av tvillingversjonen (112): bytte av sangmodell gir
-- ny versjon, og en lisens utvides aldri stille.
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
-- 1. Menneske eller virtuell, og sang som tilbud
-- ─────────────────────────────────────────────────────────────────────────
alter table public.voice_actors
  add column if not exists artist_kind text not null default 'human',
  add column if not exists offers_singing boolean not null default false,
  add column if not exists virtual_declaration text,
  add column if not exists virtual_declared_at timestamptz;

alter table public.voice_actors drop constraint if exists voice_actors_artist_kind_check;
alter table public.voice_actors
  add constraint voice_actors_artist_kind_check check (artist_kind in ('human', 'virtual'));

-- En virtuell artist uten eierens erklæring finnes ikke.
alter table public.voice_actors drop constraint if exists voice_actors_virtuell_erklaert;
alter table public.voice_actors
  add constraint voice_actors_virtuell_erklaert
    check (artist_kind <> 'virtual' or (virtual_declaration is not null and virtual_declared_at is not null));

comment on column public.voice_actors.artist_kind is
  'human = et menneske; virtual = en fiktiv artist laget med verktøy. Rettighetshaveren er eieren.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Sangmodellene
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.singing_models (
  id                  uuid primary key default gen_random_uuid(),
  actor_id            uuid not null references public.voice_actors(id) on delete restrict,
  tenant_id           uuid not null references public.tenants(id) on delete restrict,
  provider            text not null default 'rvc',
  status              text not null default 'training',
  -- Hvor opptakene kommer fra, og erklæringen som gjaldt — fryst ordrett.
  source              text not null,
  source_note         text,              -- verktøyet, eller navnet på sangeren
  declaration         text not null,
  declared_by         text not null,
  declared_at         timestamptz not null default now(),
  -- Treningssettet: zip i den private bøtta, med fingeravtrykket regnet i
  -- nettleseren før opplasting.
  training_set_path   text not null,
  training_set_sha256 text,
  training_seconds    numeric,
  -- Jobben hos leverandøren, og versjonen den kjørte på.
  external_id         text,
  provider_version    text,
  epochs              int,
  -- Modellen, når den er kopiert hit og lest tilbake (sb://<bøtte>/<sti>).
  model_path          text,
  model_sha256        text,
  model_bytes         bigint,
  flytt_startet       timestamptz,
  last_error          text,
  -- Prøven rettighetshaveren lytter på før hun svarer.
  sample_input_path   text,
  sample_job_id       text,
  sample_path         text,
  approval_status     text not null default 'pending',
  approved_at         timestamptz,
  approved_by         text,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint singing_models_provider check (provider in ('rvc')),
  constraint singing_models_status check (status in ('training', 'ready', 'failed', 'withdrawn')),
  constraint singing_models_source check (source in ('recorded', 'generated')),
  constraint singing_models_approval check (approval_status in ('pending', 'approved', 'rejected')),
  -- Godkjent betyr at noen har hørt en ferdig modell.
  constraint singing_models_godkjent check (approval_status <> 'approved' or (status in ('ready', 'withdrawn') and approved_at is not null and approved_by is not null)),
  constraint singing_models_ferdig check (status <> 'ready' or model_path is not null)
);

create index if not exists singing_models_actor_idx on public.singing_models (actor_id, created_at desc);
create index if not exists singing_models_training_idx on public.singing_models (status) where status = 'training';

-- Den aktive modellen. Settes bare når modellen er ferdig og godkjent (koden).
alter table public.voice_actors
  add column if not exists singing_model_id uuid references public.singing_models(id) on delete restrict;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Tvillingversjonen kjenner sangmodellen (112/113)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.twin_versions add column if not exists singing_model_id text;

alter table public.twin_versions drop constraint if exists twin_versions_change_check;
alter table public.twin_versions
  add constraint twin_versions_change_check
    check (change in ('opprettet', 'ansikt', 'stemme', 'ansikt+stemme', 'aldersmodeller', 'sang', 'flere'));

create or replace function public.tvilling_ny_versjon() returns trigger
language plpgsql as $$
declare ansikt boolean; stemme boolean; sang boolean;
begin
  ansikt := nullif(new.face_character_id::text, '') is distinct from nullif(old.face_character_id::text, '');
  stemme := nullif(new.elevenlabs_voice_id, '') is distinct from nullif(old.elevenlabs_voice_id, '');
  sang := new.singing_model_id is distinct from old.singing_model_id;
  if not (ansikt or stemme or sang) then
    -- Aldersmodellene (113) har alt laget versjonen og løftet nummeret.
    if new.twin_version = old.twin_version + 1 and exists (
      select 1 from public.twin_versions where actor_id = new.id and version = new.twin_version
    ) then return new; end if;
    new.twin_version := old.twin_version;
    return new;
  end if;
  new.twin_version := old.twin_version + 1;
  insert into public.twin_versions (actor_id, version, face_character_id, elevenlabs_voice_id, singing_model_id, change, age_models)
  values (new.id, new.twin_version, nullif(new.face_character_id::text, ''), nullif(new.elevenlabs_voice_id, ''),
          new.singing_model_id::text,
          case when sang and (ansikt or stemme) then 'flere'
               when sang then 'sang'
               when ansikt and stemme then 'ansikt+stemme'
               when ansikt then 'ansikt' else 'stemme' end,
          coalesce((select age_models from public.twin_versions where actor_id = new.id and version = old.twin_version), '[]'::jsonb));
  return new;
end $$;

-- Aldersmodellene lager egne versjoner — de må ta sangmodellen med seg.
create or replace function public.tvilling_aldersmodeller_endret() returns trigger
language plpgsql as $$
declare
  aktoer uuid := coalesce(new.actor_id, old.actor_id);
  naa_versjon int;
  gammelt jsonb;
  nytt jsonb;
begin
  select twin_version into naa_versjon from public.voice_actors where id = aktoer;
  if naa_versjon is null then return null; end if;
  nytt := public.aldersmodeller_bilde(aktoer);
  select age_models into gammelt from public.twin_versions where actor_id = aktoer and version = naa_versjon;
  if public.aldersmodeller_noekkel(gammelt) is not distinct from public.aldersmodeller_noekkel(nytt) then
    return null;
  end if;
  insert into public.twin_versions (actor_id, version, face_character_id, elevenlabs_voice_id, singing_model_id, change, age_models)
  select aktoer, naa_versjon + 1, tv.face_character_id, tv.elevenlabs_voice_id, tv.singing_model_id, 'aldersmodeller', nytt
    from public.twin_versions tv where tv.actor_id = aktoer and tv.version = naa_versjon;
  update public.voice_actors set twin_version = naa_versjon + 1 where id = aktoer;
  return null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Stenging (096/097): RLS på OG rettighetene trukket
-- ─────────────────────────────────────────────────────────────────────────
alter table public.singing_models enable row level security;
revoke all on table public.singing_models from anon, authenticated;
grant select, insert, update on table public.singing_models to service_role;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Kontroll (én rad, alle skal være true)
-- ─────────────────────────────────────────────────────────────────────────
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'voice_actors' and column_name = 'artist_kind') as har_artisttype,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'voice_actors' and column_name = 'singing_model_id') as har_sangmodell,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'twin_versions' and column_name = 'singing_model_id') as versjon_kjenner_sang,
  (select relrowsecurity from pg_class where oid = 'public.singing_models'::regclass) as sang_rls,
  not exists (select 1 from information_schema.role_table_grants
               where table_schema = 'public' and table_name = 'singing_models'
                 and grantee in ('anon', 'authenticated')) as stengt_for_anon,
  not exists (select 1 from public.voice_actors where artist_kind <> 'human') as alle_er_mennesker_ennaa;
