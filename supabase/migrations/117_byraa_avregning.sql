-- 2026-10-25: byråets andel regnes og fryses ved avregning (Lars: «Kan du
-- lage regnestykket for byråene?»). Skjemaet kom i 097; dette er det som
-- manglet for at regnestykket kan regnes riktig over tid.
--
-- PROBLEMET. En utbetaling slår sammen tre slags penger:
--   per bruk + royalty  -> byråets PROSENT gjelder (frosset ved avregning)
--   lisenser            -> byråets andel står PÅ LISENSEN (licence_splits,
--                          party_type 'agent', basis 'actor_fee'), allerede
--                          frosset — prosenten skal ikke legges på igjen
-- For å vite hva som gjenstår av hver, må raden si hvor mye av hver som ble
-- avregnet. Uten det ville en endret prosent eller den første lisensen gjort
-- regnestykket feil for alle utbetalinger etterpå.
--
-- commission_base_nok  den delen av bruttoen prosenten ble brukt på
-- licence_agent_nok    byråets lisensandel som ble avregnet her
--
-- 🔑 BRUTTO = NETTO + KUTT, på hver rad. Skranken under håndhever det, så
-- et oppgjør alltid kan leses av raden alene.
--
-- Historikken: før denne migrasjonen fantes ingen solgte lisenser og ingen
-- royalty, så alt som er utbetalt var per bruk. commission_base = brutto er
-- derfor eksakt, ikke et anslag.
--
-- Additiv og idempotent.

update public.actor_payouts set gross_nok = amount_nok where gross_nok is null;

alter table public.actor_payouts
  add column if not exists commission_base_nok numeric,
  add column if not exists licence_agent_nok numeric not null default 0;

update public.actor_payouts set commission_base_nok = gross_nok where commission_base_nok is null;

alter table public.actor_payouts
  drop constraint if exists actor_payouts_brutto_netto;
alter table public.actor_payouts
  add constraint actor_payouts_brutto_netto
    check (gross_nok is null or abs(gross_nok - amount_nok - agent_cut_nok) < 0.011);

comment on column public.actor_payouts.commission_base_nok is
  'Delen av bruttoen byråets prosent ble brukt på (per bruk + royalty). Lisenser har egen byråandel (licence_agent_nok).';
comment on column public.actor_payouts.licence_agent_nok is
  'Byråets andel av lisensene, avregnet i denne utbetalingen. Beløpet står frosset på lisensen (licence_splits).';

-- Verifisering (anon, utenfra): actor_payouts?select=commission_base_nok -> 42501
