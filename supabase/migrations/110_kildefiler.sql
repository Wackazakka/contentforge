-- 110: kildematerialet — erklaering og fingeravtrykk per levert fil (23.10.2026).
--
-- Investordokumentet lover at tvillingens kildemateriale er dokumentert:
-- «med rettighetshaverens erklaering om at materialet viser henne og at hun
-- har rett til aa bruke det, og et fingeravtrykk av hver fil, saa det i
-- ettertid kan vises noeyaktig hva modellen ble laget av». Foer dette fantes
-- bare stien.
--
-- 🔑 ERKLAERINGEN, IKKE «HVEM TOK BILDET». Lars 23.10: gamle bilder husker
-- ingen hvem som tok. Hun staar inne for at bildene viser henne og at hun har
-- lov til aa bruke dem — ogsaa bilder andre har tatt. Teksten fryses per fil.
-- `declaration` null = levert foer erklaeringen fantes (fylt inn i ettertid).
--
-- 🔑 sha256 regnes av SERVEREN fra fila i lagringen, ikke av nettleseren.
-- En hash klienten paastaar er ikke et bevis.
--
-- exif: bare tidspunkt og kamera. ALDRI GPS — hvor hun bor er ikke
-- kildedokumentasjon.
--
-- owner_id er tekst: soeknadstabellen ble laget utenfor migrasjonene, og
-- typen er ikke verdt aa gjette paa.

create table if not exists source_files (
  id uuid primary key default gen_random_uuid(),
  owner_table text not null check (owner_table in ('voice_actors', 'voice_actor_applications')),
  owner_id text not null,
  kind text not null check (kind in ('photo', 'recording')),
  path text not null,
  sha256 text,
  bytes bigint,
  content_type text,
  exif jsonb,
  declaration text,
  declared_at timestamptz,
  error text,
  registered_at timestamptz not null default now(),
  unique (owner_table, owner_id, path)
);
create index if not exists source_files_owner on source_files (owner_table, owner_id);

alter table source_files enable row level security;
-- Lærdommen fra 096: nye tabeller arver full anon-GRANT. RLS alene er ett lag.
revoke all on source_files from anon, authenticated;

-- Hvilke filer en ansiktsmodell ble trent fra: [{path, sha256, declared_at}].
-- Kopieres ved retrening (samme sett).
alter table user_characters add column if not exists source_files jsonb;
