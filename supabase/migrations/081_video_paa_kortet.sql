-- 081: Film paa skuespillerkortet (Lars 20.09.2026)
--
-- Kortet hadde bilder og lydproever. For en castingkatalog er det for lite:
-- en regissoer vurderer hvordan ansiktet oppfoerer seg i bevegelse, og om
-- stemmen og ansiktet hoerer sammen. Stillbilder svarer ikke paa noen av
-- delene.
--
-- Speiler photo_urls og sample_urls: jsonb-liste, samme form, samme
-- synlighetsregel (lib/publicActors.ts). Filmene ligger i R2 som alt annet.
--
-- ASCII-only (Supabase-editoren tygger ae/oe/aa ved innliming).

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
end $$;

alter table public.voice_actors
  add column if not exists video_urls jsonb not null default '[]'::jsonb;

-- De to reklamefilmene for Lars' kort. Begge er laget med hans egen
-- ansiktsmodell og hans egen klonede stemme: Kling for bevegelse, VEED
-- Fabric for replikkene, ffmpeg for skjoet og sluttplakat.
-- Femte Etasje har dessuten diskret musikk som dukkes under talen.
-- Produktene er OPPDIKTET -- de likner ingenting som finnes.
update public.voice_actors
set video_urls = '[
  "https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/voice-actors/05ea6cf8-bdbe-4d3d-a2a3-51299cc9f57c/film-femte-etasje-musikk-1789910827356.mp4",
  "https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/voice-actors/05ea6cf8-bdbe-4d3d-a2a3-51299cc9f57c/film-sprox-1789910714327.mp4"
]'::jsonb
where id = '05ea6cf8-bdbe-4d3d-a2a3-51299cc9f57c';

notify pgrst, 'reload schema';

select name, jsonb_array_length(coalesce(video_urls, '[]'::jsonb)) as filmer,
       jsonb_array_length(coalesce(sample_urls, '[]'::jsonb)) as proever,
       jsonb_array_length(coalesce(photo_urls, '[]'::jsonb)) as bilder
from public.voice_actors order by is_demo desc, name;
