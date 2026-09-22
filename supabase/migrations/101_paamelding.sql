-- 2026-09-22: paamelding erstatter soeknad (steg 1 av tre, Lars).
--
-- FOER: /bli-stemme var en SOEKNAD — en rad i voice_actor_applications, en koe,
-- godkjenn/avvis, og foerst da en skuespillerrad. Kontoen ble laget separat,
-- og soeknaden spurte om navn og e-post vi alt hadde. Ett trinn for mye.
--
-- NAA: paameldingen lager kontoen, og skuespillerraden opprettes ved FOERSTE
-- INNLOGGING — altsaa foerst naar e-posten er verifisert. Det er det eneste
-- som gjoer actor_email-koblingen trygg: ingen kan lage en rad for en adresse
-- hen ikke kontrollerer. Raden fodes med is_active=false og is_public=false.
--
-- 🔑 DELTA ER SELVBETJENT, PUBLISERT ER ET MENNESKES AVGJOERELSE. Koeen slutter
-- aa ha godkjenn/avvis for deltakelse. Det eneste den har igjen er «Publiser»
-- (is_public), som var der fra foer.
--
-- 🔑 IDENTITETSGRUNNLAGET ER TRE VERDIER, IKKE EN BOOLEAN — av samme grunn som
-- samtykket i 089 ble tre svar. «Hvem gikk god for at du finnes?» har ulik
-- styrke: byraaet som brakte deg (vouched), BankID (bankid), eller bare en
-- avkryssing (self_declared). En boolean ville slaatt sammen Pullmans ord og
-- en boks. Steg 2 og 3 skriver de to foerste; steg 1 skriver bare den siste.
-- Porten paa publisering (self_declared kan ikke publiseres) haandheves i
-- adminen, ikke her — en admin skal kunne overstyre med aapne oeyne.
--
-- Leveringen (099) flytter fra soeknadsraden til skuespillerraden: hun er
-- innlogget naa, og trenger ingen tokenlenke. Samme stier, samme boetter.
--
-- Additiv og idempotent. Ingen eksisterende rad endres.

alter table public.voice_actors
  add column if not exists identity_basis text,
  add column if not exists enrolled_at timestamptz,
  add column if not exists offers_voice boolean,
  add column if not exists wants_face boolean,
  add column if not exists has_own_recording boolean,
  add column if not exists consent_text text,
  add column if not exists consent_at timestamptz,
  add column if not exists photo_paths jsonb not null default '[]'::jsonb,
  add column if not exists recording_paths jsonb not null default '[]'::jsonb,
  add column if not exists delivered_at timestamptz;

alter table public.voice_actors
  drop constraint if exists actor_identity_basis;
alter table public.voice_actors
  add constraint actor_identity_basis
    check (identity_basis is null or identity_basis in ('self_declared', 'vouched', 'bankid'));

comment on column public.voice_actors.identity_basis is
  'Hvem gikk god for at personen finnes: self_declared (avkryssing), vouched (byraa/agent), bankid. Null = rad fra foer paameldingen fantes.';
comment on column public.voice_actors.enrolled_at is
  'Naar hun meldte seg paa selv. Null = lagt inn av admin eller via den gamle soeknaden.';

-- Verifisering:
-- select count(*) from information_schema.columns where table_schema='public'
--   and table_name='voice_actors' and column_name in
--   ('identity_basis','enrolled_at','offers_voice','wants_face','has_own_recording',
--    'consent_text','consent_at','photo_paths','recording_paths','delivered_at');  -- 10
