-- Steng anon/authenticated ute av tabeller som bare serveren skal roere.
-- (Funnet 2026-08-07 under sikkerhetsgjennomgangen.)
--
-- FUNNET: 16 tabeller hadde RLS AV og samtidig fulle rettigheter til `anon` -
-- SELECT, INSERT, UPDATE, DELETE og TRUNCATE. anon-noekkelen er offentlig; den
-- ligger i nettleserpakken. Alt dette var alstsaa lesbart OG skrivbart for
-- hvem som helst, direkte mot PostgREST, utenom appen.
--
-- Bevist mot produksjon med kun den offentlige noekkelen:
--   tenants       6 rader   - alle partneres paaslag, VAART paaslag mot hver
--                             av dem, og admin_emails
--   usage_events  179 rader - hver produksjon med kostpris og kundepris
--   org_topups    5 rader   - kundesaldoene
--
-- Verst av alt: `tenants` var SKRIVBAR. Aa legge sin egen e-post i
-- admin_emails gjoer deg til tenant-admin - som er nettopp porten avregningen
-- ble sikret med samme dag. Rettighetene undergravde altsaa fiksene over.
--
-- INGEN klientkode leser disse 15. Alt gaar via service_role server-side, som
-- gaar utenom baade grants og RLS. Derfor er dette trygt.
--
-- ⚠️ asset_banks er BEVISST utelatt: produktsiden leser OG sletter der med
-- brukerens noekkel. Den trenger RLS med en eierskaps-policy etter moenster fra
-- `products` (asset_banks.product_id -> products -> organizations.owner_id).
-- Egen jobb - ikke gjett paa den her.
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

do $$
declare
  t text;
  tabeller text[] := array[
    'actor_approval_settings', 'api_keys', 'color_palettes', 'external_earnings',
    'music_files', 'org_topups', 'partner_topups', 'tenants', 'usage_approvals',
    'usage_events', 'user_characters', 'voice_actor_applications', 'voice_actors',
    'voice_usage_events', 'whitelabel_applications'
  ];
begin
  foreach t in array tabeller loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('revoke all on public.%I from anon, authenticated', t);
      -- Belte og bukseseler: skulle en grant komme tilbake ved et uhell,
      -- stopper RLS uansett. service_role gaar utenom RLS.
      execute format('alter table public.%I enable row level security', t);
      raise notice 'stengt: %', t;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
