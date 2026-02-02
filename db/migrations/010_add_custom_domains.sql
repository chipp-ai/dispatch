-- Custom Domains table
-- Used by Cloudflare for SaaS to route custom domains

CREATE TABLE IF NOT EXISTS app.custom_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  hostname VARCHAR(255) UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL,  -- 'chat', 'dashboard', 'api'

  -- Foreign keys (one will be set based on type)
  app_id UUID REFERENCES app.applications(id) ON DELETE CASCADE,
  tenant_id UUID,  -- References whitelabel tenant (if that table exists)
  organization_id UUID REFERENCES app.organizations(id) ON DELETE CASCADE,

  -- Cloudflare tracking
  cloudflare_id VARCHAR(255),
  ssl_status VARCHAR(50) DEFAULT 'pending',  -- pending, active, expired, failed
  dcv_token TEXT,

  -- Brand styles cache (for fast KV lookup)
  brand_styles JSONB,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_type CHECK (type IN ('chat', 'dashboard', 'api')),
  CONSTRAINT valid_ssl_status CHECK (ssl_status IN ('pending', 'active', 'expired', 'failed'))
);

-- Ensure organization_id column exists (in case table was created without it)
ALTER TABLE app.custom_domains ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES app.organizations(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_custom_domains_hostname ON app.custom_domains(hostname);
CREATE INDEX IF NOT EXISTS idx_custom_domains_app ON app.custom_domains(app_id) WHERE app_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_custom_domains_tenant ON app.custom_domains(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_custom_domains_org ON app.custom_domains(organization_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_ssl_status ON app.custom_domains(ssl_status);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_custom_domains_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER custom_domains_updated_at
  BEFORE UPDATE ON app.custom_domains
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_domains_updated_at();
