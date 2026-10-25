-- 115: rettighetshaverens EGEN ansiktsmodell som kildefil (23.10.2026).
--
-- Kommer hun med en Flux-LoRA hun alt har, er modellfila selve kildematerialet:
-- den faar fingeravtrykk (sha256, regnet paa dropleten) og hennes erklaering
-- frosset paa raden, som bildene (110). Bare typen er ny.
alter table public.source_files drop constraint if exists source_files_kind_check;
alter table public.source_files add constraint source_files_kind_check
  check (kind in ('photo', 'recording', 'model'));
