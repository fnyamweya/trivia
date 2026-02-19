/**
 * Session Lifecycle Routes
 */

import { Hono } from 'hono';
import {
  createSessionSchema,
  setTeamsSchema,
  rulesetSchema,
  kickPlayerSchema,
  DEFAULT_TEAM_COLORS,
  DEFAULT_TEAM_NAMES,
  MAX_PLAYERS_PER_SESSION,
  type Session,
  type Team,
  type Student,
  type CreateSessionInput,
  type SetTeamsInput,
  type RulesetInput,
} from '@trivia/shared';
import type { Env, Variables } from '../types/env.js';
import { requireAuth, requireTenant, requireRole } from '../auth/jwt.js';
import { queryAll, queryOne, execute, generateUniqueJoinCode } from '../db/helpers.js';
import { idempotencyMiddleware } from '../db/idempotency.js';
import { ApiError } from '../observability/error-handler.js';

export const sessionRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

interface SessionRow {
  id: string;
  tenant_id: string;
  teacher_id: string;
  ruleset_id: string | null;
  name: string;
  join_code: string;
  status: string;
  current_question_index: number;
  total_questions: number;
  final_position: number | null;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
}

interface TeamRow {
  id: string;
  session_id: string;
  name: string;
  color: string;
  created_at: number;
}

interface StudentRow {
  id: string;
  session_id: string;
  team_id: string | null;
  nickname: string;
  connection_status: string;
  joined_at: number;
  last_seen_at: number | null;
}

function rowToSession(row: SessionRow, teams: Team[] = []): Session {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    teacherId: row.teacher_id,
    joinCode: row.join_code,
    name: row.name,
    status: row.status as Session['status'],
    rulesetId: row.ruleset_id ?? undefined,
    teams,
    currentQuestionIndex: row.current_question_index,
    totalQuestions: row.total_questions,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
  };
}

/**
 * POST /v1/sessions
 * Create a new game session
 */
