-- Språk i filmen (Lars 10.11.2026, Lises ønske: «Det skulle vært mulig å
-- bruke engelsk tekst»). Appen skrev alltid på samme språk som beskrivelsen,
-- og Lise måtte oversette alle scenene selv. 'en' = scenetekst og tale skrives
-- på engelsk, og stemmeleseren bruker engelsk uttale. null = som før.
alter table public.production_drafts
  add column if not exists language text check (language in ('no', 'en'));
