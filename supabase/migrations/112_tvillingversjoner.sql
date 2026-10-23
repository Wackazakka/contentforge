-- 112: tvillingversjoner — en lisens festes til versjonen den klarerte (23.10.2026).
--
-- Investordokumentet: «Under TLID-en ligger versjoner: personen endrer seg,
-- opptakene fornyes, modellene forbedres. En lisens peker alltid paa en
-- bestemt versjon, slik at en produksjon vet noeyaktig hva den har klarert,
-- og slik at en ny versjon ikke stilltiende utvider gammel tillatelse.»
--
-- Foer dette pekte lisensen paa PERSONEN. Ble ansiktsmodellen byttet, fulgte
-- alle gamle lisenser stille med til den nye — akkurat det dokumentet sier
-- ikke skal skje.
--
-- 🔑 EN VERSJON ER ET OEYEBLIKKSBILDE AV KOMPONENTENE. Versjon 1 er det raden
-- har naa; hver gang ansiktsmodellen (face_character_id) eller stemmen
-- (elevenlabs_voice_id) byttes, lager DATABASEN versjon n+1. Ingen kodevei
-- kan bytte modell uten at det blir en versjon — triggeren gjoer det, ikke
-- applikasjonen. Versjonsnummeret kan ikke settes for haand.
--
-- 🔑 LISENSEN FESTES VED OPPRETTELSE og kan aldri flyttes (trigger). En ny
-- versjon krever en ny lisens.
--
-- 🔑 HOVEDBOKEN MATCHER PAA KOMPONENTEN SOM BLE BRUKT, ikke paa nummeret: en
-- ansiktslisens festet til v1 dekker fortsatt ansiktsbruk etter at bare
-- STEMMEN er byttet (v2), fordi ansiktsmodellen er den samme. Se
-- lib/twinVersions.ts.

-- ── Versjonene ──────────────────────────────────────────────────────────────
create table if not exists public.twin_versions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.voice_actors(id) on delete cascade,
  version int not null,
  -- Tekst, ikke uuid: sammenlignes med det produksjonen faktisk brukte, og
  -- typen paa voice_actors.face_character_id er ikke verdt aa gjette paa.
  face_character_id text,
  elevenlabs_voice_id text,
  change text not null check (change in ('opprettet', 'ansikt', 'stemme', 'ansikt+stemme')),
  created_at timestamptz not null default now(),
  unique (actor_id, version)
);
create index if not exists twin_versions_face on public.twin_versions (face_character_id) where face_character_id is not null;
create index if not exists twin_versions_voice on public.twin_versions (elevenlabs_voice_id) where elevenlabs_voice_id is not null;
alter table public.twin_versions enable row level security;
revoke all on public.twin_versions from anon, authenticated;

alter table public.voice_actors add column if not exists twin_version int not null default 1;

-- Versjon 1 for alle som finnes: det de har i dag.
insert into public.twin_versions (actor_id, version, face_character_id, elevenlabs_voice_id, change, created_at)
select id, twin_version, nullif(face_character_id::text, ''), nullif(elevenlabs_voice_id, ''), 'opprettet', coalesce(created_at, now())
from public.voice_actors
on conflict (actor_id, version) do nothing;

-- Ny rad → versjon 1.
create or replace function public.tvilling_foerste_versjon() returns trigger
language plpgsql as $$
begin
  insert into public.twin_versions (actor_id, version, face_character_id, elevenlabs_voice_id, change)
  values (new.id, new.twin_version, nullif(new.face_character_id::text, ''), nullif(new.elevenlabs_voice_id, ''), 'opprettet')
  on conflict (actor_id, version) do nothing;
  return new;
end $$;
drop trigger if exists tvilling_foerste_versjon on public.voice_actors;
create trigger tvilling_foerste_versjon after insert on public.voice_actors
  for each row execute function public.tvilling_foerste_versjon();

-- Byttet modell → ny versjon. Ellers staar nummeret fast.
create or replace function public.tvilling_ny_versjon() returns trigger
language plpgsql as $$
declare
  ansikt boolean;
  stemme boolean;
begin
  ansikt := nullif(new.face_character_id::text, '') is distinct from nullif(old.face_character_id::text, '');
  stemme := nullif(new.elevenlabs_voice_id, '') is distinct from nullif(old.elevenlabs_voice_id, '');
  if not (ansikt or stemme) then
    new.twin_version := old.twin_version;
    return new;
  end if;
  new.twin_version := old.twin_version + 1;
  insert into public.twin_versions (actor_id, version, face_character_id, elevenlabs_voice_id, change)
  values (new.id, new.twin_version, nullif(new.face_character_id::text, ''), nullif(new.elevenlabs_voice_id, ''),
          case when ansikt and stemme then 'ansikt+stemme' when ansikt then 'ansikt' else 'stemme' end);
  return new;
end $$;
drop trigger if exists tvilling_ny_versjon on public.voice_actors;
create trigger tvilling_ny_versjon before update on public.voice_actors
  for each row execute function public.tvilling_ny_versjon();

-- ── Lisensen festes ─────────────────────────────────────────────────────────
alter table public.licences add column if not exists twin_version int;
update public.licences l set twin_version = va.twin_version
  from public.voice_actors va where va.id = l.actor_id and l.twin_version is null;

create or replace function public.lisens_fest_versjon() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.twin_version is null then
      select twin_version into new.twin_version from public.voice_actors where id = new.actor_id;
    end if;
  elsif new.twin_version is distinct from old.twin_version then
    raise exception 'Lisensen er festet til versjon % og kan ikke flyttes. Utsted en ny lisens for den nye versjonen.', old.twin_version;
  end if;
  return new;
end $$;
drop trigger if exists lisens_fest_versjon on public.licences;
create trigger lisens_fest_versjon before insert or update of twin_version on public.licences
  for each row execute function public.lisens_fest_versjon();
alter table public.licences alter column twin_version set not null;

-- ── Hovedboken foerer versjonen som ble brukt ───────────────────────────────
-- Null paa eldre rader: foer versjonene fantes.
alter table public.voice_usage_events add column if not exists twin_version int;

-- Ventende godkjenninger husker hvilken modell innholdet ble laget med, saa
-- leveringen kan foeres paa riktig versjon selv om modellen byttes imens.
alter table public.usage_approvals add column if not exists model_ref text;
