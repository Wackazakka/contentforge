-- 127: Hva rettighetshaveren får se av bruken, styrt per lisens (Lars 28.10.2026)
--
-- FØR: /min-stemme viste hver bruk med dato, type, lisens, byrå og beløp — men
-- ikke HVA tvillingen ble brukt til. Teksten som ble lest og resultatet ble
-- aldri lagret på hovedbokraden.
--
-- NÅ, i tre nivåer (licences.actor_insight):
--   production  navnet på produksjonen
--   script      + teksten som ble lest / beskrivelsen et bilde ble laget fra
--   full        + selve resultatet (lyd, bilde, film)
-- Grunnlinjen (når, hva, lisens, byrå, beløp) ser hun alltid.
--
-- REGLENE (Lars 28.10):
--   Drop-in (ingen byrå)  -> ser alt. Ingen kan begrense det. Håndheves i
--                            appen (lib/usageDetails.gjeldendeInnsyn), ikke
--                            her, fordi en skuespiller kan forlate et byrå.
--   Kom gjennom et byrå   -> byrået styrer, per lisens. Byråets standard
--                            (talent_agents.default_actor_insight) settes på
--                            lisensen når den lages, og gjelder bruk uten lisens.
--
-- 🔑 TEKSTEN LIGGER IKKE I HOVEDBOKEN. Hovedboken kan bare legges til (118),
-- og alt i meta inngår i hash-kjeden — en kundes manus der kunne aldri slettes.
-- Fingeravtrykket (meta.text_sha256) går i hovedboken; teksten og pekeren til
-- resultatet i voice_usage_details, som kan rettes og slettes.
--
-- 🔑 BYRÅET STYRER UTEN KONTO, med en nøkkel (insight_token) — som
-- innsigelseslenka (116). Nøkkelen er egen: påmeldingslenka gis til
-- skuespillere, og den må aldri også åpne styringen av hva de får se.
--
-- Idempotent: trygg å kjøre på nytt.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tenants'
  ) or not exists (
    select 1 from public.tenants where slug = 'centerforge'
  ) then
    raise exception 'FEIL PROSJEKT. Denne migrasjonen hører til ContentForge (wxnevywhtmovangkobal). Avbrutt uten endringer.';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Nivået på lisensen
-- ─────────────────────────────────────────────────────────────────────────
alter table public.licences
  add column if not exists actor_insight text not null default 'full';

alter table public.licences drop constraint if exists licences_actor_insight_gyldig;
alter table public.licences
  add constraint licences_actor_insight_gyldig
    check (actor_insight in ('production', 'script', 'full'));

comment on column public.licences.actor_insight is
  'Hva rettighetshaveren ser av bruken under lisensen: production (navnet), script (+ teksten), full (+ resultatet). Gjelder bare skuespillere fra et byrå; en drop-in ser alltid alt.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Byråets standard og nøkkel
-- ─────────────────────────────────────────────────────────────────────────
alter table public.talent_agents
  add column if not exists default_actor_insight text not null default 'full',
  add column if not exists insight_token text;

alter table public.talent_agents drop constraint if exists talent_agents_default_actor_insight_gyldig;
alter table public.talent_agents
  add constraint talent_agents_default_actor_insight_gyldig
    check (default_actor_insight in ('production', 'script', 'full'));

create unique index if not exists talent_agents_insight_token_idx
  on public.talent_agents (insight_token) where insight_token is not null;

comment on column public.talent_agents.default_actor_insight is
  'Byråets standard for nye lisenser og for bruk uten lisens: production, script eller full.';
comment on column public.talent_agents.insight_token is
  'Nøkkelen til byråets innsynsside (/byraa/innsyn/<nøkkel>). Egen nøkkel, ikke påmeldingslenka.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Detaljene ved siden av hovedboken
-- ─────────────────────────────────────────────────────────────────────────
-- event_id får samme type som voice_usage_events.id. Tabellen ble laget
-- utenfor repoet, så typen leses fra basen i stedet for å gjettes.
do $$
declare idtype text;
begin
  select format_type(a.atttypid, a.atttypmod) into idtype
    from pg_attribute a
   where a.attrelid = 'public.voice_usage_events'::regclass and a.attname = 'id' and not a.attisdropped;
  execute format($f$
    create table if not exists public.voice_usage_details (
      event_id     %s primary key references public.voice_usage_events (id),
      text_kind    text check (text_kind is null or text_kind in ('spoken', 'prompt', 'line')),
      text_body    text,
      output_url   text,
      output_kind  text check (output_kind is null or output_kind in ('audio', 'video', 'image')),
      output_store text not null default 'r2' check (output_store in ('r2', 'training-sets')),
      job_id       text,
      created_at   timestamptz not null default now()
    )$f$, idtype);
end $$;

create index if not exists voice_usage_details_job_idx
  on public.voice_usage_details (job_id) where job_id is not null;

comment on table public.voice_usage_details is
  'Teksten og resultatet bak en hovedbokrad (127). Fingeravtrykket av teksten står i voice_usage_events.meta.text_sha256.';

-- Bare service-rollen. Nye tabeller arver ellers full anon/authenticated-GRANT.
alter table public.voice_usage_details enable row level security;
revoke all on table public.voice_usage_details from anon, authenticated;
grant select, insert, update, delete on table public.voice_usage_details to service_role;

-- talent_agents er stengt for anon/authenticated siden 097, så nøkkelen er det også.

notify pgrst, 'reload schema';

-- Kontroll
select
  (select count(*) from public.licences where actor_insight = 'full') as lisenser_fullt_innsyn,
  (select count(*) from public.talent_agents where default_actor_insight = 'full') as byraaer_fullt_innsyn,
  not exists (select 1 from information_schema.role_table_grants
               where table_schema = 'public' and table_name = 'voice_usage_details'
                 and grantee in ('anon', 'authenticated')) as detaljer_stengt_for_anon;

-- Verifisering utenfra (anon-nøkkelen):
--   voice_usage_details?select=text_body  -> 42501
--   talent_agents?select=insight_token    -> 42501
