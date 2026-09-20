-- 077: is_demo -- merket eksempelprofil i stemme- og ansiktsbanken
-- (Lars 20.09.2026).
--
-- Bakgrunn: galleriet /stemmer har staatt tomt paa ALLE domener siden det ble
-- laget 17/9 -- null publiserte rettighetshavere, ogsaa paa rota som ser paa
-- tvers. En tom hylle laerer en besoekende aa ikke komme tilbake. Loesningen
-- er ETT merket eksempel, ikke flere oppdiktede personer: et kort som ser ut
-- som en ekte bookbar person, paa en side som lover ekte mennesker, koster mer
-- tillit enn den tomme hylla gjoer.
--
-- Eksempelet er Lars' egen klonede stemme -- et ekte menneske med eget
-- samtykke -- og byttes ut naar foerste ekte rettighetshaver er rekruttert.
-- Da slaas flagget av i adminen (Presentasjonsside > "Fjern eksempelmerket");
-- ingen ny migrasjon trengs.
--
-- is_demo styrer tre ting i koden (lib/publicActors.ts + de to flatene):
--   1) kortet merkes "Eksempel" i galleriet og paa visittkortet
--   2) raden vises KUN paa egne doerer (twinledger + rota), aldri hos en
--      partner -- de selger i sin egen drakt og skal ikke ha vaart demo-
--      materiale staaende som om det var deres portefoelje
--   3) neste steg peker paa rekruttering (/bli-stemme), ikke paa kjoep
--
-- Ansiktet: Lawrence-LoRA-en brukes som Lars' egen ansiktsmodell (Lars
-- 20.09.2026). Den lever i dag KUN som innebygd karakter i lib/characters.ts;
-- bankraden krever en rad i user_characters (admin-PATCH validerer mot den, og
-- gateway-bildestien slaar opp lora_url der). Derfor opprettes karakteren her.
--
-- NB: lora_url SETTES IKKE I DENNE FILA. Repoet Wackazakka/contentforge er
-- PUBLIC, og URL-en peker rett paa vektene. Den staar allerede som
-- LAWRENCE_LORA_URL i Netlify; sett den med en egen setning i SQL-editoren
-- (se slutten av fila) og loeft status til 'ready' samtidig.
--
-- ASCII-only med vilje (Supabase-editoren tygger ae/oe/aa ved innliming).
-- BIO SETTES IKKE HER -- den skrives i adminen, der teksten gaar gjennom
-- API-et og norske tegn overlever.

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
  if not exists (
    select 1 from public.voice_actors
    where id = '05ea6cf8-bdbe-4d3d-a2a3-51299cc9f57c'
  ) then
    raise exception 'Fant ikke eksempelraden. Avbrutt uten endringer.';
  end if;
end $$;

alter table public.voice_actors
  add column if not exists is_demo boolean not null default false;

-- Ansiktsmodellen som bankrad. Fast id slik at migrasjonen kan kjoeres om
-- uten aa lage duplikater. status = 'training' inntil lora_url er satt
-- (se den siste, manuelle setningen) -- da feiler bildegenerering med en
-- aerlig feilmelding i stedet for aa love et ansikt som ikke kan tegnes.
insert into public.user_characters (id, name, trigger_word, status, owner_tenant_id)
values (
  'a1f0c7d2-5b64-4e33-9c81-7d2e6f0b4a19',
  'Lawrence (Lars ansiktsmodell)',
  'LK',
  'training',
  (select id from public.tenants where slug = 'twinledger')
)
on conflict (id) do update set
  name            = excluded.name,
  trigger_word    = excluded.trigger_word,
  owner_tenant_id = excluded.owner_tenant_id;

