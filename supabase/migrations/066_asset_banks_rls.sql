-- asset_banks: eierskaps-RLS. Siste tabell fra sikkerhetsgjennomgangen 7/8.
--
-- Den ble bevisst utelatt fra 065 fordi produktsiden bade LESER og SLETTER der
-- med brukerens egen noekkel - en rask revoke ville tatt ned redigereren.
-- Konsekvensen av aa vente var at hvem som helst med den offentlige noekkelen
-- kunne slette andres bilder og klipp.
--
-- MAALT FOER ENDRING (931 rader):
--   0 rader uten product_id      -> ingen foreldreloese rader aa gjemme bort
--   0 rader mot slettet produkt  -> ingen daarlige referanser
--   klienten gjoer kun select + delete; all INSERT skjer server-side med
--   service_role, som gaar utenom RLS
--   /start (anonym loype) rorer ikke asset_banks i det hele tatt
--
-- Vilkaaret speiler policyen som allerede virker paa `products`:
--   organization_id in (select id from organizations where owner_id = auth.uid())
-- ett ledd lenger ut, via product_id.
--
-- ⚠️ RLS feiler STILLE: blir vilkaaret feil, ser brukeren et TOMT bibliotek,
-- ikke en feilmelding. Rulles tilbake med:
--   alter table public.asset_banks disable row level security;
--
-- ASCII-only: Supabase-editoren tygger ae/oe/aa feil ved innliming.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tenants'
  ) or not exists (
    select 1 from public.tenants where slug = 'centerforge'
  ) then
    raise exception 'FEIL PROSJEKT. Denne migrasjonen hoerer til ContentForge (wxnevywhtmovangkobal). Avbrutt uten endringer.';
  end if;
end $$;

-- Anonyme har ingenting her aa gjoere - verifisert at /start ikke leser tabellen.
revoke all on public.asset_banks from anon;

alter table public.asset_banks enable row level security;

drop policy if exists "Eier ser egne assets" on public.asset_banks;
create policy "Eier ser egne assets" on public.asset_banks
  for select to authenticated
  using (
    product_id in (
      select p.id from public.products p
      where p.organization_id in (
        select o.id from public.organizations o where o.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "Eier sletter egne assets" on public.asset_banks;
create policy "Eier sletter egne assets" on public.asset_banks
  for delete to authenticated
  using (
    product_id in (
      select p.id from public.products p
      where p.organization_id in (
        select o.id from public.organizations o where o.owner_id = auth.uid()
      )
    )
  );

notify pgrst, 'reload schema';
