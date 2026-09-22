-- 2026-09-22: tilbakekall anon/authenticated-rettigheter paa tabeller som
-- ingen policy slipper noen inn i uansett.
--
-- BAKGRUNNEN. `ALTER DEFAULT PRIVILEGES` paa schema public gir anon og
-- authenticated `arwdDxtm` (INSERT, SELECT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES, TRIGGER) paa HVER NYE TABELL. Det er Supabases eget
-- standardoppsett. RLS-sveipen 25.08.2026 tilbakekalte rettighetene paa
-- tabellene som fantes da; alt som er opprettet etterpaa har faatt dem
-- tilbake. Rutinen «ny migrasjon -> enable row level security» slaar altsaa
-- paa laget, men lar rettigheten staa.
--
-- HVORFOR DET ER VERDT AA RYDDE selv om ingenting er aapent i dag: RLS med
-- null policyer nekter alt, saa disse tabellene er stengt. Men de staar med
-- ett lag der resten av banken har to. Den dagen noen skriver den foerste
-- policyen -- for eksempel «en rettighetshaver skal se sine egne
-- utbetalinger» -- er rettigheten allerede paa plass, og policyen definerer
-- hele flaten alene. En `for all using (true)` ment for lesing aapner da
-- ogsaa skriving og sletting, paa selve utbetalingssporet.
--
-- HVORFOR DETTE IKKE KAN BREKKE NOE. Utvalget er nettopp de tabellene som har
-- RLS paa og NULL policyer. Et kall med anon-noekkelen faar allerede null
-- rader; det finnes ingen fungerende nettleservei aa oedelegge. Serveren gaar
-- utenom begge lag med service_role-noekkelen og beroeres ikke.
--
-- SIDEEFFEKT, OG DEN ER TIL DET BEDRE: `lib`-rutene faller tilbake paa
-- anon-noekkelen hvis SUPABASE_SERVICE_ROLE_KEY mangler
-- (`SERVICE_ROLE_KEY || NEXT_PUBLIC_ANON_KEY`). I dag gir en slik feil
-- 200 og en tom liste -- altsaa «ingen data» som ser ut som et tomt system.
-- Etter dette gir den 401. En hoeylytt feil er lettere aa finne enn en stille.
--
-- IKKE ROERT: de 32 tabellene som har minst een policy. De har en ekte
-- nettleservei (ReelHome- og CenterForge-flatene), og en revoke der ville
-- stengt noe som virker. Utvalget under er generert av spoerringen nederst,
-- ikke skrevet for haand.
--
-- Idempotent: `revoke` paa noe som alt er tilbakekalt er en no-op.

revoke all on table public.actor_payouts             from anon, authenticated;
revoke all on table public.partner_payouts           from anon, authenticated;
revoke all on table public.licence_requests          from anon, authenticated;
revoke all on table public.voice_recording_sessions  from anon, authenticated;
revoke all on table public.voice_recording_clips     from anon, authenticated;
revoke all on table public.boligforge_jobs           from anon, authenticated;


-- VERIFISERING. Skal gi NULL RADER etterpaa. Lister enhver tabell som har RLS
-- paa, ingen policyer, og likevel en rettighet til anon/authenticated -- altsaa
-- nøyaktig utvalget over. Kjoer den foer og etter: foer skal den gi de seks,
-- etterpaa ingen. Det er beviset, ikke at setningene svarte «Success».
--
-- select c.relname as tabell,
--        (select count(*) from pg_policies p
--          where p.schemaname = 'public' and p.tablename = c.relname) as policyer,
--        (select string_agg(distinct g.grantee, ', ')
--           from information_schema.role_table_grants g
--          where g.table_schema = 'public' and g.table_name = c.relname
--            and g.grantee in ('anon','authenticated')) as rettighetshavere
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public'
--    and c.relkind = 'r'
--    and c.relrowsecurity
--    and (select count(*) from pg_policies p
--          where p.schemaname = 'public' and p.tablename = c.relname) = 0
--    and exists (select 1 from information_schema.role_table_grants g
--                 where g.table_schema = 'public' and g.table_name = c.relname
--                   and g.grantee in ('anon','authenticated'))
--  order by 1;
--
-- Og den samme sjekken utenfra, som er den som teller: en GET mot PostgREST
-- med den OFFENTLIGE anon-noekkelen skal gaa fra 200 [] til 401 42501.
--
--   curl -s -o /dev/null -w '%{http_code}\n' \
--     "https://wxnevywhtmovangkobal.supabase.co/rest/v1/actor_payouts?select=*&limit=1" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--
-- 🔑 Forskjellen paa de to svarene ER diagnosen, og den er verdt aa kjenne:
--    401 42501 = ingen GRANT       -> to lag
--    200 []    = GRANT, RLS nekter -> ett lag
