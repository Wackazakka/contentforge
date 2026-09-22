-- 2026-09-22: proevebildene til godkjenningen (091) lages i to steg.
--
-- FOER: ett kall sendte jobben til fal og VENTET i maks 22 sekunder paa
-- svaret — i en Netlify-funksjon som kuttes paa ~26. En LoRA som maa lastes
-- tar 20–60 sekunder kaldt, saa kallet tidsavbroet, sida sa «kunne ikke
-- lages», og ny last sendte en NY jobb mens den forrige ble ferdig usett.
-- Lars satt og ventet paa proevebilde 1 av 3 som aldri kom.
--
-- NAA: steg 1 sender inn og lagrer jobben her; steg 2 (korte kall, hvert
-- tredje sekund fra sida) spoer fal om den er ferdig, henter bildet, legger
-- det i sample_urls og toemmer feltet. Ingen kall varer lenger enn et par
-- sekunder, og en treg koe koster ikke en ny jobb per forsoek.
--
-- Samme moenster som opptaksloeypa (095): jobben ligger paa raden, ikke i
-- en funksjon som kan doe.

alter table public.user_characters
  add column if not exists sample_pending jsonb;

comment on column public.user_characters.sample_pending is
  'Ventende proevebilde: {request_id, status_url, response_url, scene, submitted_at}. Null = ingen jobb underveis.';
