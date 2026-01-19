-- Enable pgcrypto for hashing/encryption if needed in DB, though we prefer App level
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Organizations Table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Seed Default Org
INSERT INTO organizations (name) 
SELECT 'Default Organization' 
WHERE NOT EXISTS (SELECT 1 FROM organizations);

-- 3. Update Users
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

UPDATE users 
SET organization_id = (SELECT id FROM organizations WHERE name = 'Default Organization' LIMIT 1) 
WHERE organization_id IS NULL;

-- 4. Update Channels
ALTER TABLE channels ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

UPDATE channels 
SET organization_id = (SELECT id FROM organizations WHERE name = 'Default Organization' LIMIT 1) 
WHERE organization_id IS NULL;

-- 5. Add Encryption Columns
-- We store Hash for fast lookup (auth) and Encrypted for display (admin)
ALTER TABLE channels ADD COLUMN IF NOT EXISTS obs_token_hash TEXT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS obs_token_encrypted TEXT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS obs_token_iv TEXT; -- Store IV for GCM

ALTER TABLE channels ADD COLUMN IF NOT EXISTS loop_token_hash TEXT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS loop_token_encrypted TEXT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS loop_token_iv TEXT;

-- Indexes for lookup
CREATE INDEX IF NOT EXISTS idx_obs_token_hash ON channels(obs_token_hash);
CREATE INDEX IF NOT EXISTS idx_loop_token_hash ON channels(loop_token_hash);
CREATE INDEX IF NOT EXISTS idx_channels_org ON channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
