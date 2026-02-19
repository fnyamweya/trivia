/**
 * Topic Routes
 */

import { Hono } from 'hono';
import { createTopicSchema, type Topic, type CreateTopicInput } from '@trivia/shared';
import type { Env, Variables } from '../types/env.js';
import { requireAuth, requireTenant } from '../auth/jwt.js';
import { queryAll, queryOne, execute } from '../db/helpers.js';
import { idempotencyMiddleware } from '../db/idempotency.js';
import { ApiError } from '../observability/error-handler.js';

export const topicRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

topicRoutes.use('*', requireAuth(['teacher', 'admin']));

interface TopicRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: number;
}

function rowToTopic(row: TopicRow): Topic {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color,
    createdAt: row.created_at,
  };
}

/**
 * GET /v1/topics
 * List all topics for the tenant
 */
topicRoutes.get('/', async (c) => {
  const tenantId = requireTenant(c);

  const rows = await queryAll<TopicRow>(
    c.env.DB,
    `SELECT * FROM topics WHERE tenant_id = ? ORDER BY name ASC`,
    [tenantId]
  );

  return c.json({
    success: true,
    data: rows.map(rowToTopic),
    requestId: c.get('requestId'),
  });
});

/**
 * POST /v1/topics
 * Create a new topic
 */
topicRoutes.post('/', idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const body = await c.req.json();
  const input = createTopicSchema.parse(body) as CreateTopicInput;

  // Check for duplicate
  const existing = await queryOne<TopicRow>(
    c.env.DB,
    `SELECT id FROM topics WHERE tenant_id = ? AND name = ?`,
    [tenantId, input.name]
  );

  if (existing) {
    throw ApiError.conflict('Topic with this name already exists');
  }

  const topicId = crypto.randomUUID();
  const now = Date.now();

  await execute(
    c.env.DB,
    `INSERT INTO topics (id, tenant_id, name, description, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [topicId, tenantId, input.name, input.description ?? null, input.color ?? '#6B7280', now]
  );

  return c.json(
    {
      success: true,
      data: {
        id: topicId,
        tenantId,
        name: input.name,
        description: input.description,
        color: input.color ?? '#6B7280',
        createdAt: now,
      },
      requestId: c.get('requestId'),
    },
    201
  );
});

/**
 * PATCH /v1/topics/:id
 * Update a topic
 */
topicRoutes.patch('/:id', idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const topicId = c.req.param('id');
  const body = await c.req.json();
  const input = createTopicSchema.partial().parse(body);

  // Build update query
  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    params.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push('description = ?');
    params.push(input.description);
  }
  if (input.color !== undefined) {
    updates.push('color = ?');
    params.push(input.color);
  }

  if (updates.length === 0) {
    throw ApiError.badRequest('No fields to update');
  }

  params.push(topicId, tenantId);

  const result = await execute(
    c.env.DB,
    `UPDATE topics SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
    params
  );

  if (result.meta.changes === 0) {
    throw ApiError.notFound('Topic');
  }

  const row = await queryOne<TopicRow>(
    c.env.DB,
    `SELECT * FROM topics WHERE id = ?`,
    [topicId]
  );

  return c.json({
    success: true,
    data: rowToTopic(row!),
    requestId: c.get('requestId'),
  });
});

/**
 * DELETE /v1/topics/:id
 * Delete a topic
 */
topicRoutes.delete('/:id', async (c) => {
  const tenantId = requireTenant(c);
  const topicId = c.req.param('id');

  // Check if topic has questions
  const hasQuestions = await queryOne<{ count: number }>(
    c.env.DB,
    `SELECT COUNT(*) as count FROM questions WHERE topic_id = ?`,
    [topicId]
  );

  if (hasQuestions && hasQuestions.count > 0) {
    throw ApiError.badRequest('Cannot delete topic with associated questions');
  }

  const result = await execute(
    c.env.DB,
    `DELETE FROM topics WHERE id = ? AND tenant_id = ?`,
    [topicId, tenantId]
  );

  if (result.meta.changes === 0) {
    throw ApiError.notFound('Topic');
  }

  return c.json({
    success: true,
    requestId: c.get('requestId'),
  });
});
