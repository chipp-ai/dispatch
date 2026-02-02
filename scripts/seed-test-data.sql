-- Seed Test Data for Streaming Persistence Tests
-- Run this script to set up test fixtures for the CI test script
--
-- Usage:
--   psql $PG_DATABASE_URL -f scripts/seed-test-data.sql

-- Test Organization
INSERT INTO app.organizations (id, name, subscription_tier, credits_balance)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Test Organization',
  'FREE',
  10000
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  credits_balance = EXCLUDED.credits_balance;

-- Test User
INSERT INTO app.users (id, email, name, organization_id, role, email_verified)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'test-developer@example.com',
  'Test Developer',
  '11111111-1111-1111-1111-111111111111',
  'owner',
  true
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name;

-- Test Application (with getCurrentTime tool capability)
INSERT INTO app.applications (
  id,
  name,
  app_name_id,
  developer_id,
  organization_id,
  system_prompt,
  model,
  temperature,
  is_active,
  is_deleted,
  capabilities
)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'Test Chat App',
  'test-chat-app',
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'You are a helpful assistant with access to tools. When asked about the time, use the getCurrentTime tool.',
  'gpt-4o',
  0.7,
  true,
  false,
  '{"tools": ["getCurrentTime", "searchWeb"]}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  app_name_id = EXCLUDED.app_name_id,
  system_prompt = EXCLUDED.system_prompt,
  capabilities = EXCLUDED.capabilities,
  is_active = true,
  is_deleted = false;

-- Test Consumer
INSERT INTO app.consumers (
  id,
  application_id,
  email,
  name,
  identifier,
  email_verified,
  credits,
  subscription_active,
  mode,
  is_deleted
)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  '00000000-0000-0000-0000-000000000003',
  'test-consumer@example.com',
  'Test Consumer',
  'test-consumer@example.com',
  true,
  10000,
  false,
  'LIVE',
  false
)
ON CONFLICT (id) DO UPDATE SET
  credits = 10000,
  is_deleted = false;

-- Test Consumer Session (valid for 30 days)
INSERT INTO app.consumer_sessions (
  id,
  consumer_id,
  application_id,
  expires_at
)
VALUES (
  '00000000-0000-0000-0000-000000000005',
  '44444444-4444-4444-4444-444444444444',
  '00000000-0000-0000-0000-000000000003',
  NOW() + INTERVAL '30 days'
)
ON CONFLICT (id) DO UPDATE SET
  expires_at = NOW() + INTERVAL '30 days';

-- Verify data was created
SELECT 'Seed data created successfully' AS status;

SELECT
  'Organization' AS entity,
  o.id,
  o.name
FROM app.organizations o
WHERE o.id = '11111111-1111-1111-1111-111111111111'

UNION ALL

SELECT
  'Application' AS entity,
  a.id,
  a.app_name_id
FROM app.applications a
WHERE a.id = '00000000-0000-0000-0000-000000000003'

UNION ALL

SELECT
  'Consumer' AS entity,
  c.id,
  c.email
FROM app.consumers c
WHERE c.id = '44444444-4444-4444-4444-444444444444'

UNION ALL

SELECT
  'Session' AS entity,
  s.id,
  s.consumer_id::text
FROM app.consumer_sessions s
WHERE s.id = '00000000-0000-0000-0000-000000000005';
