-- Skjul spraakvelgeren paa tjenester som bare tilbyr ett spraak (Lars 3/8:
-- "kanskje vi skal fjerne spraakvalget paa Isabels tjeneste").
--
-- Et eget felt, ikke en utledning fra default_locale: at en tjeneste er
-- engelsk betyr ikke at den ikke KAN tilby norsk. Valget hoerer til
-- white-labelen, ikke til en regel vi finner paa.
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
  add column if not exists show_language_toggle boolean not null default true;

update public.tenants set show_language_toggle = false where slug = 'isabel';

comment on column public.tenants.show_language_toggle is
  'Vis NO/EN-bryteren i toppen. Av for tjenester som bare tilbyr ett spraak.';

select slug, app_name, default_locale, show_language_toggle
from public.tenants order by slug;
