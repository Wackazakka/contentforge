-- 075: TwinLedger ut av VoiceBank, inn som egen tenant under Norditech
-- (Lars 20.09.2026). VoiceBank skal ikke drive stemmeforvaltning, men vaere en
-- generell CenterForge-tjeneste. Rettighetsforvaltningen -- skuespillerne,
-- avtalene, hovedboken, soeknadene -- flyttes til tenanten 'twinledger' med
-- CenterForge som forelder. Standard Ropert blir liggende under VoiceBank.
--
-- Historikken beholdes: voice_usage_events.used_by_tenant_id sier hvem som
-- BRUKTE stemmen og roeres ikke. Det som flyttes er EIERSKAPET.
--
-- Temp-tabell-moensteret fra 055: TwinLedger arver alle VoiceBanks kolonner,
-- ogsaa dem ingen har tenkt paa, og vi overstyrer bare det som skal vaere ulikt.
-- ASCII-only med vilje (Supabase-editoren tygger ae/oe/aa feil ved innliming).
-- Kjoeres EN gang; sperren under stopper den om den kjoeres igjen.

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
  if exists (select 1 from public.tenants where slug = 'twinledger') then
    raise exception 'twinledger finnes allerede. Avbrutt uten endringer.';
  end if;
  if not exists (select 1 from public.tenants where slug = 'voicebank') then
    raise exception 'voicebank finnes ikke. Avbrutt uten endringer.';
  end if;
end $$;

-- 1) Ny tenant, arvet fra VoiceBank
drop table if exists t_twinledger;
create temporary table t_twinledger as
  select * from public.tenants where slug = 'voicebank';

update t_twinledger set
  id                        = gen_random_uuid(),
  slug                      = 'twinledger',
  app_name                  = 'TwinLedger',
  name                      = 'TwinLedger',
  product_name              = null,
  parent_tenant_id          = (select id from public.tenants where slug = 'centerforge'),
  -- Appen svarer paa TwinLedgers eget domene. Salgssiden ligger fortsatt paa
  -- /twinledger og vises paa rota via proxy.ts.
  custom_domain             = 'twinledger.norditech.io',
  -- Husets uttrykk, ikke VoiceBanks lilla V.
  logo_url                  = null,
  icon_url                  = null,
  colors                    = '{}'::jsonb,
  vertical                  = 'rights',
  twinledger_enabled        = true,
  -- En rettighetsforvalter publiserer ikke til sosiale medier.
  publishing_enabled        = false,
  show_advanced_admin       = true,
  is_active                 = true;

insert into public.tenants select * from t_twinledger;
drop table if exists t_twinledger;

-- 2) Flytt eierskapet: skuespillere, utbetalinger, soeknader
update public.voice_actors
set owner_tenant_id = (select id from public.tenants where slug = 'twinledger')
where owner_tenant_id = (select id from public.tenants where slug = 'voicebank');

update public.actor_payouts
set tenant_id = (select id from public.tenants where slug = 'twinledger')
where tenant_id = (select id from public.tenants where slug = 'voicebank');

update public.voice_actor_applications
set tenant_id = (select id from public.tenants where slug = 'twinledger')
where tenant_id = (select id from public.tenants where slug = 'voicebank');

-- 3) VoiceBank blir en generell CenterForge-tjeneste
update public.tenants set
  vertical                  = null,
  twinledger_enabled        = false,
  accept_actor_applications = false,
  -- CenterForge = innholdsproduksjon inkl. publisering; bryteren fra 074 loeftes.
  publishing_enabled        = null
where slug = 'voicebank';

notify pgrst, 'reload schema';

-- Kontroll 1: twinledger under centerforge, voicebank uten forvaltning
select t.slug, t.app_name, p.slug as parent, t.custom_domain, t.vertical,
       t.twinledger_enabled, t.publishing_enabled, t.accept_actor_applications
from public.tenants t
left join public.tenants p on p.id = t.parent_tenant_id
where t.slug in ('twinledger', 'voicebank', 'standardropert', 'centerforge')
order by t.slug;

-- Kontroll 2: alle skuespillere skal naa eies av twinledger (0 hos voicebank)
select p.slug as eier, count(*) as skuespillere
from public.voice_actors a
join public.tenants p on p.id = a.owner_tenant_id
group by p.slug
order by p.slug;
