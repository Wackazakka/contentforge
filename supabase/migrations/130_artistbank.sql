-- 130: Artistbanken -- en KOPI av TwinLedger, bare for sangere (Lars 10.11.2026:
-- "kopi av TwinLedger ... kun for artister. Sangere." Valgt: ny tenant, ikke
-- eget repo).
--
-- Hva kopien er: samme kode, samme hovedbok, samme lisensport, egen tenant.
-- Det som er annerledes styres av ETT flagg, tenants.artists_only:
--   * paamelding krever sang og tilbyr ikke tale (lib/sang.lesSangPaamelding)
--   * galleriet, visittkortet og /tlid viser bare sangere (lib/publicActors)
--   * forsiden bruker artistteksten ('artistbank' i messages/*.json)
--   * alt som foer spurte slug === 'twinledger' spoer naa erRettighetsbank()
--     (lib/tenantNames) og svarer ja for artistbanken ogsaa
--
-- Hvorfor et flagg og ikke vertical: samme grunn som 070 -- en vertikal er
-- en tilfeldighet som venter paa at en ny tenant skal bite. NULL = vanlig bank,
-- saa alle andre tenanter er uroerte, og ingen backfill trengs.
--
-- Moensteret er 075 (TwinLedger ut av VoiceBank): temp-tabell, arv alle
-- kolonner fra twinledger-raden, overstyr bare det som skal vaere ulikt.
--
-- !! NAVN, SLUG OG DOMENE ER PLASSHOLDERE. Lars har ikke valgt navn ennaa.
-- Endre de tre verdiene oeverst i DO-blokken foer kjoering. Sluggen gir
-- adressen <slug>.norditech.io med en gang; eget domene settes i custom_domain
-- OG i proxy.ts (TWINLEDGER_HOSTS), ellers blir forsiden feil -- se proxy.ts.
--
-- ASCII-only med vilje (Supabase-editoren tygger ae/oe/aa feil ved innliming).
-- Kjoeres EN gang; sperren stopper den om den kjoeres igjen.

-- ---------------------------------------------------------------------------
-- SPERRE: feil prosjekt / mangler twinledger
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tenants'
  ) or not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
  if not exists (select 1 from public.tenants where slug = 'twinledger') then
    raise exception 'twinledger finnes ikke. Avbrutt uten endringer.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Flagget
-- ---------------------------------------------------------------------------
alter table public.tenants
  add column if not exists artists_only boolean;

comment on column public.tenants.artists_only is
  'Artistbanken (130): TwinLedger-kopi for sangere alene. Paamelding krever sang og tilbyr ikke tale, galleriet viser bare sangere, forsiden bruker artistteksten. NULL = vanlig bank.';

-- ---------------------------------------------------------------------------
-- 2) Ny tenant, arvet fra TwinLedger
-- ---------------------------------------------------------------------------
do $$
declare
  -- ===== PLASSHOLDERE -- endre foer kjoering =====
  v_slug   text := 'artister';            -- gir <slug>.norditech.io
  v_navn   text := 'TwinLedger Artister'; -- vises som navn/ordmerke inntil logo lastes opp
  v_domene text := null;                  -- f.eks. 'artistbank.ai'; null = bare subdomenet
  -- ===============================================
  v_tl uuid;
begin
  if exists (select 1 from public.tenants where slug = v_slug) then
    raise exception 'Tenanten % finnes allerede. Avbrutt uten endringer.', v_slug;
  end if;
  if v_domene is not null and exists (select 1 from public.tenants where custom_domain = v_domene) then
    raise exception 'Domenet % er alt i bruk. Avbrutt uten endringer.', v_domene;
  end if;

  select id into v_tl from public.tenants where slug = 'twinledger';

  drop table if exists t_artistbank;
  create temporary table t_artistbank as
    select * from public.tenants where id = v_tl;

  update t_artistbank set
    id                        = gen_random_uuid(),
    slug                      = v_slug,
    app_name                  = v_navn,
    name                      = v_navn,
    product_name              = null,
    -- Soesken til TwinLedger under CenterForge, ikke barn av den: banken
    -- arves nedover, og artistbanken skal ha sin egen -- ikke TwinLedgers
    -- skuespillere.
    parent_tenant_id          = (select id from public.tenants where slug = 'centerforge'),
    custom_domain             = v_domene,
    -- Eget merke kommer senere; uten logo tegnes navnet.
    logo_url                  = null,
    icon_url                  = null,
    -- Fanetekst og delingsbeskrivelse: TwinLedgers snakker om stemmer og
    -- ansikter. Artistens tekst, paa begge spraak.
    meta_title                = v_navn || ' -- klarerte sangstemmer',
    meta_description          = 'Sangstemmen du vil ha -- klarert, foert og betalt. Bak hver bruk ligger avtalen som tillater den, og artisten faar betalt hver gang.',
    meta_i18n                 = jsonb_build_object(
                                  'no', jsonb_build_object('title', v_navn || ' -- klarerte sangstemmer',
                                                           'description', 'Sangstemmen du vil ha -- klarert, foert og betalt. Bak hver bruk ligger avtalen som tillater den, og artisten faar betalt hver gang.'),
                                  'en', jsonb_build_object('title', v_navn || ' -- cleared singing voices',
                                                           'description', 'The singing voice you want -- cleared, logged and paid for. Behind every use is the agreement that permits it, and the artist is paid every time.')),
    vertical                  = 'rights',
    twinledger_enabled        = true,
    artists_only              = true,
    accept_actor_applications = true,
    publishing_enabled        = false,
    -- Av til navn og domene er paa plass; snus med 085-regelen naar den skal
    -- finnes i soek.
    allow_indexing            = false,
    show_advanced_admin       = true,
    is_active                 = true;

  insert into public.tenants select * from t_artistbank;
  drop table if exists t_artistbank;
end $$;

notify pgrst, 'reload schema';

-- Kontroll: artistbanken ved siden av twinledger, begge under centerforge
select t.slug, t.app_name, p.slug as parent, t.custom_domain, t.vertical,
       t.twinledger_enabled, t.artists_only, t.accept_actor_applications, t.allow_indexing
from public.tenants t
left join public.tenants p on p.id = t.parent_tenant_id
where t.slug in ('twinledger', 'centerforge') or t.artists_only = true
order by t.slug;
