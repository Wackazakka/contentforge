-- 2026-10-25: databasefunn fra den interne sikkerhetsgjennomgangen.
-- Grunnlaget er en full utskrift av rettigheter, policyer, funksjoner og
-- bøtter (kjørt i SQL-editoren 25.10). Alt under er sjekket mot koden:
-- ingen av tabellene som stenges, leses fra nettleseren, og ingen av
-- funksjonene kalles fra klienten — alle kalles fra serveren med
-- service_role, som går utenom både rettigheter og RLS.
--
-- 1) KREDITT-FUNKSJONENE var åpne for anon. add_credits og deduct_credits er
--    SECURITY DEFINER og kunne kalles av hvem som helst med den offentlige
--    nøkkelen — altså gi seg selv kreditt. Tilbakekalles for anon og
--    authenticated; service_role beholder.
-- 2) collection_videos og app_config hadde policyer «for alle, using true»:
--    anon kunne lese OG skrive. Brukes ikke av koden. Stenges helt.
-- 3) organization_members: policyen «admins_can_manage_members» var
--    `ALL using (user_id = auth.uid())` — en bruker kunne legge seg selv inn
--    som medlem i en hvilken som helst organisasjon, og dermed lese andres
--    produkter, utkast og artikler. Nå kan bare organisasjonens eier endre
--    medlemskap; alle kan se sine egne.
-- 4) social_connections: fire gamle policyer («Service can … using true»,
--    «Users can manage their own») lot innloggede lese alle koblinger.
--    service_role trenger ingen policy. Fjernes.
-- 5) profiles hadde en policy som slo opp i profiles — uendelig rekursjon
--    (42P17) for alle som ikke er service_role, og den smittet over på
--    production_jobs og credits via deres policyer. Ingen av tabellene
--    profiles/credits brukes av koden; production_jobs beholder
--    eierbaserte policyer og mister de profilbaserte.
-- 6) Rester fra ReelHome-skjemaet (agent_profiles, properties, …) med fulle
--    rettigheter: stenges, de brukes ikke her.
--
-- Rotårsaken står fortsatt: standardrettighetene gir anon/authenticated
-- alt på hver NY tabell. Se nederst (frivillig, Lars' valg).

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Denne migrasjonen hoerer til ContentForge (wxnevywhtmovangkobal). Avbrutt uten endringer.';
  end if;
end $$;

-- 1) Funksjoner: bare serveren
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('add_credits', 'deduct_credits', 'add_draft_cost', 'actor_earnings',
                        'hovedbok_hash', 'hovedbok_innhold', 'kontroller_hovedboken')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- 2) + 6) Tabeller koden ikke bruker fra nettleseren: ingen rettigheter, ingen policyer
do $$
declare t text; pol record;
begin
  foreach t in array array[
    'collection_videos', 'app_config', 'credits', 'profiles',
    'agent_profiles', 'agent_settings_images', 'properties', 'property_videos',
    'video_collections', 'video_credits', 'subscriptions',
    'reelhome_sellers', 'reelhome_payments', 'reelhome_publications',
    'reelhome_scheduled_publications', 'reelhome_org_referrals', 'reelhome_seller_commissions'
  ] loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('revoke all on table public.%I from anon, authenticated', t);
      execute format('alter table public.%I enable row level security', t);
      for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, t);
      end loop;
      raise notice 'stengt: %', t;
    end if;
  end loop;
end $$;

-- 5) production_jobs: bort med de profilbaserte policyene (rekursjonen)
drop policy if exists "jobs: admin read org" on public.production_jobs;
drop policy if exists "jobs: agent read own" on public.production_jobs;
drop policy if exists "jobs: insert own" on public.production_jobs;
drop policy if exists "jobs: update own" on public.production_jobs;

-- 4) social_connections: bare de to policyene fra 120
drop policy if exists "Service can insert connections" on public.social_connections;
drop policy if exists "Service can read connections by page_id" on public.social_connections;
drop policy if exists "Service can update connections" on public.social_connections;
drop policy if exists "Users can manage their own connections" on public.social_connections;

-- 3) organization_members: eieren forvalter, alle ser sine egne
drop policy if exists admins_can_manage_members on public.organization_members;
drop policy if exists members_can_read_own_org on public.organization_members;
create policy medlem_ser_egne on public.organization_members
  for select to authenticated
  using (user_id = auth.uid()
         or organization_id in (select id from public.organizations where owner_id = auth.uid()));
create policy eier_forvalter_medlemmer on public.organization_members
  for all to authenticated
  using (organization_id in (select id from public.organizations where owner_id = auth.uid()))
  with check (organization_id in (select id from public.organizations where owner_id = auth.uid()));
revoke all on table public.organization_members from anon;

notify pgrst, 'reload schema';

-- Kontroll
select 'funksjoner åpne for anon' as hva, count(*) as antall
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('add_credits', 'deduct_credits', 'add_draft_cost', 'actor_earnings')
  and has_function_privilege('anon', p.oid, 'execute')
union all
select 'policyer på social_connections', count(*) from pg_policies where tablename = 'social_connections'
union all
select 'policyer på production_jobs', count(*) from pg_policies where tablename = 'production_jobs'
union all
select 'policyer på organization_members', count(*) from pg_policies where tablename = 'organization_members';
-- forventet: 0 · 2 · 3 · 2

-- FRIVILLIG, Lars' valg (rotårsaken): nye tabeller skal ikke arve rettigheter.
-- Etter dette må hver tabell nettleseren skal lese, få en eksplisitt grant.
--   alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
--   alter default privileges for role supabase_admin in schema public revoke all on tables from anon, authenticated;
