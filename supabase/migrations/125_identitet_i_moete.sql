-- 125: «Bekreftet i møte» som eget identitetsgrunnlag (28.10.2026)
--
-- FOER: identity_basis hadde tre verdier (101): self_declared (en avkryssing),
-- vouched (et byrå eller en admin går god for personen) og bankid.
--
-- NAA: in_person. Et menneske fra TwinLedger har møtt skuespilleren, sett at
-- personen er den hen sier, og tatt bildene og stemmeopptaket selv. Det er
-- det sterkeste grunnlaget for ansiktet: BankID beviser at kontoen tilhører et
-- navngitt menneske, men ikke at personen på bildene er den samme. Et møte
-- gjør begge deler.
--
-- identity_confirmed_by = 'meeting:<e-post til den som møtte hen>',
-- identity_confirmed_at = tidspunktet. Settes fra adminens skuespillerkort.
--
-- Publiseringssperren (116/123) stopper bare self_declared, så in_person kan
-- publiseres uten endring i triggeren.

alter table public.voice_actors
  drop constraint if exists actor_identity_basis;
alter table public.voice_actors
  add constraint actor_identity_basis
    check (identity_basis is null or identity_basis in ('self_declared', 'vouched', 'bankid', 'in_person'));

comment on column public.voice_actors.identity_basis is
  'Hva som går god for at personen er den hen sier: self_declared (avkryssing), vouched (byrå eller admin), bankid, in_person (møtt av TwinLedger). Null = lagt inn av admin før påmeldingen (101).';

notify pgrst, 'reload schema';

-- Kontroll: skranken kjenner fire verdier, og fordelingen i dag
select pg_get_constraintdef(oid) as skranke
  from pg_constraint where conname = 'actor_identity_basis';
select coalesce(identity_basis, '(null)') as grunnlag, count(*) as antall
  from public.voice_actors group by 1 order by 1;
