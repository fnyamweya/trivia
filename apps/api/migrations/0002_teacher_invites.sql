-- Migration 0002: Teacher Invites

CREATE TABLE IF NOT EXISTS teacher_invites (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    invited_by TEXT NOT NULL REFERENCES users(id),
    email TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher', 'admin')),
    token_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    expires_at INTEGER NOT NULL,
    accepted_at INTEGER,
    accepted_user_id TEXT REFERENCES users(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (tenant_id, email, status)
);

CREATE INDEX IF NOT EXISTS idx_teacher_invites_tenant_status
    ON teacher_invites(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teacher_invites_expires
    ON teacher_invites(expires_at, status);
