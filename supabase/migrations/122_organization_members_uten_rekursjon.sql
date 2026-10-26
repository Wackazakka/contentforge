-- 122: bryt RLS-sirkelen organizations <-> organization_members (2026-10-26)
--
-- Migrasjon 121 ga organization_members policyer som slaar opp i organizations
-- ("... in (select id from organizations where owner_id = auth.uid())").
-- organizations har samtidig policyen "Members can view their organizations"
-- som slaar opp i organization_members. Resultat for ALLE innloggede brukere
-- siden 25/10: ERROR 42P17 infinite recursion detected in policy for relation
-- "organizations" -- dashbordet fant ingen arbeidsomraader, og ingen anledning
-- kunne lagres (Lars paa standardropert 26/10). service_role er upaavirket.
--
-- Loesning: eierskap sjekkes via en SECURITY DEFINER-funksjon som leser
-- organizations uten RLS. Da refererer organization_members-policyene ikke
-- lenger organizations gjennom dens policyer, og sirkelen er brutt.
-- Idempotent. ASCII-only (Supabase-editoren tygger ae/oe/aa).

create or replace function public.er_org_eier(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_org and o.owner_id = auth.uid()
  );
$$;

revoke all on function public.er_org_eier(uuid) from public, anon;
grant execute on function public.er_org_eier(uuid) to authenticated, service_role;

drop policy if exists medlem_ser_egne on public.organization_members;
create policy medlem_ser_egne on public.organization_members
  for select to authenticated
  using (user_id = auth.uid() or public.er_org_eier(organization_id));

drop policy if exists eier_forvalter_medlemmer on public.organization_members;
create policy eier_forvalter_medlemmer on public.organization_members
  for all to authenticated
  using (public.er_org_eier(organization_id))
  with check (public.er_org_eier(organization_id));

notify pgrst, 'reload schema';

-- Kontroll: skal gi to rader uten "organizations" i definisjonen
select policyname, qual from pg_policies
where schemaname = 'public' and tablename = 'organization_members';
