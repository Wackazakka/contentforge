-- Overgang mellom scenene (Lars 10.11.2026, Lises ønske: «overgangen til neste
-- bilde ble ikke bra. Går det an å redigere overganger?»).
--   standard  kort toning fra svart (0,3 s) — slik alle filmer har vært
--   kutt      rett over
--   kort      krysstoning 0,5 s
--   lang      krysstoning 1,0 s
-- null = standard.
alter table public.production_drafts
  add column if not exists overgang text check (overgang in ('standard', 'kutt', 'kort', 'lang'));
