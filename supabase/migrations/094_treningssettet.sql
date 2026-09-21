-- 094: hvor bildene modellen ble laget fra ligger
--
-- HULLET. `/api/characters/upload-url` legger zipen paa
-- characters/zips/<tilfeldig-uuid>.zip og kaster URL-en naar treningen er
-- startet. Modellen finnes; grunnlaget for den kan ikke finnes igjen.
--
-- Det ble oppdaget da Lars spurte hvor Maris bilder var. Svaret laa til slutt
-- i en sesjonslogg, ikke i databasen -- og uten den loggen hadde settet vaert
-- borte.
--
-- NB: DETTE ER EN PROVENANS-MANGEL I ET PROVENANS-PRODUKT. Tre spoersmaal
-- kunne ikke besvares:
--   - Kan modellen trenes paa nytt? Ikke uten aa skaffe bildene paa nytt.
--   - Hvilke bilder ble den laget fra? Ukjent.
--   - En rettighetshaver ber om at GRUNNLAGET slettes -- hvor er det?
-- Det siste veier tyngst, gitt at hun akkurat har faatt en av-bryter paa
-- selve modellen (088) og godkjenner den selv (091). En av-bryter paa
-- modellen mens kildebildene ligger et sted ingen vet, er en halv rettighet.

alter table public.user_characters
  add column if not exists training_set_url text;

comment on column public.user_characters.training_set_url is
  'Zipen modellen ble trent fra. Gjoer retrening mulig, og gjoer "slett grunnlaget" til noe vi faktisk kan utfoere.';

-- Maris sett, funnet i sesjonsloggen 21.09.2026. Eneste rad vi kan fylle
-- bakover -- resten er tapt, og det skal staa som null framfor aa gjettes.
update public.user_characters
   set training_set_url = 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/trening/mari/sett-1789912822398.zip'
 where name ilike 'Mari%' and training_set_url is null;
