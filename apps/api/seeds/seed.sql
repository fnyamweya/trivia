-- Seed data for local development
-- Run with: pnpm -C apps/api db:seed

-- Default tenant
INSERT OR IGNORE INTO tenants (id, name, slug, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Demo School',
    'demo-school',
    strftime('%s', 'now') * 1000,
    strftime('%s', 'now') * 1000
);

-- Demo teacher (password: "password123" - bcrypt hash)
INSERT OR IGNORE INTO users (id, tenant_id, email, display_name, password_hash, role, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'teacher@demo.school',
    'Demo Teacher',
    '$2b$10$/KOtt49Cx3hrvZKrbpqyB.opTodrsqIWfcTuUXXh7ta0cIhTCJShW',
    'teacher',
    strftime('%s', 'now') * 1000,
    strftime('%s', 'now') * 1000
);

-- Demo admin (password: "password123" - bcrypt hash)
INSERT OR IGNORE INTO users (id, tenant_id, email, display_name, password_hash, role, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'admin@demo.school',
    'Demo Admin',
    '$2b$10$/KOtt49Cx3hrvZKrbpqyB.opTodrsqIWfcTuUXXh7ta0cIhTCJShW',
    'admin',
    strftime('%s', 'now') * 1000,
    strftime('%s', 'now') * 1000
);

-- Ensure teacher credentials are always corrected on reseed
UPDATE users
SET
    password_hash = '$2b$10$/KOtt49Cx3hrvZKrbpqyB.opTodrsqIWfcTuUXXh7ta0cIhTCJShW',
    display_name = 'Demo Teacher',
    role = 'teacher',
    updated_at = strftime('%s', 'now') * 1000
WHERE email = 'teacher@demo.school';

UPDATE users
SET
    password_hash = '$2b$10$/KOtt49Cx3hrvZKrbpqyB.opTodrsqIWfcTuUXXh7ta0cIhTCJShW',
    display_name = 'Demo Admin',
    role = 'admin',
    updated_at = strftime('%s', 'now') * 1000
WHERE email = 'admin@demo.school';

-- Sample topics
INSERT OR IGNORE INTO topics (id, tenant_id, name, description, color, created_at)
VALUES 
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Mathematics', 'Math questions', '#EF4444', strftime('%s', 'now') * 1000),
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Science', 'Science questions', '#3B82F6', strftime('%s', 'now') * 1000),
    ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'History', 'History questions', '#22C55E', strftime('%s', 'now') * 1000),
    ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'Geography', 'Geography questions', '#F59E0B', strftime('%s', 'now') * 1000),
    ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'Home Science', 'Food, nutrition, and daily life science', '#A855F7', strftime('%s', 'now') * 1000),
    ('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000001', 'English', 'Language and literacy questions', '#14B8A6', strftime('%s', 'now') * 1000);

-- Sample tags
INSERT OR IGNORE INTO tags (id, tenant_id, name, created_at)
VALUES 
    ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'algebra', strftime('%s', 'now') * 1000),
    ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'geometry', strftime('%s', 'now') * 1000),
    ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'physics', strftime('%s', 'now') * 1000),
    ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000001', 'biology', strftime('%s', 'now') * 1000),
    ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000001', 'world-war-2', strftime('%s', 'now') * 1000);

