-- Velkomstinvitasjoner (Lars 20.10.2026): testere får en ferdig konto (med
-- organisasjon og kreditter) og en velkomst-e-post med EGEN lenke til «Velg
-- passord». Supabase sine e-postlenker varer bare 1 time; vår lenke varer
-- 24 timer og lager en fersk Supabase-lenke først når den klikkes.
--
-- Tokenet lagres bare som SHA-256 — selve lenken finnes kun i e-posten.
-- send_at: når e-posten skal gå (droplet-cron kaller /api/velkommen/send).
-- used_at: lenken virker én gang.
create table if not exists welcome_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  full_name text,
  tenant_slug text not null,
  send_at timestamptz not null,
  sent_at timestamptz,
  token_hash text unique,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Bare service-rollen (serverrutene). Nye tabeller arver ellers full
-- anon/authenticated-GRANT via ALTER DEFAULT PRIVILEGES (RLS-sveipet 2026).
alter table welcome_invites enable row level security;
revoke all on welcome_invites from anon, authenticated;

-- Kredittene testeren fikk — vises i velkomst-e-posten (null = nevnes ikke)
alter table welcome_invites add column if not exists credits numeric;

-- Fritt notat til akkurat denne invitasjonen (f.eks. møtetid for en testgruppe),
-- vises uthevet i velkomst-e-posten. Ren tekst — escapes ved utsending.
alter table welcome_invites add column if not exists notat text;

-- Svaradresse for velkomst-e-posten (avsender er no-reply). Når satt, får
-- e-posten «Får du det ikke til? Svar på denne e-posten …» og reply-to hit.
alter table welcome_invites add column if not exists svar_til text;

-- Hvem e-posten er fra («Hilsen <navn>» + tjenestens fulle navn). Lars 21.10.
alter table welcome_invites add column if not exists hilsen_fra text;
