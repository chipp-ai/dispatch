-- Migration: 007_add_organization_to_whitelabel
-- Description: Add organization_id to whitelabel_tenants table
-- Created: 2024-12-21

-- Add organization_id column to link tenants to organizations
ALTER TABLE app.whitelabel_tenants
ADD COLUMN organization_id UUID REFERENCES app.organizations(id) ON DELETE SET NULL;

-- Create index for organization lookup
CREATE INDEX idx_whitelabel_tenants_organization ON app.whitelabel_tenants(organization_id);

-- Add unique constraint - one tenant per organization
ALTER TABLE app.whitelabel_tenants
ADD CONSTRAINT unique_org_tenant UNIQUE (organization_id);
