-- 2026-10-01: partner-innlogging (IndigoBoom Shootout ↔ PromoMaker). To tabeller, kun service role.
--
-- partner_sso_codes: engangskoder DENNE siden utsteder når en innlogget bruker hopper til partneren.
--   Partneren løser inn koden server-til-server med den delte hemmeligheten; gyldig 5 minutter, én gang.
-- partner_links: hvilken partnerkonto en lokal konto hører til. Skrives første gang en partnerbruker
--   lander her; brukes senere for å kjenne dem igjen.
-- Additiv og idempotent. Kjøres mot wxnevywhtmovangkobal (SQL Editor).

create table if not exists public.partner_sso_codes (
  code            text        primary key,
  user_id         uuid        not null,
  email           text        not null,
  display_name    text,
  email_verified  boolean     not null default false,
  audience        text        not null,
  expires_at      timestamptz not null,
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists partner_sso_codes_expires_idx on public.partner_sso_codes (expires_at);

create table if not exists public.partner_links (
  partner_id       text        not null,
  partner_user_id  text        not null,
  user_id          uuid        not null,
  email            text        not null,
  linked_at        timestamptz not null default now(),
  primary key (partner_id, partner_user_id),
  unique (partner_id, user_id)
);

alter table public.partner_sso_codes enable row level security;
alter table public.partner_links     enable row level security;
revoke all on public.partner_sso_codes from anon, authenticated;
revoke all on public.partner_links     from anon, authenticated;
