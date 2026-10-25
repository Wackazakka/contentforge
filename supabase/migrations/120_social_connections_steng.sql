-- 2026-10-25: social_connections var ÅPEN for den offentlige nøkkelen.
--
-- Funnet i den interne sikkerhetsgjennomgangen: tabellen hadde verken RLS
-- eller tilbakekalte rettigheter. Hvem som helst med anon-nøkkelen (som
-- ligger i nettleseren) kunne lese alle 23 radene — inkludert access_token
-- og user_access_token til Facebook-sider og LinkedIn. Det er nøkler som
-- kan publisere på kundenes vegne.
--
-- 🔑 NETTLESEREN TRENGER TABELLEN, MEN ALDRI NØKLENE. Publiseringssiden
-- (app/dashboard/publish) leser lista og sletter en kobling med brukerens
-- egen sesjon. Alt annet — OAuth-tilbakekallene og selve publiseringen —
-- går via service_role på serveren. Derfor:
--   anon:          ingenting
--   authenticated: SELECT på de ufarlige kolonnene + DELETE, bare på egne
--                  koblinger (egen rad, egen organisasjon, eller medlem)
--   service_role:  som før (går utenom RLS)
-- Nøkkelkolonnene er tatt ut av SELECT-rettigheten på kolonnenivå, så selv
-- en feil policy senere kan ikke sende dem til en nettleser.
--
-- ⚠️ KODEN FØRST: publiseringssida må velge kolonner eksplisitt (ikke `*`)
-- før denne kjøres — `select *` feiler når en kolonne er tilbakekalt.

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Denne migrasjonen hoerer til ContentForge (wxnevywhtmovangkobal). Avbrutt uten endringer.';
  end if;
end $$;

alter table public.social_connections enable row level security;

revoke all on table public.social_connections from anon;
revoke all on table public.social_connections from authenticated;

grant select (id, user_id, organization_id, platform, page_id, page_name, token_expires_at, created_at)
  on public.social_connections to authenticated;
grant delete on public.social_connections to authenticated;

drop policy if exists social_connections_egne_select on public.social_connections;
create policy social_connections_egne_select on public.social_connections
  for select to authenticated
  using (
    user_id = auth.uid()
    or organization_id in (select id from public.organizations where owner_id = auth.uid())
    or organization_id in (select organization_id from public.organization_members where user_id = auth.uid())
  );

drop policy if exists social_connections_egne_delete on public.social_connections;
create policy social_connections_egne_delete on public.social_connections
  for delete to authenticated
  using (
    user_id = auth.uid()
    or organization_id in (select id from public.organizations where owner_id = auth.uid())
    or organization_id in (select organization_id from public.organization_members where user_id = auth.uid())
  );

notify pgrst, 'reload schema';

-- Kontroll: anon skal ha ingenting, authenticated bare SELECT på 8 kolonner + DELETE.
select grantee, privilege_type, count(*) as kolonner
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'social_connections' and grantee in ('anon', 'authenticated')
group by grantee, privilege_type order by grantee, privilege_type;
-- Utenfra, med anon-nøkkelen: social_connections?select=id -> 42501.