-- Eksempelraden: testraden fra 04.09 gjenbrukes. Den eies allerede av
-- twinledger og baerer Lars' e-post, saa /min-stemme viser hovedboken til
-- samme menneske som staar paa kortet -- hele kjeden kan demonstreres paa en
-- person som har gitt samtykke til seg selv.
update public.voice_actors set
  name                = 'Lars Kilevold',
  -- "Lars Kilevold" (cloned) paa husets ElevenLabs-konto
  elevenlabs_voice_id = 'J3IRpE8IQpdJ0IJD4Hkh',
  face_character_id   = 'a1f0c7d2-5b64-4e33-9c81-7d2e6f0b4a19',
  is_demo             = true,
  is_active           = true,
  notes               = 'EKSEMPELPROFIL 20.09.2026. Byttes ut med foerste ekte rettighetshaver.',
  -- Tre proever i ulike stiler, generert med Lars egen klonede stemme
  -- (turbo_v2_5, language_code no). Den foerste forklarer hovedboken i
  -- produktet selv.
  sample_urls = '[
    "https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/voice-actors/05ea6cf8-bdbe-4d3d-a2a3-51299cc9f57c/sample-rolig-om-hovedboken-1789897257100.mp3",
    "https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/voice-actors/05ea6cf8-bdbe-4d3d-a2a3-51299cc9f57c/sample-kommersiell-1789897258313.mp3",
    "https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/voice-actors/05ea6cf8-bdbe-4d3d-a2a3-51299cc9f57c/sample-forteller-1789897258981.mp3"
  ]'::jsonb,
  -- Portretter fra Peregrine Studio Kit, valgt fordi de IKKE baerer
  -- trading-merking (ingen grafer, ingen slagordkopp, ingen oksefigur).
  photo_urls = '[
    "https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/voice-actors/05ea6cf8-bdbe-4d3d-a2a3-51299cc9f57c/photo-lawrence_standing-mug-bookshelf-1789897463094.png",
    "https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/voice-actors/05ea6cf8-bdbe-4d3d-a2a3-51299cc9f57c/photo-lawrence_mic-3q-smiling-1789897463541.png"
  ]'::jsonb
where id = '05ea6cf8-bdbe-4d3d-a2a3-51299cc9f57c';

-- Publiseres automatisk naar det finnes minst EN lydproeve. Et visittkort uten
-- noe aa hoere beviser ingenting, og "Ingen lydproeve ennaa" under det eneste
-- kortet i banken er en daarligere forside enn ingen kort.
update public.voice_actors
set is_public = (jsonb_array_length(coalesce(sample_urls, '[]'::jsonb)) > 0)
where id = '05ea6cf8-bdbe-4d3d-a2a3-51299cc9f57c';

notify pgrst, 'reload schema';

-- Kontroll: eksempelet skal staa med is_demo = true, og is_public skal foelge
-- antall proever. Er "proever" 0, er kortet med vilje upublisert -- last opp
-- lydproever i adminen og trykk "Publiser siden".
select id, name, is_demo, is_public, is_active,
       elevenlabs_voice_id is not null as har_stemme,
       face_character_id  is not null as har_ansikt,
       jsonb_array_length(coalesce(sample_urls, '[]'::jsonb)) as proever,
       jsonb_array_length(coalesce(photo_urls,  '[]'::jsonb)) as bilder
from public.voice_actors
order by is_demo desc, name;

-- ---------------------------------------------------------------------------
-- KJOERES SEPARAT, IKKE COMMITTET: gi ansiktsmodellen vektene sine.
-- Hent verdien fra Netlify (contentforge -> LAWRENCE_LORA_URL) og lim den inn
-- i stedet for <LIM INN>. Ikke skriv URL-en tilbake i denne fila -- repoet er
-- offentlig.
--
--   update public.user_characters
--   set lora_url = '<LIM INN LAWRENCE_LORA_URL>', status = 'ready'
--   where id = 'a1f0c7d2-5b64-4e33-9c81-7d2e6f0b4a19';
--
-- Uten den staar kortet med "Ansikt"-merket (raden HAR en ansiktsmodell), men
-- bildegenerering svarer "Ansiktet er ikke klart (LoRA mangler)".
-- ---------------------------------------------------------------------------
