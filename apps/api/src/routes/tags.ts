/**
 * Tag Routes
 */

import { Hono } from 'hono';
import { createTagSchema, type Tag, type CreateTagInput } from '@trivia/shared';
import type { Env, Variables } from '../types/env.js';
import { requireAuth, requireTenant } from '../auth/jwt.js';
import { queryAll, queryOne, execute } from '../db/helpers.js';
import { idempotencyMiddleware } from '../db/idempotency.js';
import { ApiError } from '../observability/error-handler.js';

export const tagRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

tagRoutes.use('*', requireAuth(['teacher', 'admin']));

interface TagRow {
  id: string;
  tenant_id: string;
  name: string;
  created_at: number;
}

function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    createdAt: row.created_at,
  };
}

/**
 * GET /v1/tags
 * List all tags for the tenant
 */
tagRoutes.get('/', async (c) => {
  const tenantId = requireTenant(c);

  const rows = await queryAll<TagRow>(
    c.env.DB,
    `SELECT * FROM tags WHERE tenant_id = ? ORDER BY name ASC`,
    [tenantId]
  );

  return c.json({
    success: true,
    data: rows.map(rowToTag),
    requestId: c.get('requestId'),
  });
});

/**
 * POST /v1/tags
 * Create a new tag
 */
tagRoutes.post('/', idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const body = await c.req.json();
  const input = createTagSchema.parse(body) as CreateTagInput;

  // Check for duplicate
  const existing = await queryOne<TagRow>(
    c.env.DB,
    `SELECT id FROM tags WHERE tenant_id = ? AND name = ?`,
    [tenantId, input.name]
  );

  if (existing) {
    throw ApiError.conflict('Tag with this name already exists');
  }

  const tagId = crypto.randomUUID();
  const now = Date.now();

  await execute(
    c.env.DB,
    `INSERT INTO tags (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)`,
    [tagId, tenantId, input.name, now]
  );

  return c.json(
    {
      success: true,
      data: {
        id: tagId,
        tenantId,
        name: input.name,
        createdAt: now,
      },
      requestId: c.get('requestId'),
    },
    201
  );
});

/**
 * DELETE /v1/tags/:id
 * Delete a tag
 */
tagRoutes.delete('/:id', async (c) => {
  const tenantId = requireTenant(c);
  const tagId = c.req.param('id');

  const result = await execute(
    c.env.DB,
    `DELETE FROM tags WHERE id = ? AND tenant_id = ?`,
    [tagId, tenantId]
  );

  if (result.meta.changes === 0) {
    throw ApiError.notFound('Tag');
  }

  return c.json({
    success: true,
    requestId: c.get('requestId'),
  });
});
