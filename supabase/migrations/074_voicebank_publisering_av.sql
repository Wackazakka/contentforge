-- 074: Skjul Publiser + Kalender for VoiceBank (Lars 16.09.2026, «inntil videre»).
-- Samme bryter som IndigoBoom fikk i 070: NULL/true = synlig, false = skjult.
-- Kan skrus paa igjen uten deploy: set publishing_enabled = null.
-- Idempotent.

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

update public.tenants
set publishing_enabled = false
where custom_domain = 'voicebank.ai' or slug = 'voicebank';

-- Kontroll: voicebank og indigoboom skal staa med false, alle andre NULL.
select slug, app_name, custom_domain, publishing_enabled
from public.tenants
order by publishing_enabled nulls last, slug;
