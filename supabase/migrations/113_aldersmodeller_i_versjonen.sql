-- 113: aldersmodellene (082) inn i tvillingversjonen (112) — 23.10.2026.
--
-- En versjon var et oeyeblikksbilde av standard-ansiktet og stemmen. Men en
-- tvilling kan ha flere ansiktsmodeller — en per alderstrinn — og en lisens
-- paa «ansiktet» maa vite hvilke av dem den klarerte. Ellers ville en
-- aldersmodell lagt til i ettertid stilltiende blitt dekket av en gammel
-- lisens: akkurat det versjonene finnes for aa hindre.
--
-- 🔑 HVA SOM GIR NY VERSJON: en aldersmodell legges til, fjernes, deaktiveres,
-- faar en annen modell, eller blir klarert (source_cleared). Det er de
-- egenskapene som avgjoer hva som kan selges. Etikett og aldersspenn er
-- beskrivelse og gir ikke ny versjon.
--
-- 🔑 STANDARDRADEN (is_default) TELLER IKKE med i bildet. Den speiler
-- voice_actors.face_character_id, som alt staar i versjonen — og den speilingen
-- er ikke alltid oppdatert (skjoeten setter bare face_character_id).
--
-- 🔑 EN LISENS DEKKER BARE KLARERTE ALDERSMODELLER. source_cleared er en port
-- (082): uklarerte kilder skal ikke kunne selges. Regelen staar i
-- lib/twinVersions.ts; her lagres bare bildet, med flagget.
--
-- I dag genereres det ikke med aldersmodeller noe sted (de brukes som
-- aldersspenn i castingfilteret). Dette er for at regelen skal holde den dagen
-- det gjoeres.

alter table public.twin_versions add column if not exists age_models jsonb not null default '[]'::jsonb;

alter table public.twin_versions drop constraint if exists twin_versions_change_check;
alter table public.twin_versions add constraint twin_versions_change_check
  check (change in ('opprettet', 'ansikt', 'stemme', 'ansikt+stemme', 'aldersmodeller'));

-- Bildet av en tvillings aldersmodeller, slik det er naa.
create or replace function public.aldersmodeller_bilde(p_actor uuid) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'character_id', m.character_id::text, 'label', m.label,
           'age_from', m.age_from, 'age_to', m.age_to, 'source_cleared', m.source_cleared
         ) order by m.character_id::text), '[]'::jsonb)
    from public.actor_face_models m
   where m.actor_id = p_actor and m.is_active and not m.is_default
$$;

-- Det som avgjoer om bildet er endret: modell + klarering, ikke beskrivelsen.
create or replace function public.aldersmodeller_noekkel(p jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('c', e->>'character_id', 's', coalesce((e->>'source_cleared')::boolean, false))
           order by e->>'character_id'), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p, '[]'::jsonb)) e
$$;

-- Dagens versjon faar dagens aldersmodeller.
update public.twin_versions tv set age_models = public.aldersmodeller_bilde(tv.actor_id)
  from public.voice_actors va
 where va.id = tv.actor_id and tv.version = va.twin_version;

-- Bytte av ansikt/stemme: ny versjon som tar MED aldersmodellene fra forrige.
-- Og: versjonsnummeret kan fortsatt ikke settes for haand — unntaket er et
-- steg paa +1 til en versjon som alt finnes, som er slik aldersmodell-
-- triggeren under flytter nummeret.
create or replace function public.tvilling_ny_versjon() returns trigger
language plpgsql as $$
declare
  ansikt boolean;
  stemme boolean;
begin
  ansikt := nullif(new.face_character_id::text, '') is distinct from nullif(old.face_character_id::text, '');
  stemme := nullif(new.elevenlabs_voice_id, '') is distinct from nullif(old.elevenlabs_voice_id, '');
  if not (ansikt or stemme) then
    if new.twin_version = old.twin_version + 1 and exists (
      select 1 from public.twin_versions where actor_id = new.id and version = new.twin_version
    ) then
      return new;
    end if;
    new.twin_version := old.twin_version;
    return new;
  end if;
  new.twin_version := old.twin_version + 1;
  insert into public.twin_versions (actor_id, version, face_character_id, elevenlabs_voice_id, change, age_models)
  values (new.id, new.twin_version, nullif(new.face_character_id::text, ''), nullif(new.elevenlabs_voice_id, ''),
          case when ansikt and stemme then 'ansikt+stemme' when ansikt then 'ansikt' else 'stemme' end,
          coalesce((select age_models from public.twin_versions where actor_id = new.id and version = old.twin_version), '[]'::jsonb));
  return new;
end $$;

-- Endret aldersmodell → ny versjon, hvis det som kan selges er endret.
create or replace function public.tvilling_aldersmodeller_endret() returns trigger
language plpgsql as $$
declare
  aktoer uuid := coalesce(new.actor_id, old.actor_id);
  naa_versjon int;
  gammelt jsonb;
  nytt jsonb;
begin
  select twin_version into naa_versjon from public.voice_actors where id = aktoer;
  if naa_versjon is null then return null; end if;
  nytt := public.aldersmodeller_bilde(aktoer);
  select age_models into gammelt from public.twin_versions where actor_id = aktoer and version = naa_versjon;
  if public.aldersmodeller_noekkel(gammelt) is not distinct from public.aldersmodeller_noekkel(nytt) then
    return null;
  end if;
  insert into public.twin_versions (actor_id, version, face_character_id, elevenlabs_voice_id, change, age_models)
  select aktoer, naa_versjon + 1, tv.face_character_id, tv.elevenlabs_voice_id, 'aldersmodeller', nytt
    from public.twin_versions tv where tv.actor_id = aktoer and tv.version = naa_versjon;
  update public.voice_actors set twin_version = naa_versjon + 1 where id = aktoer;
  return null;
end $$;

drop trigger if exists tvilling_aldersmodeller on public.actor_face_models;
create trigger tvilling_aldersmodeller
  after insert or update or delete on public.actor_face_models
  for each row execute function public.tvilling_aldersmodeller_endret();

revoke execute on function public.aldersmodeller_bilde(uuid) from public, anon, authenticated;
revoke execute on function public.aldersmodeller_noekkel(jsonb) from public, anon, authenticated;
grant execute on function public.aldersmodeller_bilde(uuid) to service_role;
grant execute on function public.aldersmodeller_noekkel(jsonb) to service_role;
