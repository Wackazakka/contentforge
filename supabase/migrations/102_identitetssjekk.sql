-- 2026-09-22: identitetssjekk ved levering — foerste skive av lag 1
-- («Twin Identity») i investordokumentet. Lars: «Bygg identitetssjekken ved
-- levering.»
--
-- HVA SOM LAGRES. En ansiktsvektor per levert bilde (ArcFace/buffalo_l, 512
-- tall, L2-normalisert), regnet ut av en Python-tjeneste paa dropleten
-- (:8790) i det bildet registreres paa /min-stemme. Paa skuespillerraden
-- ligger sentroiden (gjennomsnittet av de godkjente) og vurderingen:
-- viser alle bildene samme person, hvilke skiller seg ut, og finnes personen
-- alt under et annet navn.
--
-- 🔑 IKKE DETEKSJON. Dette skanner ikke noe marked. Det svarer paa tre
-- spoersmaal med en gang: samme person paa alle bildene? (hullet fra 088 —
-- «ingenting hindrer at en LoRA trenes paa hvem som helsts bilder»),
-- dublett under annet navn?, og — naar BankID kommer (steg 3) — er personen
-- paa bildene den samme som kom gjennom eID?
--
-- ⚠️ ART. 9. En vektor som brukes til aa kjenne igjen en person ER biometriske
-- data. Samtykketeksten i paameldingen maa oppdateres til aa nevne
-- fingeravtrykket FOER dette slaas paa for ekte rettighetshavere — se
-- statusdoken punkt 12. Vektorene er «ikke gjenskapbare i praksis», ikke
-- «irreversible» (dokumentet er rettet 22.09).
--
-- pgvector var tilgjengelig, ikke slaatt paa (verifisert 22.09).
-- Additiv og idempotent. Stenger seg selv (laerdommen fra 096).

create extension if not exists vector with schema extensions;

create table if not exists public.actor_photo_embeddings (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.voice_actors(id) on delete cascade,
  path text not null,                       -- stien i training-sets (099/101)
  embedding extensions.vector(512),         -- null = ingen ansikt funnet, eller feil
  faces integer not null default 0,         -- 0 = ingen, 2+ = flere; vi tar det stoerste
  det_score numeric,
  model text,
  error text,
  created_at timestamptz not null default now(),
  constraint actor_photo_embeddings_unik unique (actor_id, path)
);

create index if not exists actor_photo_embeddings_actor_idx
  on public.actor_photo_embeddings (actor_id);

alter table public.voice_actors
  add column if not exists face_embedding extensions.vector(512),  -- sentroiden
  add column if not exists identity_check jsonb,                    -- vurderingen
  add column if not exists identity_checked_at timestamptz;

-- Dublett-soek: de naermeste ANDRE skuespillerne til en vektor, som likhet
-- (1 - cosinusavstand). Bare service_role kaller den; anon/authenticated
-- tilbakekalles under. Eksakt soek — tabellen er liten, en indeks kan komme.
create or replace function public.naermeste_ansikter(
  p_actor uuid, p_emb extensions.vector(512), p_k integer default 5
) returns table (actor_id uuid, name text, similarity double precision)
language sql stable security definer
set search_path = public, extensions
as $$
  select id, name, 1 - (face_embedding <=> p_emb) as similarity
    from public.voice_actors
   where id <> p_actor and face_embedding is not null
   order by face_embedding <=> p_emb
   limit p_k
$$;
revoke all on function public.naermeste_ansikter(uuid, extensions.vector, integer) from public, anon, authenticated;

alter table public.actor_photo_embeddings enable row level security;
revoke all on table public.actor_photo_embeddings from anon, authenticated;

comment on column public.voice_actors.identity_check is
  'Identitetssjekk ved levering: {photos, withFace, sameCount, outliers[], noFace[], multiFace[], meanSim, minSim, duplicates[], ok, model, computedAt}. Regnes i lib/identity.ts.';

-- Verifisering:
-- select extname from pg_extension where extname='vector';                       -- 1 rad
-- select count(*) from information_schema.columns where table_name='voice_actors'
--    and column_name in ('face_embedding','identity_check','identity_checked_at'); -- 3
-- select proname from pg_proc where proname='naermeste_ansikter';                -- 1 rad
