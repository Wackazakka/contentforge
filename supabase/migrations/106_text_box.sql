-- Mørkt felt bak teksten nederst i videoen kan slås av per video
-- (David/Lars 12.10.2026). Standard PÅ, så alle eksisterende utkast og
-- videoer rendres nøyaktig som før. Av = ingen boks; renderen gir da teksten
-- en mørk kant (make_tiktok_reforhandle.py, _TEXT_BOX).
alter table production_drafts
  add column if not exists text_box boolean not null default true;
