-- 104: hvorfor en trening feilet, paa raden.
--
-- 22.09.2026: Flux 2-treningen «ble ferdig» hos fal med en valideringsfeil
-- (feil feltnavn i kroppen vaar). fullfoerTreninger fant ingen LoRA-lenke og
-- gikk stille videre — raden sto som «training» for alltid, og ingen kunne se
-- hvorfor. Naa skrives aarsaken her og status settes til «failed».
alter table user_characters add column if not exists last_error text;
