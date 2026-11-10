-- 131: Artistbanken heter StarLedger (Lars 10.11.2026: "La oss kalle den
-- StarLedger.ai"). 130 ble kjoert med plassholderne slug 'artister' /
-- 'TwinLedger Artister'; dette er navneskiftet.
--
-- TO STEG, KJOERES HVER FOR SEG:
--   Steg 1 (naa): slug, navn og fanetekst. Adressen blir starledger.norditech.io
--     (Netlify-alias + DNS er lagt til). artister.norditech.io slutter aa
--     loese til tenanten -- den sluggen finnes ikke lenger.
--   Steg 2 (FOERST naar starledger.ai peker paa Netlify og sertifikatet er
--     utstedt): custom_domain. Settes den for tidlig, peker kanoniske lenker
--     og bekreftelses-e-poster paa et domene som ikke svarer.
--
-- Ingen skuespillere er paameldt ennaa, saa ingen rader refererer sluggen.
-- ASCII-only med vilje.

-- ---------------------------------------------------------------------------
-- STEG 1: navn og slug
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
  if exists (select 1 from public.tenants where slug = 'starledger') then
    raise exception 'starledger finnes allerede. Avbrutt uten endringer.';
  end if;
  if not exists (select 1 from public.tenants where slug = 'artister' and artists_only = true) then
    raise exception 'artister (130) finnes ikke. Avbrutt uten endringer.';
  end if;
end $$;

update public.tenants set
  slug             = 'starledger',
  app_name         = 'StarLedger',
  name             = 'StarLedger',
  meta_title       = 'StarLedger -- klarerte sangstemmer, ekte og virtuelle artister',
  meta_description = 'Sangstemmen du vil ha -- klarert, foert og betalt. Bak hver bruk ligger avtalen som tillater den, og artisten faar betalt hver gang.',
  meta_i18n        = jsonb_build_object(
                       'no', jsonb_build_object('title', 'StarLedger -- klarerte sangstemmer, ekte og virtuelle artister',
                                                'description', 'Sangstemmen du vil ha -- klarert, foert og betalt. Bak hver bruk ligger avtalen som tillater den, og artisten faar betalt hver gang.'),
                       'en', jsonb_build_object('title', 'StarLedger -- cleared singing voices, real and virtual artists',
                                                'description', 'The singing voice you want -- cleared, logged and paid for. Behind every use is the agreement that permits it, and the artist is paid every time.'))
where slug = 'artister' and artists_only = true;

notify pgrst, 'reload schema';

select slug, app_name, custom_domain, artists_only, allow_indexing
from public.tenants where artists_only = true;

-- ---------------------------------------------------------------------------
-- STEG 2: eget domene. KJOER FOERST naar https://starledger.ai svarer 200
-- (DNS hos registraren, Netlify-alias, sertifikat fornyet). Kjoer ogsaa
-- allow_indexing = true naar sida skal finnes i soek (085-regelen).
-- ---------------------------------------------------------------------------
-- update public.tenants set custom_domain = 'starledger.ai'
-- where slug = 'starledger' and artists_only = true;
-- notify pgrst, 'reload schema';
