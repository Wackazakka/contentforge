-- 119: audition-opptakene ut av den offentlige boetta (Lars 25.10.2026)
--
-- HULLET. lib/auditions.ts la lyd, stillbilde og film i R2-boetta
-- contentforge-assets, som er eksponert i sin helhet gjennom pub-...r2.dev.
-- Raden lagret den offentlige adressen. Et generert bilde av et ekte ansikt og
-- en klonet stemme laa dermed aapent for enhver som fikk lenken -- for alltid.
-- Funnet mens personvernerklaeringen for TwinLedger ble skrevet: den lover at
-- en rettighetshavers materiale bare aapnes med kortlevde lenker.
--
-- 🔑 SAMME MOENSTER SOM 094/099. Filene ligger i den PRIVATE boetta
-- training-sets under auditions/<audition_id>/ (samme navn som noeklene i R2
-- hadde). Raden lagrer STIEN; lenken signeres naar noen aapner runden
-- (10 min), og fal faar en signert lenke (1 t) til lyd og stillbilde.
-- Alt fra en runde ligger under ett prefiks, saa "slett runden" er ett sted.
--
-- Kolonnene beholder navnet *_url: aa doepe dem om ville brutt eldre kode
-- midt i en utrulling. Kommentarene sier hva de inneholder.
--
-- De gamle radene flyttes av scripts/flytt-audition-opptak.mjs, ikke her:
-- filene maa kopieres og kontrolleres foer en rad skrives om.
--
-- ASCII-only (Supabase-editoren tygger ae/oe/aa ved innliming). Additiv og idempotent.

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
end $$;

comment on column public.audition_takes.still_url is
  'Sti i den private boetta training-sets (auditions/<audition_id>/...). Signeres ved behov. Eldre rader kan ha hatt en offentlig R2-adresse (119).';
comment on column public.audition_takes.video_url is
  'Sti i den private boetta training-sets (auditions/<audition_id>/...). Signeres ved behov.';
comment on column public.audition_takes.audio_url is
  'Sti til den valgte lesningen (kopiert fra audition_reads.audio_url). Signeres ved behov.';
comment on column public.audition_reads.audio_url is
  'Sti i den private boetta training-sets (auditions/<audition_id>/...). Signeres ved behov.';

-- Kontroll: skal vaere 0 etter at flytteskriptet har kjoert.
select
  (select count(*) from public.audition_takes
    where still_url ~ '^https?://' or video_url ~ '^https?://' or audio_url ~ '^https?://')
  + (select count(*) from public.audition_reads where audio_url ~ '^https?://') as offentlige_adresser_igjen;
