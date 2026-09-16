-- products manglet DELETE-policy (RLS paa siden RLS-sveipet 25/8). Med
-- brukerens egen noekkel ga en sletting da INGEN feil og NULL rader:
-- artisten forsvant fra skjermen og var tilbake ved neste lasting
-- (Lars 16/9). Policyen speiler UPDATE-policyen: eieren av organisasjonen.
--
-- KJOERT I PROD 16/9 via Management-API. Ligger her for sporbarhet.
-- ASCII-only: Supabase-editoren tygger ae/oe/aa feil ved innliming.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and cmd = 'DELETE'
  ) then
    execute 'create policy "Users can delete products in their organizations" on public.products
      for delete using (organization_id in (select organizations.id from organizations where organizations.owner_id = auth.uid()))';
  end if;
end $$;
