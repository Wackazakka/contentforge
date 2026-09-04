-- 2026-09-04: production_payments fantes ikke i prod (kun i koden), og
-- production_drafts manglet include_outro_card. Oppdaget ved forste
-- fastpris-film i Standard Ropert ("Kunne ikke registrere betalingen").
-- Additiv og idempotent. Kjort mot wxnevywhtmovangkobal via Management API.

create table if not exists public.production_payments (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  user_id uuid,
  tier text not null default 'registered',
  amount_ore integer not null,
  stripe_session_id text not null unique,
  stripe_event_id text,
  stripe_payment_intent_id text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists production_payments_draft_idx on public.production_payments (draft_id);

-- Kun service role skal lese/skrive (webhook, checkout). Ingen policies = stengt for anon/auth.
alter table public.production_payments enable row level security;
revoke all on public.production_payments from anon, authenticated;

alter table public.production_drafts add column if not exists include_outro_card boolean;