-- Sample questions
INSERT OR IGNORE INTO questions (id, tenant_id, topic_id, type, difficulty, status, text, answers, explanation, time_limit_ms, points, created_by, created_at, updated_at)
VALUES 
    (
        '00000000-0000-0000-0000-000000000100',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000010',
        'multiple_choice',
        'easy',
        'published',
        'What is 2 + 2?',
        '[{"id":"a","text":"3","isCorrect":false},{"id":"b","text":"4","isCorrect":true},{"id":"c","text":"5","isCorrect":false},{"id":"d","text":"22","isCorrect":false}]',
        'Basic addition: 2 + 2 = 4',
        30000,
        10,
        '00000000-0000-0000-0000-000000000002',
        strftime('%s', 'now') * 1000,
        strftime('%s', 'now') * 1000
    ),
    (
        '00000000-0000-0000-0000-000000000101',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000010',
        'multiple_choice',
        'medium',
        'published',
        'What is the square root of 144?',
        '[{"id":"a","text":"10","isCorrect":false},{"id":"b","text":"11","isCorrect":false},{"id":"c","text":"12","isCorrect":true},{"id":"d","text":"14","isCorrect":false}]',
        '12 × 12 = 144',
        30000,
        15,
        '00000000-0000-0000-0000-000000000002',
        strftime('%s', 'now') * 1000,
        strftime('%s', 'now') * 1000
    ),
    (
        '00000000-0000-0000-0000-000000000102',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        'true_false',
        'easy',
        'published',
        'Water boils at 100°C at sea level.',
        '[{"id":"true","text":"True","isCorrect":true},{"id":"false","text":"False","isCorrect":false}]',
        'At standard atmospheric pressure (sea level), water boils at 100°C (212°F).',
        20000,
        10,
        '00000000-0000-0000-0000-000000000002',
        strftime('%s', 'now') * 1000,
        strftime('%s', 'now') * 1000
    ),
    (
        '00000000-0000-0000-0000-000000000103',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        'multiple_choice',
        'medium',
        'published',
        'What planet is known as the Red Planet?',
        '[{"id":"a","text":"Venus","isCorrect":false},{"id":"b","text":"Mars","isCorrect":true},{"id":"c","text":"Jupiter","isCorrect":false},{"id":"d","text":"Saturn","isCorrect":false}]',
        'Mars appears red due to iron oxide (rust) on its surface.',
        30000,
        15,
        '00000000-0000-0000-0000-000000000002',
        strftime('%s', 'now') * 1000,
        strftime('%s', 'now') * 1000
    ),
    (
        '00000000-0000-0000-0000-000000000104',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000012',
        'multiple_choice',
        'hard',
        'published',
        'In what year did World War II end?',
        '[{"id":"a","text":"1943","isCorrect":false},{"id":"b","text":"1944","isCorrect":false},{"id":"c","text":"1945","isCorrect":true},{"id":"d","text":"1946","isCorrect":false}]',
        'WWII ended in 1945 with the surrender of Japan on September 2.',
        25000,
        20,
        '00000000-0000-0000-0000-000000000002',
        strftime('%s', 'now') * 1000,
        strftime('%s', 'now') * 1000
    ),
    (
        '00000000-0000-0000-0000-000000000105',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000013',
        'multiple_choice',
        'easy',
        'published',
        'What is the capital of France?',
        '[{"id":"a","text":"London","isCorrect":false},{"id":"b","text":"Berlin","isCorrect":false},{"id":"c","text":"Paris","isCorrect":true},{"id":"d","text":"Rome","isCorrect":false}]',
        'Paris has been the capital of France since the 10th century.',
        30000,
        10,
        '00000000-0000-0000-0000-000000000002',
        strftime('%s', 'now') * 1000,
        strftime('%s', 'now') * 1000
    ),
    (
        '00000000-0000-0000-0000-000000000106',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000010',
        'multiple_choice',
        'easy',
        'published',
        'What is 9 × 7?',
        '[{"id":"a","text":"56","isCorrect":false},{"id":"b","text":"63","isCorrect":true},{"id":"c","text":"72","isCorrect":false},{"id":"d","text":"79","isCorrect":false}]',
        '9 multiplied by 7 equals 63.',
        25000,
        10,
        '00000000-0000-0000-0000-000000000002',
        strftime('%s', 'now') * 1000,
        strftime('%s', 'now') * 1000
    ),
    (
        '00000000-0000-0000-0000-000000000107',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        'true_false',
        'medium',
        'published',
        'The human body has 206 bones.',
        '[{"id":"true","text":"True","isCorrect":true},{"id":"false","text":"False","isCorrect":false}]',
        'An adult human skeleton has 206 bones.',
        20000,
        10,
        '00000000-0000-0000-0000-000000000002',
        strftime('%s', 'now') * 1000,
        strftime('%s', 'now') * 1000
    ),
    (
        '00000000-0000-0000-0000-000000000108',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000012',
        'multiple_choice',
        'medium',
        'published',
        'Who was the first President of the United States?',
        '[{"id":"a","text":"Thomas Jefferson","isCorrect":false},{"id":"b","text":"George Washington","isCorrect":true},{"id":"c","text":"John Adams","isCorrect":false},{"id":"d","text":"James Madison","isCorrect":false}]',
        'George Washington served as the first U.S. President.',
        30000,
        15,
        '00000000-0000-0000-0000-000000000002',
        strftime('%s', 'now') * 1000,
        strftime('%s', 'now') * 1000
    ),
    (
        '00000000-0000-0000-0000-000000000109',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000013',
        'multiple_choice',
        'medium',
        'published',
        'Which is the largest ocean on Earth?',
        '[{"id":"a","text":"Atlantic Ocean","isCorrect":false},{"id":"b","text":"Indian Ocean","isCorrect":false},{"id":"c","text":"Arctic Ocean","isCorrect":false},{"id":"d","text":"Pacific Ocean","isCorrect":true}]',
        'The Pacific Ocean is the largest and deepest ocean basin.',
        30000,
        15,
        '00000000-0000-0000-0000-000000000002',
        strftime('%s', 'now') * 1000,
        strftime('%s', 'now') * 1000
    ),
    (
        '00000000-0000-0000-0000-000000000110',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000010',
        'multiple_choice',
        'hard',
        'published',
        'What is the value of pi to two decimal places?',
        '[{"id":"a","text":"3.12","isCorrect":false},{"id":"b","text":"3.14","isCorrect":true},{"id":"c","text":"3.16","isCorrect":false},{"id":"d","text":"3.18","isCorrect":false}]',
        'Pi rounded to two decimal places is 3.14.',
        25000,
        20,
        '00000000-0000-0000-0000-000000000002',
        strftime('%s', 'now') * 1000,
        strftime('%s', 'now') * 1000
    ),
    (
        '00000000-0000-0000-0000-000000000111',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        'multiple_choice',
        'easy',
        'published',
        'Which gas do plants absorb from the atmosphere?',
        '[{"id":"a","text":"Oxygen","isCorrect":false},{"id":"b","text":"Nitrogen","isCorrect":false},{"id":"c","text":"Carbon Dioxide","isCorrect":true},{"id":"d","text":"Hydrogen","isCorrect":false}]',
        'Plants absorb carbon dioxide during photosynthesis.',
        25000,
        10,
        '00000000-0000-0000-0000-000000000002',
        strftime('%s', 'now') * 1000,
        strftime('%s', 'now') * 1000
    );

