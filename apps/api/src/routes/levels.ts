import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, requireTenant } from '../auth/jwt.js';
import { queryAll, queryOne, execute } from '../db/helpers.js';
import { idempotencyMiddleware } from '../db/idempotency.js';
import { ApiError } from '../observability/error-handler.js';
import { rulesetSchema, type RulesetInput } from '@trivia/shared';
import type { Env, Variables } from '../types/env.js';

export const levelRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

levelRoutes.use('*', requireAuth(['teacher', 'admin']));

interface RulesetRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  question_count: number;
  time_limit_ms_per_question: number;
  points_per_correct: number;
  points_for_speed: number;
  streak_bonus: number;
  streak_threshold: number;
  streak_multiplier: number;
  allow_latejoin: number;
  created_at: number;
  updated_at: number;
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function rowToLevel(row: RulesetRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? undefined,
    questionCount: row.question_count,
    timeLimitMsPerQuestion: row.time_limit_ms_per_question,
    pointsPerCorrect: row.points_per_correct,
    pointsForSpeed: row.points_for_speed === 1,
    streakBonus: row.streak_bonus === 1,
    streakThreshold: row.streak_threshold,
    streakMultiplier: row.streak_multiplier,
    allowLatejoin: row.allow_latejoin === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

levelRoutes.get('/', async (c) => {
  const tenantId = requireTenant(c);
  const query = listQuerySchema.parse(c.req.query());

  const rows = await queryAll<RulesetRow>(
    c.env.DB,
    `SELECT * FROM rulesets WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT ?`,
    [tenantId, query.limit]
  );

  return c.json({
    success: true,
    data: rows.map(rowToLevel),
    requestId: c.get('requestId'),
  });
});

levelRoutes.post('/', idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const input = rulesetSchema.parse(await c.req.json()) as RulesetInput;
  const now = Date.now();
  const levelId = crypto.randomUUID();

  await execute(
    c.env.DB,
    `INSERT INTO rulesets (
      id, tenant_id, name, description, question_count, time_limit_ms_per_question,
      points_per_correct, points_for_speed, streak_bonus, streak_threshold,
      streak_multiplier, allow_latejoin, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      levelId,
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

  const row = await queryOne<RulesetRow>(
    c.env.DB,
    `SELECT * FROM rulesets WHERE id = ? AND tenant_id = ?`,
    [levelId, tenantId]
  );

  return c.json({
    success: true,
    data: row ? rowToLevel(row) : null,
    requestId: c.get('requestId'),
  }, 201);
});

levelRoutes.patch('/:id', idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const levelId = c.req.param('id');
  const input = rulesetSchema.parse(await c.req.json()) as RulesetInput;
  const now = Date.now();

  const existing = await queryOne<{ id: string }>(
    c.env.DB,
    `SELECT id FROM rulesets WHERE id = ? AND tenant_id = ?`,
    [levelId, tenantId]
  );

  if (!existing) {
    throw ApiError.notFound('Level');
  }

  await execute(
    c.env.DB,
    `UPDATE rulesets SET
      name = ?, description = ?, question_count = ?, time_limit_ms_per_question = ?,
      points_per_correct = ?, points_for_speed = ?, streak_bonus = ?, streak_threshold = ?,
      streak_multiplier = ?, allow_latejoin = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?`,
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
      levelId,
      tenantId,
    ]
  );

  const row = await queryOne<RulesetRow>(
    c.env.DB,
    `SELECT * FROM rulesets WHERE id = ? AND tenant_id = ?`,
    [levelId, tenantId]
  );

  return c.json({
    success: true,
    data: row ? rowToLevel(row) : null,
    requestId: c.get('requestId'),
  });
});
