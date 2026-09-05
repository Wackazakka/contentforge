-- 069: Kolonnene presentasjonssiden har brukt siden PR #81 (juli 2026) — men
-- som aldri ble migrert. «Publiser siden», bio, bilder og lydproever har
-- dermed feilet stille i prod (PostgREST 400 «column not found»), og den
-- offentlige /stemme/[actorId]-siden har svart «finnes ikke».
--
-- Oppdaget 04.09.2026 ved aa lese noeklene paa en ekte rad. Laerdom: ikke anta
-- at en kolonne koden bruker finnes.
--
-- jsonb for listene: koden skriver JS-arrays via supabase-js og leser med
-- Array.isArray — jsonb er den typen som svarer likt begge veier.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tenants'
  ) or not exists (
    select 1 from public.tenants where slug = 'centerforge'
  ) then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
end $$;

alter table public.voice_actors
  add column if not exists is_public   boolean not null default false,
  add column if not exists bio         text,
  add column if not exists photo_urls  jsonb   not null default '[]'::jsonb,
  add column if not exists sample_urls jsonb   not null default '[]'::jsonb;

notify pgrst, 'reload schema';
