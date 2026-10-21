-- Tilbakemeldingsskjema (Lars 21.10.2026): PromoMaker-testerne svarer i appen
-- (/tilbakemelding). Ett svar per bruker per undersøkelse — sendes det inn på
-- nytt, oppdateres svaret. Bonusen (lib/tilbakemelding.ts) gis maks én gang:
-- bonus_granted_at settes atomisk der den er null.
create table if not exists feedback_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid,
  tenant_slug text not null,
  survey text not null,
  answers jsonb not null,
  balance_credits_at_submit numeric,
  bonus_credits numeric,
  bonus_granted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, survey)
);

-- Bare service-rollen (ruta). Nye tabeller arver ellers full
-- anon/authenticated-GRANT via ALTER DEFAULT PRIVILEGES (RLS-sveipet 2026).
alter table feedback_responses enable row level security;
revoke all on feedback_responses from anon, authenticated;
