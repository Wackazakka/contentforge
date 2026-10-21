-- Supportsiden (/hjelp, Lars 21.10.2026): brukere sender spørsmål til Lars.
-- Hver henvendelse sendes på e-post (svar går rett til brukeren) OG lagres
-- her, så ingenting går tapt om e-posten skulle feile.
-- avsender_hash: SHA-256 av IP — brukes bare til å begrense antall per time.
create table if not exists support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text not null,
  name text,
  tenant_slug text not null,
  kategori text not null,
  melding text not null,
  side text,
  user_agent text,
  avsender_hash text,
  epost_sendt boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists support_requests_rate on support_requests (avsender_hash, created_at);
create index if not exists support_requests_email on support_requests (email, created_at);

-- Bare service-rollen (ruta). Nye tabeller arver ellers full
-- anon/authenticated-GRANT via ALTER DEFAULT PRIVILEGES (RLS-sveipet 2026).
alter table support_requests enable row level security;
revoke all on support_requests from anon, authenticated;
