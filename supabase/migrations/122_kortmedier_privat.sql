-- 122: visittkortets filer ut av den offentlige boetta (Lars 25.10.2026)
--
-- HULLET. /api/voice-bank/upload la bilder og lydproever i R2-boetta
-- contentforge-assets, som er eksponert i sin helhet gjennom pub-...r2.dev, og
-- raden lagret den offentlige adressen. Aa fjerne et bilde, avpublisere kortet
-- eller trekke seg tok bare lenken ut av lista -- fila virket for alle, for
-- alltid. Funnet i samme gjennomgang som 119.
--
-- 🔑 KORTET ER OFFENTLIG, FILENE ER DET IKKE (alternativ B). Filene ligger i den
-- PRIVATE boetta training-sets under voice-actors/<actor_id>/ (samme navn som
-- noeklene i R2 hadde). Raden lagrer STIEN; lib/actorMedia signerer en lenke
-- (1 t) hver gang kortet vises. Avpublisert kort = ingen nye lenker. Fjernet
-- bilde = slettet fil. Bare stier under skuespillerens eget prefiks signeres.
--
-- Kolonnene beholder navnet *_url, som i 119.
--
-- De gamle radene flyttes av scripts/flytt-r2-personmateriale.mjs, ikke her:
-- filene maa kopieres og kontrolleres foer en rad skrives om. Skriptet tar
-- ogsaa Maris treningssett (user_characters.training_set_url, 094).
--
-- ASCII-only (Supabase-editoren tygger ae/oe/aa ved innliming). Bare
-- kommentarer: additiv og idempotent.

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
end $$;

comment on column public.voice_actors.photo_urls is
  'Stier i den private boetta training-sets (voice-actors/<actor_id>/...). Signeres ved visning (lib/actorMedia). Eldre rader kan ha en offentlig R2-adresse (122).';
comment on column public.voice_actors.sample_urls is
  'Stier i den private boetta training-sets (voice-actors/<actor_id>/...). Signeres ved visning (lib/actorMedia). Eldre rader kan ha en offentlig R2-adresse (122).';
comment on column public.voice_actors.video_urls is
  'Stier i den private boetta training-sets (voice-actors/<actor_id>/...). Signeres ved visning (lib/actorMedia). Eldre rader kan ha en offentlig R2-adresse (122).';

-- Kontroll: skal vaere 0 etter at flytteskriptet har kjoert.
select count(*) as offentlige_kortfiler_igjen
from public.voice_actors a,
     lateral jsonb_array_elements_text(
       coalesce(a.photo_urls, '[]'::jsonb) || coalesce(a.sample_urls, '[]'::jsonb) || coalesce(a.video_urls, '[]'::jsonb)
     ) as v(url)
where v.url like '%r2.dev/voice-actors/%';
