-- Valuta per tenant (Lars 3/8: "Isabels tjeneste maa ta betalt i GBP").
--
-- Kredittene er valutanoeytrale og betyr det samme overalt; det er PRISEN paa
-- pakken som skifter. En britisk artist faar noeyaktig like mange kreditter
-- for pengene sine som en norsk.
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
  add column if not exists currency text not null default 'nok';

alter table public.tenants
  drop constraint if exists tenants_currency_check;
alter table public.tenants
  add constraint tenants_currency_check check (currency in ('nok', 'gbp'));

update public.tenants set currency = 'gbp' where slug = 'isabel';

comment on column public.tenants.currency is
  'Valuta tenantens kunder betaler i. Kredittene er de samme; kun pakkeprisen skifter.';

select slug, app_name, currency from public.tenants order by slug;
