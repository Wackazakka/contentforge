-- 076: Fanetittel og beskrivelse for voicebank.ai etter at VoiceBank gikk ut
-- av stemmeforvaltningen (20.09.2026). Tekstene ligger paa tenant-raden
-- (meta_title / meta_description, lest i app/layout.tsx), ikke i koden.
-- Idempotent.

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
end $$;

update public.tenants set
  meta_title       = 'VoiceBank - lag sangen, lag filmen, del festen',
  meta_description = 'VoiceBank staar bak Sangskaper.no, som lager en sang med navnet i, og Standard Ropert, som gjoer sangen til film, invitasjon eller hilsen. Ingen forkunnskaper, ferdig paa minutter.'
where slug = 'voicebank';

select slug, meta_title, meta_description from public.tenants where slug = 'voicebank';
