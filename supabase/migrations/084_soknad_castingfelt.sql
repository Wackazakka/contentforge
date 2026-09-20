-- 084: Castingfelt i soeknaden (Lars 20.09.2026)
--
-- BAKGRUNN. Castingfiltrene ble levert samme dag (083 + lib/castingAttributes),
-- men feltene kunne bare fylles i adminen ETTERPAA. Det er feil sted paa to
-- maater:
--
--   1) ET TOMT CASTINGFELT ER IKKE "ALLE" -- DET ER USYNLIG. En rettighetshaver
--      som slipper gjennom opptaket uten felt, finnes ikke i katalogen. Det er
--      en oppgave ingen skal kunne glemme, altsaa hoerer den til i opptaket og
--      ikke i en huskeliste.
--
--   2) SPILLEOMRAADE ER ART. 9 OG SKAL VAERE SELVERKLAERT. Naar forvalteren
--      fyller det i adminen, er det en tredjepart som klassifiserer et
--      menneske. Naar soekeren fyller det selv, med eget samtykke, er det
--      personen som sier hva hen kan spille. Soeknaden er derfor det ENESTE
--      riktige stedet a hente det -- alt annet er en noedloesning.
--
-- Vokabularet ligger fortsatt i lib/castingAttributes.ts, ikke i basen, og
-- innsendingen renses mot det (rensAttributter) foer den lagres. Ukjente koder
-- forsvinner: en skrivefeil skal ikke bli en verdi ingen kan filtrere paa.
--
-- Feltene speiler voice_actors (083) med vilje, slik at godkjenningen kan
-- kopiere dem rett over uten oversettelseslag.
--
-- ASCII-only (Supabase-editoren tygger ae/oe/aa ved innliming).

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'voice_actor_applications') then
    raise exception 'voice_actor_applications mangler. Avbrutt uten endringer.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'voice_actors'
                   and column_name = 'playing_age_from') then
    raise exception 'Castingfeltene mangler paa voice_actors - kjoer 083 foerst. Avbrutt uten endringer.';
  end if;
  -- Porten under legges paa voice_actors ogsaa. Finnes det allerede en rad med
  -- spilleomraade uten samtykke, skal migrasjonen stoppe HER -- foer noe er
  -- endret -- og ikke halvveis nede i skriptet. Og den skal si hvilke rader.
  if exists (select 1 from public.voice_actors
             where attributes -> 'appearance' is not null
               and appearance_consent_at is null) then
    raise exception 'Rader med spilleomraade uten art. 9-samtykke: %. Rydd dem foerst. Avbrutt uten endringer.',
      (select string_agg(name, ', ') from public.voice_actors
       where attributes -> 'appearance' is not null and appearance_consent_at is null);
  end if;
end $$;

alter table public.voice_actor_applications
  add column if not exists gender            text,
  -- SPILLEALDER, ikke alder: hvilken alder soekeren kan SPILLE.
  add column if not exists playing_age_from  int,
  add column if not exists playing_age_to    int,
  add column if not exists height_cm         int,
  add column if not exists attributes        jsonb not null default '{}'::jsonb,
  -- Art. 9-samtykket, gitt av soekeren selv i skjemaet. Uten tidsstempel her
  -- skal spilleomraade verken lagres eller kopieres videre.
  add column if not exists appearance_consent_at timestamptz,
  -- Samtykketeksten for spilleomraade FRYSES, paa samme maate som den
  -- generelle consent_text allerede gjoer: endrer vi formuleringen, vet vi
  -- fortsatt noeyaktig hva hver enkelt sa ja til.
  add column if not exists appearance_consent_text text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'soknad_gender') then
    alter table public.voice_actor_applications add constraint soknad_gender
      check (gender is null or gender in ('kvinne', 'mann', 'annet'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'soknad_playing_age') then
    alter table public.voice_actor_applications add constraint soknad_playing_age
      check (playing_age_from is null or playing_age_to is null
             or playing_age_from <= playing_age_to);
  end if;
  -- Porten, haandhevet i BASEN og ikke bare i koden: spilleomraade kan ikke
  -- staa paa en rad uten samtykke. Da kan hverken en feil i ruta eller en
  -- direkte insert legge igjen art. 9-data uten hjemmel.
  if not exists (select 1 from pg_constraint where conname = 'soknad_appearance_krever_samtykke') then
    alter table public.voice_actor_applications add constraint soknad_appearance_krever_samtykke
      check (appearance_consent_at is not null
             or attributes -> 'appearance' is null);
  end if;
end $$;

-- Samme port paa skuespillerraden. Den har hatt samtykkekolonnen siden 083,
-- men ingenting hindret at spilleomraade ble skrevet uten den.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'actor_appearance_krever_samtykke') then
    alter table public.voice_actors add constraint actor_appearance_krever_samtykke
      check (appearance_consent_at is not null
             or attributes -> 'appearance' is null);
  end if;
end $$;

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='voice_actor_applications'
      and column_name in ('gender','playing_age_from','playing_age_to','height_cm',
                          'attributes','appearance_consent_at','appearance_consent_text')) as soknadsfelt,
  (select count(*) from pg_constraint
    where conname in ('soknad_gender','soknad_playing_age',
                      'soknad_appearance_krever_samtykke','actor_appearance_krever_samtykke')) as vakter;
