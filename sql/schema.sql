-- =====================================================
-- Production Database Schema for Livestream Platform
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table with secure password hashing
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'VIEWER' CHECK (role IN ('ADMIN', 'OPERATOR', 'VIEWER')),
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Channels configuration
CREATE TABLE IF NOT EXISTS channels (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    
    -- Authentication tokens (plain text, for backwards compatibility)
    obs_token TEXT NOT NULL,
    loop_token TEXT NOT NULL,
    
    -- Encrypted tokens (AES-GCM)
    obs_token_encrypted TEXT,
    obs_token_iv TEXT,
    loop_token_encrypted TEXT,
    loop_token_iv TEXT,
    
    -- Loop configuration
    loop_source_file TEXT DEFAULT '/app/media/default.mp4',
    loop_enabled BOOLEAN DEFAULT TRUE,
    
    -- State
    enabled BOOLEAN DEFAULT TRUE,
    current_active_source TEXT DEFAULT 'NONE' CHECK (current_active_source IN ('OBS', 'LOOP', 'NONE')),
    last_failover_at TIMESTAMP,
    failover_count INT DEFAULT 0,
    
    -- Failover settings
    obs_override_enabled BOOLEAN DEFAULT TRUE,
    auto_restart_loop BOOLEAN DEFAULT TRUE,
    failover_timeout_seconds INT DEFAULT 5,
    stability_window INT DEFAULT 3,
    
    -- Stream encoding settings (for YouTube compatibility)
    keyframe_interval INT DEFAULT 2,      -- seconds (YouTube requires 2)
    video_bitrate INT DEFAULT 0,          -- kbps (0 = auto 4500k)
    audio_bitrate INT DEFAULT 128,        -- kbps
    output_resolution TEXT DEFAULT '',    -- e.g. "1920x1080" or empty for source
    
    -- Organization (for multi-tenant)
    organization_id UUID,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Output destinations per channel
CREATE TABLE IF NOT EXISTS destinations (
    id SERIAL PRIMARY KEY,
    channel_id INT REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rtmp_url TEXT NOT NULL,
    stream_key TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    
    -- Health status
    status TEXT DEFAULT 'UNKNOWN' CHECK (status IN ('CONNECTED', 'DISCONNECTED', 'ERROR', 'UNKNOWN')),
    last_error TEXT,
    retry_count INT DEFAULT 0,
    last_connected_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Health metrics history
CREATE TABLE IF NOT EXISTS health_metrics (
    id SERIAL PRIMARY KEY,
    channel_id INT REFERENCES channels(id) ON DELETE CASCADE,
    recorded_at TIMESTAMP DEFAULT NOW(),
    
    -- Ingest health
    obs_active BOOLEAN DEFAULT FALSE,
    loop_active BOOLEAN DEFAULT FALSE,
    active_source TEXT,
    
    -- Stream metrics
    bitrate_kbps INT,
    fps DECIMAL(5,2),
    frames_sent BIGINT,
    
    -- System metrics
    cpu_percent DECIMAL(5,2),
    memory_mb INT
);

-- Audit log for all actions
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- System configuration key-value store
CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);
CREATE INDEX IF NOT EXISTS idx_destinations_channel ON destinations(channel_id);
CREATE INDEX IF NOT EXISTS idx_health_metrics_channel_time ON health_metrics(channel_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Default admin user (password: admin123)
-- In production, change this immediately after first login
INSERT INTO users (email, password_hash, name, role) 
VALUES (
    'admin@livestream.local',
    '$2a$10$K7L1OJ45/4Y2nIvhRVpCe.FSmhDdWoXehVzJptJ/op0lSsvqNu/X6',
    'System Administrator',
    'ADMIN'
) ON CONFLICT (email) DO NOTHING;

-- Default channels
INSERT INTO channels (name, display_name, obs_token, loop_token, loop_source_file) VALUES
    ('waheguru', 'Waheguru Channel', 'obs_waheguru_2024_secure', 'loop_waheguru_2024_secure', '/app/media/waheguru.mp4'),
    ('krishna', 'Krishna Channel', 'obs_krishna_2024_secure', 'loop_krishna_2024_secure', '/app/media/krishna.mp4'),
    ('hanuman', 'Hanuman Channel', 'obs_hanuman_2024_secure', 'loop_hanuman_2024_secure', '/app/media/hanuman.mp4'),
    ('durga', 'Durga Channel', 'obs_durga_2024_secure', 'loop_durga_2024_secure', '/app/media/durga.mp4')
ON CONFLICT (name) DO NOTHING;

-- Default system config
INSERT INTO system_config (key, value, description) VALUES
    ('failover', '{"enabled": true, "timeout_seconds": 5, "stability_window": 3, "anti_flap_cooldown": 30}', 'Failover configuration'),
    ('health_check', '{"interval_seconds": 3, "timeout_seconds": 2}', 'Health check intervals'),
    ('resources', '{"loop_container_memory_mb": 512, "loop_container_cpu": 0.5}', 'Container resource limits')
ON CONFLICT (key) DO NOTHING;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_channels_updated_at ON channels;
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_destinations_updated_at ON destinations;
CREATE TRIGGER update_destinations_updated_at BEFORE UPDATE ON destinations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
