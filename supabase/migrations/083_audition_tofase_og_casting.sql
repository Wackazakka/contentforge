-- 083: Audition i to faser + castingattributter (Lars 20.09.2026)
--
-- TOFASEN. Audition gjorde ett kast: stillbilde, stemme og film i en kjede, og
-- kunden betalte for filmen enten lesningen duget eller ikke. Det er motsatt av
-- hvordan en stemmeoekt faktisk foregaar -- man regisserer LESNINGEN, og
-- forplikter seg til bilde etterpaa. Vi gjorde nettopp det manuelt selv: sju
-- opplesninger av en reklamereplikk foer en ble valgt og rendret.
--
-- Fase 1 er lesninger: billig, gjentakbar, og en ekte regihandling fordi
-- modellen IKKE er deterministisk -- samme regi gir ulike lesninger.
-- Fase 2 er film, og kjoeres bare paa den valgte lesningen.
--
-- Det retter oekonomien samtidig: kunden betaler for det hen VALGTE, ikke for
-- det hen trakk. Lesninger foeres paa proevelytt-satsen som allerede finnes.
--
-- CASTINGATTRIBUTTER. En rutenett av portretter slutter aa virke rundt tjue
-- oppfoeringer. Bransjen filtrerer paa spillealder, kjoenn, hoeyde, haar,
-- utseende, spraak, dialekt og ferdigheter.
--
-- NB: SPILLEALDER, ikke alder. Casting handler om hvilken alder man kan SPILLE.
-- Personens eget spenn ligger her; hver ansiktsmodell har sitt eget spenn i
-- actor_face_models (082), og et filter skal treffe MODELLEN naar den finnes.
--
-- NB: ETNISITET ER SAERLIGE KATEGORIER (personvernforordningen art. 9), samme
-- kategori som stemme- og ansiktsdata allerede er. Feltet lagres bare
-- SELVERKLAERT av rettighetshaveren, rammet som SPILLEOMRAADE ("hvilke roller
-- kan dette ansiktet plausibelt spille") og ikke som klassifisering av et
-- menneske. Det krever uttrykkelig samtykke og hoerer hjemme i onboarding, ikke
-- som et fritt admin-felt. Flerverdi, fordi folk spiller paa tvers.
--
-- Vokabularet ligger i lib/castingAttributes.ts og ikke i basen: fri tekst blir
-- ubrukelig med det samme ("blond", "lys" og "lyshaaret" maa vaere samme verdi).
--
-- ASCII-only (Supabase-editoren tygger ae/oe/aa ved innliming).

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'audition_takes') then
    raise exception 'audition_takes mangler - kjoer 080 foerst. Avbrutt uten endringer.';
  end if;
end $$;

-- 1) Lesningene ------------------------------------------------------------

create table if not exists public.audition_reads (
  id          uuid primary key default gen_random_uuid(),
  take_id     uuid not null references public.audition_takes(id) on delete cascade,
  audio_url   text,
  -- Regien og innstillingene som ble brukt. De GJENSKAPER ikke lesningen --
  -- modellen er ikke deterministisk -- men de forklarer hvorfor den ble slik,
  -- og lar en regissoer be om "samme, men roligere".
  direction   text,
  stability   numeric(4,3),
  style       numeric(4,3),
  chars       int,
  is_chosen   boolean not null default false,
  created_at  timestamptz default now()
);

create index if not exists audition_reads_take_idx on public.audition_reads(take_id);

-- Noeyaktig EN valgt lesning per skuespillerplass.
create unique index if not exists audition_reads_en_valgt
  on public.audition_reads(take_id) where is_chosen;

revoke all on public.audition_reads from anon, authenticated;
alter table public.audition_reads enable row level security;
grant select, insert, update, delete on public.audition_reads to service_role;

-- 2) Stegene paa skuespillerplassen ----------------------------------------
-- 'reading'  - en lesning er bestilt
-- 'ready'    - minst en lesning finnes, venter paa at noen VELGER
-- 'still'    - fase 2 startet: bildet lages
-- 'video'    - filmen rendres
alter table public.audition_takes drop constraint if exists audition_takes_stage_check;
alter table public.audition_takes add constraint audition_takes_stage_check
  check (stage in ('queued', 'reading', 'ready', 'still', 'video', 'done', 'failed'));

-- Gamle rader staar paa 'still' eller 'video' fra ettfase-kjoeringen; de faar
-- ligge. Nye runder starter paa 'queued' og gaar via 'reading'.

-- 3) Castingattributter -----------------------------------------------------

alter table public.voice_actors
  add column if not exists gender            text,
  -- SPILLEALDER, ikke alder.
  add column if not exists playing_age_from  int,
  add column if not exists playing_age_to    int,
  add column if not exists height_cm         int,
  -- Flerverdi mot et dokumentert vokabular (lib/castingAttributes.ts):
  -- dialects, languages, hair, eyes, build, appearance, skills.
  add column if not exists attributes        jsonb not null default '{}'::jsonb,
  -- Art. 9-samtykket for spilleomraade. Uten det skal feltet ikke fylles.
  add column if not exists appearance_consent_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'actor_gender') then
    alter table public.voice_actors add constraint actor_gender
      check (gender is null or gender in ('kvinne', 'mann', 'annet'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'actor_playing_age') then
    alter table public.voice_actors add constraint actor_playing_age
      check (playing_age_from is null or playing_age_to is null or playing_age_from <= playing_age_to);
  end if;
end $$;

-- Indeks for de filtrene som alltid brukes.
create index if not exists voice_actors_casting_idx
  on public.voice_actors(gender, playing_age_from, playing_age_to) where is_active;

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='audition_reads') as lesningstabell,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='voice_actors'
      and column_name in ('gender','playing_age_from','playing_age_to','height_cm','attributes','appearance_consent_at')) as castingfelt;
