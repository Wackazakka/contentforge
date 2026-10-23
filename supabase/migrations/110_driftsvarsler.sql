-- Driftsvakten (Lars 23.10.2026): varsler Lars på e-post når en leverandør
-- (fal, ElevenLabs, OpenAI, Anthropic) er i ferd med å gå tom for kreditt.
-- nokkel = hva varselet gjelder (f.eks. 'fal:lav'); samme nøkkel sendes maks
-- én gang per døgn, så en tom konto ikke gir én e-post per time.
create table if not exists driftsvarsler (
  id uuid primary key default gen_random_uuid(),
  nokkel text not null,
  kilde text not null,
  emne text not null,
  tekst text,
  epost_sendt boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists driftsvarsler_nokkel on driftsvarsler (nokkel, created_at);

-- Bare service-rollen. Nye tabeller arver ellers full anon/authenticated-GRANT.
alter table driftsvarsler enable row level security;
revoke all on driftsvarsler from anon, authenticated;
