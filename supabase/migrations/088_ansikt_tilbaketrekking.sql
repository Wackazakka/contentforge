-- 088: av-bryter paa ansiktsmodellen
--
-- ASYMMETRIEN DENNE LUKKER. En proff-klone av STEMMEN ligger paa
-- skuespillerens egen ElevenLabs-konto og deles til oss. Slaar hen delingen
-- av, svarer ElevenLabs 403 voice_disabled, og bruken stopper -- uten at vi
-- gjoer noe. Skuespilleren har altsaa en teknisk noedbryter.
--
-- ANSIKTET har ingen slik bryter. LoRA-en er en fil VI holder hos fal. Fram
-- til naa var "du kan trekke ansiktet tilbake" et loefte vi holdt, ikke en
-- mekanisme hen kunne betjene. For et produkt som selger klarering er det
-- feil sted aa ha et loefte.
--
-- NB: FLAGGET LIGGER PAA ARTEFAKTEN, IKKE PAA SKUESPILLEREN. Alle tre
-- genereringsveiene (gateway /image, audition-film, bildegenerering i appen)
-- slaar opp user_characters paa id -- ingen av dem gaar via skuespillerraden.
-- Et flagg paa voice_actors ville derfor krevd at hver vei husket aa slaa opp
-- oppover, og den som glemte det ville hatt en bryter som SER ut som en
-- garanti. Paa denne raden er den umulig aa gaa utenom.
--
-- TIDSPUNKT, IKKE BOOLEAN. Tilbaketrekking virker ikke bakover: lisenser som
-- er inngaatt staar, og bruk som er foert blir staaende. Da maa hovedboken
-- kunne svare paa NAAR retten ble stengt, ikke bare AT den er det.
--
-- ADVARSEL: KJOER FOER DEPLOY. Koden leser kolonnen ved hvert oppslag av en
-- ansiktsmodell; mangler den, feiler spoerringen og ALL ansiktsgenerering
-- stopper. Motsatt vei er trygg: kolonnen staar null til koden kommer.

alter table public.user_characters
  add column if not exists withdrawn_at timestamptz;

comment on column public.user_characters.withdrawn_at is
  'Satt = rettighetshaveren har trukket ansiktet tilbake. Ingen NY generering tillates. Virker ikke bakover: inngaatte lisenser og foert bruk staar.';

-- Delvis indeks: de tilbaketrukne er faa, og listeveiene spoer nettopp etter dem.
create index if not exists user_characters_withdrawn_idx
  on public.user_characters(id) where withdrawn_at is not null;
