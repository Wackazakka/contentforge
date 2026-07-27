-- White-label tenants (kjøres manuelt i Supabase SQL editor, prosjekt contentforge-prod wxnevywhtmovangkobal)
-- RLS bevisst AV (husmønster: «service»-nøkkelen er anon).

CREATE TABLE IF NOT EXISTS tenants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             VARCHAR UNIQUE NOT NULL,           -- subdomene-etikett: 'centerforge' (root), 'voicebank', ...
  parent_tenant_id UUID REFERENCES tenants(id),       -- NULL = root (N-nivå-tre)
  name             VARCHAR NOT NULL,                  -- internt navn
  app_name         VARCHAR NOT NULL,                  -- vist merkenavn/wordmark
  logo_url         VARCHAR,                           -- R2-URL; NULL = standard CenterForge-merke
  icon_url         VARCHAR,                           -- favicon; NULL = /icon.svg
  colors           JSONB NOT NULL DEFAULT '{}',       -- CSS-token-overrides, f.eks. {"--ember":"#0A5CFF","--ember-deep":"#0848C8","--ember-tint-bg":"#E3ECFF","--ember-tint-border":"#B9CDF2"}
  custom_domain    VARCHAR UNIQUE,                    -- fremtid (v1: NULL)
  billing_mode     VARCHAR NOT NULL DEFAULT 'direct', -- 'direct' (Stripe/kreditter) | 'invoice' (faktureres via partner)
  tier             VARCHAR,                           -- prising-krok
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO tenants (slug, name, app_name, billing_mode)
VALUES ('centerforge', 'CenterForge (root)', 'CenterForge', 'direct')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE organizations SET tenant_id = (SELECT id FROM tenants WHERE slug = 'centerforge')
  WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_tenant ON organizations(tenant_id);

-- Seed VoiceBank (fyll inn logo-URL + farger når materiellet er klart):
-- INSERT INTO tenants (slug, parent_tenant_id, name, app_name, logo_url, colors, billing_mode)
-- VALUES ('voicebank', (SELECT id FROM tenants WHERE slug='centerforge'),
--         'VoiceBank AS', 'VoiceBank',
--         'https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev/tenants/voicebank/logo.png',
--         '{"--ember":"#<primær>","--ember-deep":"#<primær-mørk>","--ember-tint-bg":"#<lys-tint>","--ember-tint-border":"#<tint-kant>"}',
--         'invoice');
