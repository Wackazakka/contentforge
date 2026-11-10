-- SoMe SongPromo -- en kopi av IndigoBoom-white-labelen (PromoMaker) for
-- SinglePicker-brukerne (Lars 10/11-2026: "Bygg SoMe SongPromo som en kopi av
-- PromoMaker"). Brukerne lager promo for laata si, inne i SinglePicker.
--
-- Samme oppskrift som 055 (Isabel): temp-tabell, saa SongPromo arver ALT fra
-- IndigoBoom -- ogsaa kolonner som kommer til senere -- og vi overstyrer bare
-- det som skal vaere ulikt.
--
--   app_name     = SinglePicker       (selskapet / avsenderen)
--   product_name = SoMe SongPromo     (tjenesten: fanetittel, innlogging, merkekort)
--   => fullt navn "SinglePicker SoMe SongPromo" (lib/tenantNames.ts)
--
-- Adresse: songpromo.norditech.io (subdomene = slug). Krever at domenet er lagt
-- til som alias paa Netlify-siten og i Supabase Auth -> URL Configuration.
--
-- Arvet fra IndigoBoom med vilje: musikk-vertikalen, publisering AV (070 --
-- SongPromo har ingen egen Meta-app), enkel admin, paaslag og takstkort.
--
-- Angre: delete from public.tenants where slug = 'songpromo';  (bare saa lenge
-- ingen organisasjoner er opprettet under den).
--
-- ASCII-only med vilje: Supabase-editoren tygger ae/oe/aa feil ved innliming.

-- ---------------------------------------------------------------------------
-- SPERRE: ReelHome har en tabell med SAMME navn i et ANNET Supabase-prosjekt
-- (jvnavubholyvihvytqkn). Denne blokken avbryter uten endringer der.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tenants'
  ) or not exists (
    select 1 from public.tenants where slug = 'centerforge'
  ) then
    raise exception 'FEIL PROSJEKT. Denne migrasjonen hoerer til ContentForge (wxnevywhtmovangkobal). Avbrutt uten endringer.';
  end if;
  if exists (select 1 from public.tenants where slug = 'songpromo') then
    raise exception 'Tenanten songpromo finnes allerede. Avbrutt uten endringer.';
  end if;
end $$;

drop table if exists t_songpromo;

create temporary table t_songpromo as
  select * from public.tenants where slug = 'indigoboom';

update t_songpromo set
  id                   = gen_random_uuid(),
  slug                 = 'songpromo',
  name                 = 'SinglePicker SoMe SongPromo',
  app_name             = 'SinglePicker',
  product_name         = 'SoMe SongPromo',
  -- SinglePicker er engelsk. Music-vertikalen har egne engelske tekster.
  default_locale       = 'en',
  -- SinglePicker har ingen logofil, bare navnet i tekst. Tomt = navnet vises.
  logo_url             = null,
  icon_url             = null,
  -- SinglePickers egne farger (app/globals.css): korall som aksent, den
  -- moerke lilla-sorte som bakgrunn paa sluttplakaten.
  colors               = jsonb_build_object(
                           '--ember',          '#F17E70',
                           '--ember-deep',     '#E8695C',
                           '--brand-card-bg',  '#080614'
                         ),
  brand_card_url       = null,
  custom_domain        = null,
  meta_title           = null,
  meta_description     = null,
  meta_i18n            = '{}'::jsonb,
  allow_indexing       = false,
  is_active            = true;

insert into public.tenants select * from t_songpromo;

drop table if exists t_songpromo;

-- Kontroll: skal gi EN rad, engelsk, med samme parent som IndigoBoom.
select slug, app_name, product_name, default_locale, parent_tenant_id,
       vertical, publishing_enabled, currency, markup_percent
from public.tenants where slug in ('songpromo', 'indigoboom') order by slug;
