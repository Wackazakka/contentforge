-- Skjul Partnere og API-noekler for tjenester som ikke trenger dem ennaa
-- (Lars 3/8: "saa blir det ikke saa overveldende i starten").
--
-- Ett felt for begge: de hoerer sammen som "avansert admin". Partnere gir
-- mening foerst naar man har underledd, og API-noekler foerst naar noen skal
-- bygge mot tjenesten. For en artist som saavidt har logget inn er begge stoy.
--
-- Slaa den paa igjen med en linje den dagen det trengs.
--
-- ASCII-only: Supabase-editoren tygger ae/oe/aa feil ved innliming.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tenants'
  ) or not exists (
    select 1 from public.tenants where slug = 'centerforge'
  ) then
    raise exception 'FEIL PROSJEKT. Denne migrasjonen hoerer til ContentForge. Avbrutt uten endringer.';
  end if;
end $$;

alter table public.tenants
  add column if not exists show_advanced_admin boolean not null default true;

update public.tenants set show_advanced_admin = false where slug = 'isabel';

comment on column public.tenants.show_advanced_admin is
  'Vis Partnere og API-noekler i menyen. Av for tjenester som ikke trenger dem ennaa.';

select slug, app_name, show_advanced_admin from public.tenants order by slug;
