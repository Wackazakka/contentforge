-- 2026-09-22: leveringssiden — bilder og eget opptak gaar rett til lagring,
-- ikke gjennom soeknadsskjemaet.
--
-- HVORFOR. Bevist paa prod 22.09: 12 bilder (23 MB) mot /api/voice-bank/apply
-- ga HTTP 400 med tom kropp etter 1 MB. Netlify kutter forespoerselen i
-- porten; ruta kjoerte aldri. Ansiktsdelen av soeknaden (091) har derfor aldri
-- kunnet virke for en ekte soeker. Og verre: soeknadens photo_urls ble aldri
-- lest av noe — godkjenningen kopierer sample_urls, ikke bildene. Boksen var
-- en blindvei to ganger.
--
-- 🔑 SAMME MOENSTER SOM 094 OG 095. Tokenet i lenken er autentiseringen (hen
-- har ingen konto). Filene gaar fra nettleseren rett til de PRIVATE boettene
-- via signerte opplastingslenker: bilder til `training-sets`, lyd til
-- `voice-recordings`, begge under applications/<id>/. Raden lagrer STIEN,
-- ikke en URL — en signert URL utloeper, og en rad som peker paa noe utloept
-- svarer ikke paa «hvor er bildene hennes?» (laerdommen fra 094).
--
-- photo_urls og sample_urls beholdes for eldre rader. Nye rader skriver hit.
-- Additiv og idempotent.

alter table public.voice_actor_applications
  add column if not exists delivery_token text,
  add column if not exists photo_paths jsonb not null default '[]'::jsonb,
  add column if not exists recording_paths jsonb not null default '[]'::jsonb,
  -- Settes naar alt som kreves er levert. Regnes ut av ruta, lagres som
  -- tidsstempel fordi «naar ble hun ferdig» er et spoersmaal koeen stiller.
  add column if not exists delivered_at timestamptz;

-- Tokenet er en noekkel: ett treff, alltid. Delvis indeks siden eldre rader
-- ikke har noe.
create unique index if not exists voice_actor_applications_delivery_token_unik
  on public.voice_actor_applications (delivery_token)
  where delivery_token is not null;

comment on column public.voice_actor_applications.delivery_token is
  'Lenken til leveringssiden (/levering/<token>). Autentiseringen hennes; hun har ingen konto.';
comment on column public.voice_actor_applications.photo_paths is
  'Stier i den private boetta training-sets, under applications/<id>/. Signeres ved behov.';
comment on column public.voice_actor_applications.recording_paths is
  'Stier i den private boetta voice-recordings, under applications/<id>/. Eget opptak hun hadde fra foer.';

-- Verifisering:
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='voice_actor_applications'
--    and column_name in ('delivery_token','photo_paths','recording_paths','delivered_at');  -- 4 rader
-- select indexname from pg_indexes where tablename='voice_actor_applications'
--    and indexname='voice_actor_applications_delivery_token_unik';                         -- 1 rad
