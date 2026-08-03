-- Adresse på merkekortet (Lars 3/8: «du kan også skrive
-- indigoboom.com/videomaker på plakaten»).
--
-- Merkekortet er sluttplakaten kunder får mot rabatt. Uten en adresse er den
-- en signatur; med adresse er den en vei videre for den som ser videoen.
-- Ren tekst, ikke en lenke — den skal LESES av noen som ser en film.

alter table public.tenants
  add column if not exists brand_card_url text;

comment on column public.tenants.brand_card_url is
  'Vises under «<Navn> VideoMaker» på merkekortet. Skrives som den skal leses, uten https://';
