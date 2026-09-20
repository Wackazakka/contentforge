-- 082: Aldersmodeller -- flere ansiktsmodeller per rettighetshaver
-- (Lars 20.09.2026)
--
-- BAKGRUNN. En skuespiller med lang karriere har allerede treningssettet for
-- hvert tiaar av sitt eget ansikt. "Samme skuespiller, 30, 40, 50, 60" gjoer en
-- tilbakeblikkscene til en CASTINGBESLUTNING i stedet for en kostbar
-- postproduksjonspost -- og det er et tilbud bare veteraner kan gi, altsaa et
-- rekrutteringsargument rettet mot nettopp de navnene som trekker regissoerer.
--
-- Teknikken er bevist samme dag: kildebilder -> varianter -> trent LoRA ->
-- verifisert likhet, under en time. Kostnaden ligger ikke i ingenioerarbeidet.
--
-- NB: DEN VANSKELIGE DELEN ER RETTIGHETENE TIL BILDENE. Likheten er
-- skuespillerens; FOTOGRAFIENE er det ikke. Stills og pressefoto eies av
-- fotografer, produksjonsselskaper og arkiver, og aa trene paa dem uten aa
-- klarere selve bildene er et opphavsrettsproblem helt uavhengig av samtykket
-- til likheten. Derfor baerer hver modell BAADE et samtykke og et
-- proveniensspor for treningssettet -- og `source_cleared` er en port, ikke et
-- notat: en modell med uklarerte kilder skal ikke kunne selges.
--
-- NB: SAMTYKKE PER MODELL. En kan si ja til seg selv paa seksti og nei paa
-- tjuefem. Det er ikke ett samtykke, det er flere, og teksten fryses paa raden
-- slik den gjoeres paa skuespillerraden.
--
-- FORHOLDET TIL voice_actors.face_character_id: kolonnen blir staaende som
-- STANDARDMODELLEN, fordi den leses fra gateway, royalty-logging, adminen,
-- den offentlige profilen og Audition. Migrasjonen legger dagens verdi inn som
-- default-raden her. Skriv alltid begge gjennom samme sted, ellers sklir de
-- fra hverandre.
--
-- SYMMETRI som ikke bygges naa: stemmen eldes ogsaa. Et ungt ansikt med dagens
-- stemme er en umake. Naar den tid kommer, er formen den samme -- en
-- actor_voice_models med samme felter.
--
-- ASCII-only (Supabase-editoren tygger ae/oe/aa ved innliming).

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'user_characters') then
    raise exception 'user_characters mangler. Avbrutt uten endringer.';
  end if;
end $$;

create table if not exists public.actor_face_models (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid not null references public.voice_actors(id) on delete restrict,
  character_id   uuid not null references public.user_characters(id) on delete restrict,

  -- Hva modellen ER. Fritekst fordi verden er rikere enn aldersklasser:
  -- "30 aar", "1990-tallet", "med skjegg", "kortklippet".
  label          text not null,
  -- Valgfritt aldersspenn, for filtrering i en castingkatalog.
  age_from       int,
  age_to         int,

  -- Samtykke PER MODELL. Teksten fryses, slik den gjoeres paa skuespillerraden.
  consent_text   text,
  consent_at     timestamptz,

  -- PROVENIENS for treningssettet. Det er dette ingen andre kan tilby, og det
  -- er dette som gjoer "denne modellen er lovlig trent" til noe som kan bevises
  -- i stedet for paastaas.
  source_note    text,
  -- PORT, ikke notat: uklarerte kilder skal ikke kunne selges.
  source_cleared boolean not null default false,

  -- Standardmodellen: den som brukes naar ingen alder er valgt. Speiler
  -- voice_actors.face_character_id.
  is_default     boolean not null default false,
  is_active      boolean not null default true,

  created_at     timestamptz default now(),
  created_by     text,

  -- Samme ansiktsmodell skal ikke ligge to ganger paa samme rettighetshaver.
  constraint actor_face_models_unik unique (actor_id, character_id)
);

create index if not exists actor_face_models_actor_idx on public.actor_face_models(actor_id);

-- Noeyaktig EN standard per rettighetshaver. Delvis unik indeks framfor en
-- constraint: det er den eneste formen som uttrykker "kun blant de sanne".
create unique index if not exists actor_face_models_en_default
  on public.actor_face_models(actor_id) where is_default;

revoke all on public.actor_face_models from anon, authenticated;
alter table public.actor_face_models enable row level security;
grant select, insert, update, delete on public.actor_face_models to service_role;

-- Dagens ansiktsmodeller inn som standardrader, slik at tabellen er komplett
-- fra dag en og ikke bare inneholder "de nye".
insert into public.actor_face_models (actor_id, character_id, label, is_default, source_note, source_cleared)
select v.id, v.face_character_id, 'I dag', true,
       'Migrert fra voice_actors.face_character_id 20.09.2026. Kilde ikke dokumentert.',
       false
from public.voice_actors v
where v.face_character_id is not null
  and not exists (
    select 1 from public.actor_face_models m
    where m.actor_id = v.id and m.character_id = v.face_character_id
  );

notify pgrst, 'reload schema';

-- Kontroll: en rad per eksisterende ansiktsmodell, alle som standard,
-- og ingen av dem klarert -- som er sant: kildene er ikke dokumentert.
select v.name, m.label, m.is_default, m.source_cleared, m.source_note
from public.actor_face_models m
join public.voice_actors v on v.id = m.actor_id
order by v.name;