-- Link questions to tags
INSERT OR IGNORE INTO question_tags (question_id, tag_id)
VALUES 
    ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000020'),
    ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000020'),
    ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000022'),
    ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000022'),
    ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000024'),
    ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000020'),
    ('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000023'),
    ('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-000000000024'),
    ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000023');

-- Default ruleset
INSERT OR IGNORE INTO rulesets (id, tenant_id, name, description, question_count, time_limit_ms_per_question, points_per_correct, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000030',
    '00000000-0000-0000-0000-000000000001',
    'Standard Game',
    'Default game settings with 10 questions',
    10,
    30000,
    10,
    strftime('%s', 'now') * 1000,
    strftime('%s', 'now') * 1000
),
(
    '00000000-0000-0000-0000-000000000031',
    '00000000-0000-0000-0000-000000000001',
    'Beginner Level',
    'Friendly mode for new students',
    8,
    35000,
    8,
    strftime('%s', 'now') * 1000,
    strftime('%s', 'now') * 1000
),
(
    '00000000-0000-0000-0000-000000000032',
    '00000000-0000-0000-0000-000000000001',
    'Advanced Level',
    'Fast-paced challenge mode',
    12,
    20000,
    15,
    strftime('%s', 'now') * 1000,
    strftime('%s', 'now') * 1000
);

-- Seeded game sessions with join codes
INSERT OR IGNORE INTO sessions (id, tenant_id, teacher_id, ruleset_id, name, join_code, status, current_question_index, total_questions, created_at)
VALUES
        (
            '00000000-0000-0000-0000-000000000200',
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002',
            '00000000-0000-0000-0000-000000000030',
            'Math Warmup',
            'MATH01',
            'lobby',
            -1,
            10,
            strftime('%s', 'now') * 1000
        ),
        (
            '00000000-0000-0000-0000-000000000201',
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002',
            '00000000-0000-0000-0000-000000000030',
            'Science Sprint',
            'SCI123',
            'lobby',
            -1,
            10,
            strftime('%s', 'now') * 1000
        );

-- Teams for seeded sessions
INSERT OR IGNORE INTO teams (id, session_id, name, color, created_at)
VALUES
        ('00000000-0000-0000-0000-000000000210', '00000000-0000-0000-0000-000000000200', 'Red Rockets', '#EF4444', strftime('%s', 'now') * 1000),
        ('00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000200', 'Blue Blazers', '#3B82F6', strftime('%s', 'now') * 1000),
        ('00000000-0000-0000-0000-000000000212', '00000000-0000-0000-0000-000000000201', 'Red Rockets', '#EF4444', strftime('%s', 'now') * 1000),
        ('00000000-0000-0000-0000-000000000213', '00000000-0000-0000-0000-000000000201', 'Blue Blazers', '#3B82F6', strftime('%s', 'now') * 1000);

-- Seed a couple of students in the first session
INSERT OR IGNORE INTO students (id, session_id, team_id, nickname, connection_status, joined_at, last_seen_at)
VALUES
        ('00000000-0000-0000-0000-000000000220', '00000000-0000-0000-0000-000000000200', '00000000-0000-0000-0000-000000000210', 'alice', 'connected', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
        ('00000000-0000-0000-0000-000000000221', '00000000-0000-0000-0000-000000000200', '00000000-0000-0000-0000-000000000211', 'bob', 'connected', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);
