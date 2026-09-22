-- 2026-09-22: soeknaden slutter aa ta imot lyd, og spoer i stedet om hen HAR
-- et brukbart opptak fra foer.
--
-- Lydboksen var «valgfri» fra tidligere samme dag, men sto der fortsatt og
-- forklarte seg med en unnskyldning. Lars: «Enten alt vi trenger, hvis
-- skuespilleren har det tilgjengelig allerede, eller link til der vi hjelper
-- ham med lyd.» Det er to veier, ikke en boks med forbehold.
--
-- 🔑 OG SKJEMAET KAN IKKE TA IMOT FILER UANSETT. Bevist paa prod 22.09: 12
-- bilder (23 MB) mot /api/voice-bank/apply ga HTTP 400 med TOM kropp etter
-- 1 MB og 0,4 sekunder — Netlify kuttet forespoerselen i porten, ruta kjoerte
-- aldri. Et 30-minutters opptak er ti ganger verre. Filer maa gaa rett fra
-- nettleseren til lagring (music-inbox-moensteret), ikke gjennom skjemaet.
-- Denne kolonnen er svaret skjemaet trenger for aa vite HVILKEN e-post som
-- skal sendes: «last opp det du har» eller «vi tar opptaket sammen».
--
-- null = ikke spurt (tilbyr bare ansikt). Additiv og idempotent.

alter table public.voice_actor_applications
  add column if not exists has_own_recording boolean;

comment on column public.voice_actor_applications.has_own_recording is
  'Sokeren sier hen har et brukbart opptak fra foer (true), trenger hjelp (false), eller tilbyr ikke stemme (null). Styrer hvilken oppfoelging som sendes.';

-- Verifisering:
-- select column_name, is_nullable from information_schema.columns
--  where table_schema='public' and table_name='voice_actor_applications'
--    and column_name='has_own_recording';   -- én rad, YES
