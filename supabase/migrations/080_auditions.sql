-- 080: Audition -- samme scene, samme replikk, ulike skuespillere (Lars 20.09.2026)
--
-- Det en casting-ansvarlig faktisk gjoer hele dagen, og som ingen kan tilby med
-- KLARERTE mennesker. Regissoeren skriver en replikk, velger skuespillere, og
-- faar samme skudd rendret med hver av dem.
--
-- NB: DESIGNREGELEN: alt unntatt skuespilleren maa vaere identisk. Samme replikk,
-- samme scene-prompt, samme lys, samme lengde, samme beskjaering. Varierer
-- rammen, sammenlikner regissoeren BILDER. Er rammen lik, sammenlikner hen
-- SKUESPILLERE. Det er hele forskjellen paa et castingverktoey og en
-- showreel-maskin. Derfor ligger scene_prompt paa AUDITIONEN, ikke paa taket.
--
-- NB: EN AUDITION ER BRUK FOER EN LISENS FINNES. Det er nettopp det
-- proevelytt-royaltyen ble laget for (lib/voiceBank.ts, PREVIEW_ROYALTY_PER_1000):
-- utforskning skal vaere billig, skuespilleren skal likevel faa betalt, og raden
-- i hovedboken staar uten hjemmel med `licence_match: 'preview'`. Ingen ny
-- mekanikk -- et nytt bruksomraade for en som allerede virker.
--
-- NB: STEGVIS KJOERING, ikke synkron. Et stillbilde tar ~15 s og en Fabric-render
-- ~60 s; en serverless-funksjon rekker ingen av delene. Derfor baerer hver take
-- leverandoerens request_id og en `stage`, og en poll-rute flytter den videre.
--
-- ASCII-only (Supabase-editoren tygger ae/oe/aa ved innliming).

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
end $$;

create table if not exists public.auditions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid,
  title           text,
  -- Replikken skuespillerne skal lese. Identisk for alle takes.
  line            text not null,
  -- Regi: hvordan replikken skal leses. Styrer stemmeinnstillingene.
  direction       text,
  -- Scenen stillbildet settes i. Identisk for alle takes -- se designregelen.
  scene_prompt    text not null,
  status          text not null default 'running'
                    check (status in ('running', 'done', 'failed')),
  created_at      timestamptz default now(),
  created_by      text
);

create index if not exists auditions_tenant_idx on public.auditions(tenant_id);

create table if not exists public.audition_takes (
  id            uuid primary key default gen_random_uuid(),
  audition_id   uuid not null references public.auditions(id) on delete cascade,
  actor_id      uuid not null references public.voice_actors(id) on delete restrict,
  -- Stegene en take gaar gjennom. Poll-ruten flytter den ett hakk om gangen.
  stage         text not null default 'queued'
                  check (stage in ('queued', 'still', 'voice', 'video', 'done', 'failed')),
  -- Leverandoerens koe-id for steget som paagaar. Uten den kan et paabegynt
  -- (og betalt) steg ikke hentes igjen.
  request_id    text,
  still_url     text,
  audio_url     text,
  video_url     text,
  -- Frosset, som alt annet i hovedboken.
  cost_nok      numeric(10,2),
  actor_nok     numeric(10,2),
  feil          text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists audition_takes_audition_idx on public.audition_takes(audition_id);
create index if not exists audition_takes_stage_idx    on public.audition_takes(stage);

revoke all on public.auditions      from anon, authenticated;
revoke all on public.audition_takes from anon, authenticated;
alter table public.auditions      enable row level security;
alter table public.audition_takes enable row level security;
grant select, insert, update, delete on public.auditions      to service_role;
grant select, insert, update, delete on public.audition_takes to service_role;

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name in ('auditions','audition_takes')) as tabeller;
