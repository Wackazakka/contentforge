-- 114: alder i audition — og hvilken ansiktsmodell hvert opptak ble laget med.
-- (23.10.2026)
--
-- Plukkeren finner en veteran paa «30» fordi han har en 30-aarsmodell (082) —
-- men filmen ble laget med dagens ansikt. Kunden saa en 55-aaring der hun
-- hadde castet en 30-aaring. Naa kan runden ha en alder i scenen, og hvert
-- opptak husker hvilken modell som ble brukt: et opptak skal kunne svare paa
-- «hvem er det jeg ser?», ogsaa etter at modellene er byttet.

alter table public.auditions add column if not exists target_age int
  check (target_age is null or (target_age between 0 and 120));
alter table public.audition_takes add column if not exists face_model_ref text;
alter table public.audition_takes add column if not exists face_model_label text;
