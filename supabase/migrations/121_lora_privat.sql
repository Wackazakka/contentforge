-- 121: trente ansiktsmodeller ut av fal og inn i den private boetta (Lars 25.10.2026)
--
-- HULLET. En ferdig trening ga en adresse hos fal (v3b.fal.media/...), og
-- den ble lagret rett i user_characters.lora_url. Adressen er offentlig og
-- evig: hvem som helst med lenken kan laste ned selve modellfila, uten
-- innlogging. /api/characters ga den dessuten til alle innloggede fram til
-- 25.10 (#302). En modell som er «stengt» hos oss, var fortsatt aapen der.
--
-- 🔑 SAMME MOENSTER SOM EGNE MODELLER (23.10, lib/loraKilde). Fila kopieres
-- til training-sets/trained/<karakter-id>.safetensors, raden lagrer
-- «sb://training-sets/<sti>», og fal faar en signert lenke (6 t) naar det
-- genereres. Netlify-bakgrunnsfunksjonen lora-flytt-background gjoer
-- kopien (filene er 130-330 MB), og raden blir ikke «ready» foer kopien er
-- lastet ned igjen og har samme sha256.
--
-- lora_flytt_startet: naar en flytting ble satt i gang. Hindrer at hver
-- sidevisning (Medvirkende spoer hvert 20. sekund) starter en ny kopi av
-- samme fil. En flytting som ikke er ferdig etter 20 minutter, kan tas paa
-- nytt (lib/faceTraining).
--
-- De eldre radene flyttes av scripts/flytt-lora-til-boette.mjs, ikke her:
-- filene maa kopieres og kontrolleres foer en rad skrives om. Originalen hos
-- fal slettes IKKE av noe her -- det er en egen beslutning (kan ikke angres).
--
-- ASCII-only (Supabase-editoren tygger ae/oe/aa ved innliming). Additiv og idempotent.

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
end $$;

alter table public.user_characters
  add column if not exists lora_flytt_startet timestamptz;

comment on column public.user_characters.lora_flytt_startet is
  'Naar kopien av modellfila fra fal til den private boetta ble satt i gang (121). Null naar ingen flytting paagaar.';

comment on column public.user_characters.lora_url is
  'sb://training-sets/<sti> (privat, signeres ved generering, lib/loraKilde). Eldre rader kan ha en offentlig fal-adresse til de er flyttet (121).';

-- Kontroll: skal vaere 0 etter at flytteskriptet har kjoert.
select count(*) as offentlige_modeller_igjen
  from public.user_characters where lora_url ~ '^https?://';
