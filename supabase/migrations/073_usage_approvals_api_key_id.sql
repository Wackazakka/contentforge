-- 073: Hvilken API-noekkel som utloeste en bruk som venter paa godkjenning.
--
-- Gateway-radene i hovedboken (voice_usage_events / usage_events) faar
-- meta.api_key_id direkte fra 16.09.2026. Men naar skuespilleren krever
-- forhaandsgodkjenning, ligger bruken i usage_approvals til den frigis — og
-- noekkelen maa da foelge med derfra. Uten denne kolonnen mister vi sporet
-- akkurat paa de brukene skuespilleren har bedt om aa se.
--
-- Koden taaler at kolonnen mangler (faller tilbake til insert uten den), saa
-- rekkefoelgen deploy/migrasjon spiller ingen rolle. Idempotent.

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

alter table public.usage_approvals
  add column if not exists api_key_id uuid references public.api_keys(id) on delete set null;

comment on column public.usage_approvals.api_key_id is
  'Gateway-noekkelen som utloeste bruken; skrives til hovedbokens meta.api_key_id ved godkjenning.';

notify pgrst, 'reload schema';
