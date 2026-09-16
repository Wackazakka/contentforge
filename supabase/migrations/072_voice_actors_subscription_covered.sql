-- 072: Sporing av en kolonne som ALLEREDE finnes i prod, men aldri fikk en
-- migrasjonsfil. Kjoert manuelt i SQL-editoren 06.08.2026 (PR #219) fra en
-- fil paa Desktop som senere ble ryddet bort. Verifisert 16.09.2026 med
-- feilkode-kontrast via PostgREST: select paa kolonnen gir 42501 (finnes,
-- ingen rettighet for anon), en oppdiktet kolonne gir 42703 (finnes ikke).
--
-- Betydning (endret 03.09.2026): «vi dekket ElevenLabs-maaneden ved onboarding».
-- ENGANGS, ikke loepende — ElevenLabs bekreftet at delingen av en proffklone
-- overlever at eieren nedgraderer til gratis. Summen (ACTOR_SUBSCRIPTION_NOK)
-- vises i stemmebank-adminen som onboarding-kostnad. Aldri i voice_usage_events:
-- maanedstellingen der er row.uses++ og driver rabattrappene.
--
-- Idempotent: trygg aa kjoere paa nytt.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tenants'
  ) or not exists (
    select 1 from public.tenants where slug = 'centerforge'
  ) then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
end $$;

alter table public.voice_actors
  add column if not exists subscription_covered boolean not null default false;

comment on column public.voice_actors.subscription_covered is
  'Vi dekket rettighetshaverens ene ElevenLabs Creator-maaned ved onboarding (engangskostnad, ikke loepende).';

notify pgrst, 'reload schema';
