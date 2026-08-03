-- Isabel's VideoMaker -- en kopi av IndigoBoom-white-labelen, paa engelsk
-- (Lars 3/8: «en kopi av dette til min niese Isabel ... engelsk hele veien,
-- men ellers identisk»).
--
-- Hvorfor temp-tabell i stedet for en INSERT med kolonneliste: da arver Isabel
-- ALT fra IndigoBoom -- ogsaa kolonner som kommer til senere, og som en
-- haandskrevet liste ville glemt. Vi overstyrer kun det som skal vaere ulikt.
--
-- ASCII-only med vilje: Supabase-editoren tygger ae/oe/aa feil ved innliming.

drop table if exists t_isabel;

create temporary table t_isabel as
  select * from public.tenants where slug = 'indigoboom';

update t_isabel set
  id                   = gen_random_uuid(),
  slug                 = 'isabel',
  app_name             = 'Isabel''s VideoMaker',
  name                 = 'Isabel''s VideoMaker',
  -- Engelsk hele veien. Music-vertikalen har egne engelske tekster
  -- (messages/verticals/music.en.json), saa artist-spraaket foelger med.
  default_locale       = 'en',
  logo_url             = 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/logos/isabel/logo.png',
  -- Lilla/sort uttrykk MAALT fra logoen, ikke gjettet: #7848C0 er den
  -- dominerende lilla i bildet, #9060C0 den lysere varianten.
  -- --brand-card-bg holder sluttplakaten moerk selv om sidene er lyse.
  colors               = jsonb_build_object(
                           '--ember',          '#9060C0',
                           '--ember-deep',     '#7848C0',
                           '--brand-card-bg',  '#0B0A10'
                         ),
  -- Hennes eget paaslag mot sine kunder. 100 % = dobbel innpris.
  markup_percent       = 100,
  -- VAART paaslag mot henne. 100 % = samme nivaa som i dag; senk det hvis
  -- familie skal ha bedre vilkaar enn en kommersiell partner.
  wholesale_markup_pct = 100,
  brand_card_url       = null,
  custom_domain        = null,
  is_active            = true,
  created_at           = now(),
  updated_at           = now();

insert into public.tenants select * from t_isabel;

drop table if exists t_isabel;

-- Kontroll: skal gi EN rad, med parent = CenterForge og locale 'en'
select slug, app_name, default_locale, parent_tenant_id,
       markup_percent, wholesale_markup_pct
from public.tenants where slug = 'isabel';
