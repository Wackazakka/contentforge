-- ContentForge v2 Phase 1 Schema Migration
-- Created: 2026-05-02
-- Purpose: Core tables for SaaS product (auth, organizations, products, jobs, subscriptions, asset banks)

-- ============================================================================
-- 1. ORGANIZATIONS (Samarbeidingsrom/bedrifter)
-- ============================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  slug VARCHAR UNIQUE NOT NULL,
  owner_id UUID NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RLS: Enable for organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own organizations"
  ON organizations
  FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can create organizations"
  ON organizations
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own organizations"
  ON organizations
  FOR UPDATE
  USING (owner_id = auth.uid());

-- ============================================================================
-- 2. PRODUCTS (Merkevarer/produkt-kategorier per organisasjon)
-- ============================================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  description TEXT,
  category VARCHAR,
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RLS: Enable for products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view products in their organizations"
  ON products
  FOR SELECT
  USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create products in their organizations"
  ON products
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update products in their organizations"
  ON products
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- ============================================================================
-- 3. PRODUCT_PROFILES (Merkevareprofil: logo, farger, fonter)
-- ============================================================================
CREATE TABLE IF NOT EXISTS product_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  logo_url VARCHAR,
  primary_color VARCHAR,
  secondary_color VARCHAR,
  accent_color VARCHAR,
  font_family VARCHAR,
  brand_voice VARCHAR,
  brand_guidelines JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RLS: Enable for product_profiles
ALTER TABLE product_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view product profiles for their products"
  ON product_profiles
  FOR SELECT
  USING (
    product_id IN (
      SELECT id FROM products WHERE organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create product profiles for their products"
  ON product_profiles
  FOR INSERT
  WITH CHECK (
    product_id IN (
      SELECT id FROM products WHERE organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update product profiles for their products"
  ON product_profiles
  FOR UPDATE
  USING (
    product_id IN (
      SELECT id FROM products WHERE organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- 4. PRODUCTION_JOBS (Kampanjer/produksjonskjøringer)
-- ============================================================================
CREATE TABLE IF NOT EXISTS production_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  title VARCHAR NOT NULL,
  description TEXT,
  status VARCHAR DEFAULT 'draft',
  content_type VARCHAR DEFAULT 'mixed',
  video_format VARCHAR,
  ai_parameters JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- RLS: Enable for production_jobs
ALTER TABLE production_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view jobs for their products"
  ON production_jobs
  FOR SELECT
  USING (
    product_id IN (
      SELECT id FROM products WHERE organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create jobs for their products"
  ON production_jobs
  FOR INSERT
  WITH CHECK (
    product_id IN (
      SELECT id FROM products WHERE organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update jobs for their products"
  ON production_jobs
  FOR UPDATE
  USING (
    product_id IN (
      SELECT id FROM products WHERE organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- 5. SUBSCRIPTIONS (Abonnementskontroll per organisasjon)
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  tier VARCHAR NOT NULL DEFAULT 'starter',
  status VARCHAR DEFAULT 'active',
  stripe_subscription_id VARCHAR UNIQUE,
  stripe_customer_id VARCHAR UNIQUE,
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RLS: Enable for subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view subscriptions for their organizations"
  ON subscriptions
  FOR SELECT
  USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update subscriptions for their organizations"
  ON subscriptions
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. ASSET_BANKS (Innholdsbiblioteker per produkt)
-- ============================================================================
CREATE TABLE IF NOT EXISTS asset_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  bank_type VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RLS: Enable for asset_banks
ALTER TABLE asset_banks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view asset banks for their products"
  ON asset_banks
  FOR SELECT
  USING (
    product_id IN (
      SELECT id FROM products WHERE organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create asset banks for their products"
  ON asset_banks
  FOR INSERT
  WITH CHECK (
    product_id IN (
      SELECT id FROM products WHERE organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update asset banks for their products"
  ON asset_banks
  FOR UPDATE
  USING (
    product_id IN (
      SELECT id FROM products WHERE organization_id IN (
        SELECT id FROM organizations WHERE owner_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- Create Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by);
CREATE INDEX IF NOT EXISTS idx_production_jobs_product ON production_jobs(product_id);
CREATE INDEX IF NOT EXISTS idx_production_jobs_status ON production_jobs(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_asset_banks_product ON asset_banks(product_id);

-- ============================================================================
-- Grant Permissions
-- ============================================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