sessionRoutes.post('/', requireAuth(['teacher', 'admin']), idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const user = requireRole(c, 'teacher', 'admin');
  const body = await c.req.json();
  const input = createSessionSchema.parse(body) as CreateSessionInput;

  const sessionId = crypto.randomUUID();
  const joinCode = await generateUniqueJoinCode(c.env.DB);
  const now = Date.now();

  await execute(
    c.env.DB,
    `INSERT INTO sessions (id, tenant_id, teacher_id, ruleset_id, name, join_code, status, current_question_index, total_questions, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'lobby', -1, 0, ?)`,
    [sessionId, tenantId, user.id, input.rulesetId ?? null, input.name, joinCode, now]
  );

  // Create default teams
  const teamStmts = DEFAULT_TEAM_NAMES.slice(0, 2).map((name, i) =>
    c.env.DB.prepare(
      `INSERT INTO teams (id, session_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), sessionId, name, DEFAULT_TEAM_COLORS[i], now)
  );
  await c.env.DB.batch(teamStmts);

  // Fetch created session with teams
  const session = await queryOne<SessionRow>(
    c.env.DB,
    `SELECT * FROM sessions WHERE id = ?`,
    [sessionId]
  );

  const teamRows = await queryAll<TeamRow>(
    c.env.DB,
    `SELECT * FROM teams WHERE session_id = ?`,
    [sessionId]
  );

  const teams: Team[] = teamRows.map((t, i) => ({
    id: t.id,
    sessionId: t.session_id,
    name: t.name,
    color: t.color,
    side: i === 0 ? 'left' : 'right',
    score: 0,
    members: [],
  }));

  return c.json(
    {
      success: true,
      data: rowToSession(session!, teams),
      requestId: c.get('requestId'),
    },
    201
  );
});

/**
 * GET /v1/sessions/:id
 * Get session details
 */
sessionRoutes.get('/:id', requireAuth(['teacher', 'admin', 'student']), async (c) => {
  const user = c.get('user')!;
  const sessionId = c.req.param('id');

  // Students can only access their own session
  if (user.role === 'student' && user.sessionId !== sessionId) {
    throw ApiError.forbidden('Cannot access this session');
  }

  const session = await queryOne<SessionRow>(
    c.env.DB,
    user.role === 'student'
      ? `SELECT * FROM sessions WHERE id = ?`
      : `SELECT * FROM sessions WHERE id = ? AND tenant_id = ?`,
    user.role === 'student' ? [sessionId] : [sessionId, user.tenantId]
  );

  if (!session) {
    throw ApiError.notFound('Session');
  }

  // Fetch teams and members
  const teamRows = await queryAll<TeamRow>(
    c.env.DB,
    `SELECT * FROM teams WHERE session_id = ?`,
    [sessionId]
  );

  const studentRows = await queryAll<StudentRow>(
    c.env.DB,
    `SELECT * FROM students WHERE session_id = ? AND connection_status != 'kicked'`,
    [sessionId]
  );

  const teams: Team[] = teamRows.map((t, i) => ({
    id: t.id,
    sessionId: t.session_id,
    name: t.name,
    color: t.color,
    side: i === 0 ? 'left' : 'right' as const,
    score: 0,
    members: studentRows
      .filter((s) => s.team_id === t.id)
      .map((s) => ({
        id: s.id,
        sessionId: s.session_id,
        nickname: s.nickname,
        joinedAt: s.joined_at,
        connectionStatus: s.connection_status as 'connected' | 'disconnected' | 'kicked',
      })),
  }));

  return c.json({
    success: true,
    data: rowToSession(session, teams),
    requestId: c.get('requestId'),
  });
});

/**
 * POST /v1/sessions/:id/teams
 * Configure teams (auto-balance or manual)
 */
sessionRoutes.post('/:id/teams', requireAuth(['teacher', 'admin']), idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const sessionId = c.req.param('id');
  const body = await c.req.json();
  const input = setTeamsSchema.parse(body) as SetTeamsInput;

  // Verify session exists and is in lobby
  const session = await queryOne<SessionRow>(
    c.env.DB,
    `SELECT * FROM sessions WHERE id = ? AND tenant_id = ? AND status = 'lobby'`,
    [sessionId, tenantId]
  );

  if (!session) {
    throw ApiError.badRequest('Session not found or not in lobby state');
  }

  const now = Date.now();

  // Delete existing teams and reassign students
  await execute(c.env.DB, `UPDATE students SET team_id = NULL WHERE session_id = ?`, [sessionId]);
  await execute(c.env.DB, `DELETE FROM teams WHERE session_id = ?`, [sessionId]);

  // Create new teams
  const teamIds: string[] = [];
  const teamStmts = input.teams.map((team) => {
    const teamId = crypto.randomUUID();
    teamIds.push(teamId);
    return c.env.DB.prepare(
      `INSERT INTO teams (id, session_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)`
    ).bind(teamId, sessionId, team.name, team.color, now);
  });
  await c.env.DB.batch(teamStmts);

  // Assign students to teams
  if (input.autoBalance) {
    // Auto-balance: distribute students evenly
    const students = await queryAll<StudentRow>(
      c.env.DB,
      `SELECT * FROM students WHERE session_id = ? AND connection_status != 'kicked' ORDER BY joined_at`,
      [sessionId]
    );

    const assignments = students.map((s, i) =>
      c.env.DB.prepare(`UPDATE students SET team_id = ? WHERE id = ?`).bind(
        teamIds[i % teamIds.length],
        s.id
      )
    );

    if (assignments.length > 0) {
      await c.env.DB.batch(assignments);
    }
  } else {
    // Manual assignment
    const assignments: D1PreparedStatement[] = [];
    input.teams.forEach((team, i) => {
      if (team.memberIds) {
        team.memberIds.forEach((studentId) => {
          assignments.push(
            c.env.DB.prepare(`UPDATE students SET team_id = ? WHERE id = ? AND session_id = ?`).bind(
              teamIds[i],
              studentId,
              sessionId
            )
          );
        });
      }
    });

    if (assignments.length > 0) {
      await c.env.DB.batch(assignments);
    }
  }

  // Fetch updated teams
  const teamRows = await queryAll<TeamRow>(
    c.env.DB,
    `SELECT * FROM teams WHERE session_id = ?`,
    [sessionId]
  );

  const studentRows = await queryAll<StudentRow>(
    c.env.DB,
    `SELECT * FROM students WHERE session_id = ? AND connection_status != 'kicked'`,
    [sessionId]
  );

  const teams: Team[] = teamRows.map((t, i) => ({
    id: t.id,
    sessionId: t.session_id,
    name: t.name,
    color: t.color,
    side: i === 0 ? 'left' : 'right' as const,
    score: 0,
    members: studentRows
      .filter((s) => s.team_id === t.id)
      .map((s) => ({
        id: s.id,
        sessionId: s.session_id,
        nickname: s.nickname,
        joinedAt: s.joined_at,
        connectionStatus: s.connection_status as Student['connectionStatus'],
      })),
  }));

  return c.json({
    success: true,
    data: { teams },
    requestId: c.get('requestId'),
  });
});

/**
 * POST /v1/sessions/:id/ruleset
 * Set or update the ruleset for a session
 */
sessionRoutes.post('/:id/ruleset', requireAuth(['teacher', 'admin']), idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const sessionId = c.req.param('id');
  const body = await c.req.json();
  const input = rulesetSchema.parse(body) as RulesetInput;

  // Verify session
  const session = await queryOne<SessionRow>(
    c.env.DB,
    `SELECT * FROM sessions WHERE id = ? AND tenant_id = ? AND status IN ('lobby', 'ready')`,
    [sessionId, tenantId]
  );

  if (!session) {
    throw ApiError.badRequest('Session not found or already started');
  }

  // Create or update ruleset
  const rulesetId = session.ruleset_id ?? crypto.randomUUID();
  const now = Date.now();

  if (session.ruleset_id) {
    await execute(
      c.env.DB,
      `UPDATE rulesets SET name = ?, description = ?, question_count = ?, time_limit_ms_per_question = ?,
       points_per_correct = ?, points_for_speed = ?, streak_bonus = ?, streak_threshold = ?,
       streak_multiplier = ?, allow_latejoin = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.name,
        input.description ?? null,
        input.questionCount,
        input.timeLimitMsPerQuestion,
        input.pointsPerCorrect,
        input.pointsForSpeed ? 1 : 0,
        input.streakBonus ? 1 : 0,
        input.streakThreshold,
        input.streakMultiplier,
        input.allowLatejoin ? 1 : 0,
        now,
        rulesetId,
      ]
    );
  } else {
    await execute(
      c.env.DB,
      `INSERT INTO rulesets (id, tenant_id, name, description, question_count, time_limit_ms_per_question,
       points_per_correct, points_for_speed, streak_bonus, streak_threshold, streak_multiplier,
       allow_latejoin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rulesetId,
        tenantId,
        input.name,
        input.description ?? null,
        input.questionCount,
        input.timeLimitMsPerQuestion,
        input.pointsPerCorrect,
        input.pointsForSpeed ? 1 : 0,
        input.streakBonus ? 1 : 0,
        input.streakThreshold,
        input.streakMultiplier,
        input.allowLatejoin ? 1 : 0,
        now,
        now,
      ]
    );

    await execute(c.env.DB, `UPDATE sessions SET ruleset_id = ? WHERE id = ?`, [rulesetId, sessionId]);
  }

  return c.json({
    success: true,
    data: { rulesetId, ...input },
    requestId: c.get('requestId'),
  });
});

/**
 * POST /v1/sessions/:id/start
 * Start the game session
 */
sessionRoutes.post('/:id/start', requireAuth(['teacher', 'admin']), idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const sessionId = c.req.param('id');

  const session = await queryOne<SessionRow>(
    c.env.DB,
    `SELECT * FROM sessions WHERE id = ? AND tenant_id = ? AND status IN ('lobby', 'ready')`,
    [sessionId, tenantId]
  );

  if (!session) {
    throw ApiError.badRequest('Session not found or already started');
  }

  // Verify we have at least 2 teams with members
  const teams = await queryAll<{ id: string; member_count: number }>(
    c.env.DB,
    `SELECT t.id, COUNT(s.id) as member_count
     FROM teams t LEFT JOIN students s ON t.id = s.team_id AND s.connection_status != 'kicked'
     WHERE t.session_id = ? GROUP BY t.id`,
    [sessionId]
  );

  if (teams.length < 2) {
    throw ApiError.badRequest('At least 2 teams required');
  }

  // Get questions for the session based on ruleset
  const ruleset = session.ruleset_id
    ? await queryOne<{ question_count: number }>(
        c.env.DB,
        `SELECT question_count FROM rulesets WHERE id = ?`,
        [session.ruleset_id]
      )
    : { question_count: 10 };

  const questionCount = ruleset?.question_count ?? 10;

  // Select random published questions
  const questions = await queryAll<{ id: string }>(
    c.env.DB,
    `SELECT id FROM questions WHERE tenant_id = ? AND status = 'published'
     ORDER BY RANDOM() LIMIT ?`,
    [tenantId, questionCount]
  );

  if (questions.length < questionCount) {
    throw ApiError.badRequest(`Not enough published questions. Need ${questionCount}, have ${questions.length}`);
  }

  const now = Date.now();

  await execute(
    c.env.DB,
    `UPDATE sessions SET status = 'ready', total_questions = ?, started_at = ? WHERE id = ?`,
    [questions.length, now, sessionId]
  );

  // Notify Durable Object to initialize game state
  const durableObjectId = c.env.SESSION_DO.idFromName(sessionId);
  const stub = c.env.SESSION_DO.get(durableObjectId);

  await stub.fetch(
    new Request('https://internal/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        tenantId,
        questionIds: questions.map((q) => q.id),
        rulesetId: session.ruleset_id,
      }),
    })
  );

  return c.json({
    success: true,
    data: {
      sessionId,
      status: 'ready',
      totalQuestions: questions.length,
      startedAt: now,
    },
    requestId: c.get('requestId'),
  });
});

/**
 * POST /v1/sessions/:id/end
 * End the game session
 */
sessionRoutes.post('/:id/end', requireAuth(['teacher', 'admin']), idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const sessionId = c.req.param('id');

  const session = await queryOne<SessionRow>(
    c.env.DB,
    `SELECT * FROM sessions WHERE id = ? AND tenant_id = ? AND status NOT IN ('completed', 'cancelled')`,
    [sessionId, tenantId]
  );

  if (!session) {
    throw ApiError.badRequest('Session not found or already ended');
  }

  const now = Date.now();

  // Notify Durable Object to end game and get final state
  const durableObjectId = c.env.SESSION_DO.idFromName(sessionId);
  const stub = c.env.SESSION_DO.get(durableObjectId);

  const response = await stub.fetch(
    new Request('https://internal/end', { method: 'POST' })
  );
  const finalState = await response.json() as { position: number };

  await execute(
    c.env.DB,
    `UPDATE sessions SET status = 'completed', final_position = ?, ended_at = ? WHERE id = ?`,
    [finalState.position ?? 50, now, sessionId]
  );

  return c.json({
    success: true,
    data: {
      sessionId,
      status: 'completed',
      finalPosition: finalState.position,
      endedAt: now,
    },
    requestId: c.get('requestId'),
  });
});

/**
 * GET /v1/sessions/:id/roster
 * Get current roster (students and teams)
 */
sessionRoutes.get('/:id/roster', requireAuth(['teacher', 'admin']), async (c) => {
  const tenantId = requireTenant(c);
  const sessionId = c.req.param('id');

  const session = await queryOne<SessionRow>(
    c.env.DB,
    `SELECT id FROM sessions WHERE id = ? AND tenant_id = ?`,
    [sessionId, tenantId]
  );

  if (!session) {
    throw ApiError.notFound('Session');
  }

  const teamRows = await queryAll<TeamRow>(
    c.env.DB,
    `SELECT * FROM teams WHERE session_id = ?`,
    [sessionId]
  );

  const studentRows = await queryAll<StudentRow>(
    c.env.DB,
    `SELECT * FROM students WHERE session_id = ?`,
    [sessionId]
  );

  const teams = teamRows.map((t, i) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    side: i === 0 ? 'left' : 'right' as const,
    score: 0,
    members: studentRows
      .filter((s) => s.team_id === t.id)
      .map((s) => ({
        id: s.id,
        nickname: s.nickname,
        connectionStatus: s.connection_status,
        joinedAt: s.joined_at,
      })),
  }));

  const unassigned = studentRows
    .filter((s) => !s.team_id && s.connection_status !== 'kicked')
    .map((s) => ({
      id: s.id,
      nickname: s.nickname,
      connectionStatus: s.connection_status,
      joinedAt: s.joined_at,
    }));

  return c.json({
    success: true,
    data: {
      teams,
      unassigned,
      totalPlayers: studentRows.filter((s) => s.connection_status !== 'kicked').length,
      maxPlayers: MAX_PLAYERS_PER_SESSION,
    },
    requestId: c.get('requestId'),
  });
});

/**
 * POST /v1/sessions/:id/kick
 * Kick a student from the session
 */
sessionRoutes.post('/:id/kick', requireAuth(['teacher', 'admin']), idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const sessionId = c.req.param('id');
  const { studentId, reason } = await c.req.json();
  
  if (!studentId) {
    throw ApiError.badRequest('studentId required');
  }

  const session = await queryOne<SessionRow>(
    c.env.DB,
    `SELECT id FROM sessions WHERE id = ? AND tenant_id = ?`,
    [sessionId, tenantId]
  );

  if (!session) {
    throw ApiError.notFound('Session');
  }

  const result = await execute(
    c.env.DB,
    `UPDATE students SET connection_status = 'kicked', team_id = NULL
     WHERE id = ? AND session_id = ?`,
    [studentId, sessionId]
  );

  if (result.meta.changes === 0) {
    throw ApiError.notFound('Student');
  }

  // Notify Durable Object to disconnect the player
  const durableObjectId = c.env.SESSION_DO.idFromName(sessionId);
  const stub = c.env.SESSION_DO.get(durableObjectId);

  await stub.fetch(
    new Request('https://internal/kick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, reason }),
    })
  );

  return c.json({
    success: true,
    data: { studentId, kicked: true },
    requestId: c.get('requestId'),
  });
});

/**
 * GET /v1/sessions/:id/state
 * HTTP fallback for game state (served by DO)
 */
sessionRoutes.get('/:id/state', requireAuth(['teacher', 'admin', 'student']), async (c) => {
  const user = c.get('user')!;
  const sessionId = c.req.param('id');

  // Verify access
  if (user.role === 'student' && user.sessionId !== sessionId) {
    throw ApiError.forbidden('Cannot access this session');
  }

  // Forward to Durable Object
  const durableObjectId = c.env.SESSION_DO.idFromName(sessionId);
  const stub = c.env.SESSION_DO.get(durableObjectId);

  const response = await stub.fetch(
    new Request(`https://internal/state?role=${user.role}`, { method: 'GET' })
  );

  if (!response.ok) {
    throw ApiError.notFound('Session state not available');
  }

  const state = await response.json();

  return c.json({
    success: true,
    data: state,
    requestId: c.get('requestId'),
  }, 200, {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
});

/**
 * POST /v1/sessions/:id/answers
 * HTTP fallback for submitting answers (forwards to DO)
 */
sessionRoutes.post('/:id/answers', requireAuth(['student']), idempotencyMiddleware(), async (c) => {
  const user = c.get('user')!;
  const sessionId = c.req.param('id');

  if (user.sessionId !== sessionId) {
    throw ApiError.forbidden('Cannot submit to this session');
  }

  const { questionInstanceId, answerId } = await c.req.json();

  if (!questionInstanceId || !answerId) {
    throw ApiError.badRequest('questionInstanceId and answerId required');
  }

  // Forward to Durable Object
  const durableObjectId = c.env.SESSION_DO.idFromName(sessionId);
  const stub = c.env.SESSION_DO.get(durableObjectId);

  const response = await stub.fetch(
    new Request('https://internal/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: user.id,
        teamId: user.teamId,
        questionInstanceId,
        answerId,
      }),
    })
  );

  if (!response.ok) {
    const error = await response.json() as { message: string };
    throw ApiError.badRequest(error.message || 'Failed to submit answer');
  }

  const result = await response.json();

  return c.json({
    success: true,
    data: result,
    requestId: c.get('requestId'),
  });
});
