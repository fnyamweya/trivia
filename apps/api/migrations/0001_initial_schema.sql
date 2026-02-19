-- Migration 0001: Initial Schema
-- Creates all core tables for Trivia Tug-of-War

-- ============================================================================
-- Tenants & Users
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    settings TEXT DEFAULT '{}', -- JSON for tenant-specific config
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT, -- NULL for passwordless auth
    role TEXT NOT NULL CHECK (role IN ('admin', 'teacher')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login_at INTEGER,
    UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================================
-- Question Bank
-- ============================================================================

CREATE TABLE IF NOT EXISTS topics (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#6B7280',
    created_at INTEGER NOT NULL,
    UNIQUE (tenant_id, name)
);

CREATE INDEX idx_topics_tenant ON topics(tenant_id);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (tenant_id, name)
);

CREATE INDEX idx_tags_tenant ON tags(tenant_id);

CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    topic_id TEXT REFERENCES topics(id),
    type TEXT NOT NULL CHECK (type IN ('multiple_choice', 'true_false')),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
    text TEXT NOT NULL,
    answers TEXT NOT NULL, -- JSON array of {id, text, isCorrect}
    explanation TEXT,
    time_limit_ms INTEGER NOT NULL DEFAULT 30000,
    points INTEGER NOT NULL DEFAULT 10,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_questions_tenant ON questions(tenant_id);
CREATE INDEX idx_questions_topic ON questions(topic_id);
CREATE INDEX idx_questions_status ON questions(tenant_id, status);
CREATE INDEX idx_questions_difficulty ON questions(tenant_id, difficulty);
CREATE INDEX idx_questions_search ON questions(tenant_id, status, difficulty, updated_at);

CREATE TABLE IF NOT EXISTS question_tags (
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (question_id, tag_id)
);

CREATE INDEX idx_question_tags_tag ON question_tags(tag_id);

-- ============================================================================
-- Rulesets
-- ============================================================================

CREATE TABLE IF NOT EXISTS rulesets (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    description TEXT,
    question_count INTEGER NOT NULL DEFAULT 10,
    time_limit_ms_per_question INTEGER NOT NULL DEFAULT 30000,
    points_per_correct INTEGER NOT NULL DEFAULT 10,
    points_for_speed INTEGER NOT NULL DEFAULT 1, -- boolean as int
    streak_bonus INTEGER NOT NULL DEFAULT 1,
    streak_threshold INTEGER NOT NULL DEFAULT 3,
    streak_multiplier REAL NOT NULL DEFAULT 1.5,
    allow_latejoin INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_rulesets_tenant ON rulesets(tenant_id);

-- ============================================================================
-- Sessions & Teams
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    teacher_id TEXT NOT NULL REFERENCES users(id),
    ruleset_id TEXT REFERENCES rulesets(id),
    name TEXT NOT NULL,
    join_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'ready', 'active_question', 'reveal', 'paused', 'completed', 'cancelled')),
    current_question_index INTEGER NOT NULL DEFAULT -1,
    total_questions INTEGER NOT NULL DEFAULT 0,
    final_position INTEGER, -- Tug position at end
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    ended_at INTEGER
);

CREATE UNIQUE INDEX idx_sessions_join_code ON sessions(join_code) WHERE status NOT IN ('completed', 'cancelled');
CREATE INDEX idx_sessions_tenant ON sessions(tenant_id, status, created_at);
CREATE INDEX idx_sessions_teacher ON sessions(teacher_id, created_at);

CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_teams_session ON teams(session_id);

CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    team_id TEXT REFERENCES teams(id),
    nickname TEXT NOT NULL,
    connection_status TEXT NOT NULL DEFAULT 'connected' CHECK (connection_status IN ('connected', 'disconnected', 'kicked')),
    joined_at INTEGER NOT NULL,
    last_seen_at INTEGER,
    UNIQUE (session_id, nickname)
);

CREATE INDEX idx_students_session ON students(session_id);
CREATE INDEX idx_students_team ON students(team_id);

-- ============================================================================
-- Game State (Question Instances & Events)
-- ============================================================================

-- Snapshot of question at ask-time (immutable)
CREATE TABLE IF NOT EXISTS question_instances (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id),
    index_num INTEGER NOT NULL, -- 0-based question number in session
    text TEXT NOT NULL,
    answers TEXT NOT NULL, -- JSON array
    correct_answer_id TEXT NOT NULL,
    time_limit_ms INTEGER NOT NULL,
    points INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER
);

CREATE INDEX idx_question_instances_session ON question_instances(session_id, index_num);

-- Individual answer attempts (immutable event)
CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    question_instance_id TEXT NOT NULL REFERENCES question_instances(id),
    student_id TEXT NOT NULL REFERENCES students(id),
    team_id TEXT NOT NULL REFERENCES teams(id),
    answer_id TEXT NOT NULL,
    is_correct INTEGER NOT NULL, -- boolean
    response_time_ms INTEGER NOT NULL,
    points_awarded INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_attempts_session ON attempts(session_id, question_instance_id);
CREATE INDEX idx_attempts_student ON attempts(student_id);
CREATE INDEX idx_attempts_team ON attempts(team_id, created_at);

-- Position changes on the tug (immutable event)
CREATE TABLE IF NOT EXISTS strength_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    team_id TEXT NOT NULL REFERENCES teams(id),
    delta INTEGER NOT NULL, -- Position change
    reason TEXT NOT NULL CHECK (reason IN ('correct_answer', 'streak_bonus', 'manual_adjust')),
    new_position INTEGER NOT NULL,
    triggered_by TEXT, -- student_id or teacher user_id
    occurred_at INTEGER NOT NULL
);

CREATE INDEX idx_strength_events_session ON strength_events(session_id, occurred_at);

-- ============================================================================
-- Idempotency & Audit
-- ============================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    UNIQUE (key, tenant_id)
);

CREATE INDEX idx_idempotency_keys_expires ON idempotency_keys(expires_at);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details TEXT, -- JSON
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_audit_log_tenant ON audit_log(tenant_id, created_at);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- ============================================================================
-- Analytics (optional, for Queue consumer)
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload TEXT NOT NULL, -- JSON
    timestamp INTEGER NOT NULL,
    processed_at INTEGER NOT NULL
);

CREATE INDEX idx_analytics_events_type ON analytics_events(type, timestamp);
