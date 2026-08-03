-- Isabel's VideoMaker — en kopi av IndigoBoom-white-labelen, på engelsk
-- (Lars 3/8: «en kopi av dette til min niese Isabel … engelsk hele veien,
-- men ellers identisk»).
--
-- Hvorfor temp-tabell i stedet for en INSERT med kolonneliste: da arver Isabel
-- ALT fra IndigoBoom — også kolonner som kommer til senere, og som en håndskrevet
-- liste ville glemt. Vi overstyrer kun det som faktisk skal være forskjellig.

begin;

create temporary table t_isabel as
  select * from public.tenants where slug = 'indigoboom';

update t_isabel set
  id                   = gen_random_uuid(),
  slug                 = 'isabel',
  app_name             = 'Isabel''s VideoMaker',
  name                 = 'Isabel''s VideoMaker',
  -- Engelsk hele veien. Music-vertikalen har egne engelske tekster
  -- (messages/verticals/music.en.json), så artist-språket følger med.
  default_locale       = 'en',
  logo_url             = 'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/logos/isabel/logo.png',
  -- Lilla/sort uttrykk hentet FRA logoen, ikke gjettet: #7848C0 er den
  -- dominerende lilla i bildet, #9060C0 den lysere varianten.
  -- --brand-card-bg holder sluttplakaten mørk selv om sidene er lyse.
  colors               = jsonb_build_object(
                           '--ember',          '#9060C0',
                           '--ember-deep',     '#7848C0',
                           '--brand-card-bg',  '#0B0A10'
                         ),
  -- Hennes eget påslag mot sine kunder. 100 % = dobbel innpris.
  markup_percent       = 100,
  -- VÅRT påslag mot henne. 100 % = samme nivå som i dag; senk det hvis
  -- familie skal ha bedre vilkår enn en kommersiell partner.
  wholesale_markup_pct = 100,
  brand_card_url       = null,
  custom_domain        = null,
  is_active            = true,
  created_at           = now(),
  updated_at           = now();

insert into public.tenants select * from t_isabel;

commit;

-- Kontroll: skal gi én rad, med parent = CenterForge og locale 'en'
-- select slug, app_name, default_locale, parent_tenant_id, markup_percent,
--        wholesale_markup_pct from public.tenants where slug = 'isabel';
