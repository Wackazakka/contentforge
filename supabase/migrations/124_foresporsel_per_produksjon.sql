-- 2026-10-25: én åpen forespørsel per PRODUKSJON, ikke per skuespiller
-- (Lars: «hva om kunden vil ha en skuespiller med i flere enn én produksjon
-- samtidig?»).
--
-- FØR (090): unik indeks på (actor_id, organization_id) der status='open'.
-- Den stoppet dobbeltklikk — men også et produksjonsselskap som ba om samme
-- skuespiller til en film mens forespørselen om en reklame ventet. Og skjemaet
-- kjente bare kampanjeaksene: en film kunne bare beskrives i notatet.
--
-- NÅ:
--   kind             campaign · work — de to lisensregimene fra 078
--   production_title navnet på kampanjen eller verket; kreves for nye
--   production_tier  verkets størrelse (takstkortets akse for verk)
--   role_scope       rollens omfang (takstkortets akse for verk)
-- Kampanjeaksene blir valgfrie for verk; en sjekk krever riktige akser for
-- riktig type. Grensen blir én åpen forespørsel per skuespiller, kunde, type
-- og produksjon (navnet uten store/små bokstaver og mellomrom i endene).

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Denne migrasjonen hoerer til ContentForge (wxnevywhtmovangkobal). Avbrutt uten endringer.';
  end if;
end $$;

alter table public.licence_requests
  add column if not exists kind text not null default 'campaign',
  add column if not exists production_title text,
  add column if not exists production_tier text,
  add column if not exists role_scope text;

alter table public.licence_requests drop constraint if exists licence_requests_kind_check;
alter table public.licence_requests add constraint licence_requests_kind_check
  check (kind in ('campaign', 'work'));
alter table public.licence_requests drop constraint if exists licence_requests_tier_check;
alter table public.licence_requests add constraint licence_requests_tier_check
  check (production_tier is null or production_tier in ('short', 'national', 'major', 'international'));
alter table public.licence_requests drop constraint if exists licence_requests_role_check;
alter table public.licence_requests add constraint licence_requests_role_check
  check (role_scope is null or role_scope in ('line', 'supporting', 'lead'));

alter table public.licence_requests
  alter column media_class drop not null,
  alter column territory   drop not null,
  alter column term_months drop not null,
  alter column exclusivity drop not null;

alter table public.licence_requests drop constraint if exists licence_requests_akser;
alter table public.licence_requests add constraint licence_requests_akser check (
  (kind = 'campaign' and media_class is not null and territory is not null
                     and term_months is not null and exclusivity is not null)
  or
  (kind = 'work' and production_title is not null and production_tier is not null and role_scope is not null)
);

drop index if exists public.licence_requests_en_aapen;
create unique index if not exists licence_requests_en_aapen_per_produksjon
  on public.licence_requests (actor_id, organization_id, kind, lower(btrim(coalesce(production_title, ''))))
  where status = 'open';

notify pgrst, 'reload schema';

-- Kontroll
select 'åpne forespørsler' as hva, count(*)::text as verdi from public.licence_requests where status = 'open'
union all
select 'indeks per produksjon', count(*)::text from pg_indexes where indexname = 'licence_requests_en_aapen_per_produksjon'
union all
select 'gammel indeks igjen', count(*)::text from pg_indexes where indexname = 'licence_requests_en_aapen';
-- forventet: (antall) · 1 · 0
