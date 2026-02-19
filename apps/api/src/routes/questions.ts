/**
 * Question Bank Routes
 */

import { Hono } from 'hono';
import {
  createQuestionSchema,
  updateQuestionSchema,
  questionQuerySchema,
  importQuestionsSchema,
  type Question,
  type Tag,
  type CreateQuestionInput,
  type UpdateQuestionInput,
  type QuestionQueryInput,
} from '@trivia/shared';
import type { Env, Variables } from '../types/env.js';
import { requireAuth, requireTenant, requireRole } from '../auth/jwt.js';
import { queryAll, queryOne, execute, processPaginatedResults, decodeCursor } from '../db/helpers.js';
import { idempotencyMiddleware } from '../db/idempotency.js';
import { ApiError } from '../observability/error-handler.js';

export const questionRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// All routes require teacher/admin auth
questionRoutes.use('*', requireAuth(['teacher', 'admin']));

interface QuestionRow {
  id: string;
  tenant_id: string;
  topic_id: string | null;
  type: string;
  difficulty: string;
  status: string;
  text: string;
  answers: string;
  explanation: string | null;
  time_limit_ms: number;
  points: number;
  created_by: string;
  created_at: number;
  updated_at: number;
}

interface TagRow {
  id: string;
  name: string;
}

function rowToQuestion(row: QuestionRow, tags: Tag[] = []): Question {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    topicId: row.topic_id ?? undefined,
    type: row.type as 'multiple_choice' | 'true_false',
    difficulty: row.difficulty as 'easy' | 'medium' | 'hard',
    status: row.status as 'draft' | 'published' | 'retired',
    text: row.text,
    answers: JSON.parse(row.answers),
    explanation: row.explanation ?? undefined,
    timeLimitMs: row.time_limit_ms,
    points: row.points,
    tags,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /v1/questions
 * List questions with filtering and cursor-based pagination
 */
questionRoutes.get('/', async (c) => {
  const tenantId = requireTenant(c);
  const query = questionQuerySchema.parse(c.req.query()) as QuestionQueryInput;

  // Build base query with filters
  let sql = `SELECT q.* FROM questions q WHERE q.tenant_id = ?`;
  const params: unknown[] = [tenantId];

  if (query.topicId) {
    sql += ` AND q.topic_id = ?`;
    params.push(query.topicId);
  }

  if (query.difficulty) {
    sql += ` AND q.difficulty = ?`;
    params.push(query.difficulty);
  }

  if (query.status) {
    sql += ` AND q.status = ?`;
    params.push(query.status);
  }

  if (query.tagId) {
    sql += ` AND EXISTS (SELECT 1 FROM question_tags qt WHERE qt.question_id = q.id AND qt.tag_id = ?)`;
    params.push(query.tagId);
  }

  if (query.search) {
    sql += ` AND q.text LIKE ?`;
    params.push(`%${query.search}%`);
  }

  // Add cursor pagination
  if (query.cursor) {
    const decoded = decodeCursor(query.cursor);
    if (decoded) {
      sql += ` AND (q.updated_at, q.id) < (?, ?)`;
      params.push(decoded.v, decoded.id);
    }
  }

  sql += ` ORDER BY q.updated_at DESC, q.id DESC LIMIT ?`;
  params.push((query.limit || 20) + 1);

  const rows = await queryAll<QuestionRow>(c.env.DB, sql, params);
  const { data, cursor, hasMore } = processPaginatedResults(rows, query.limit || 20, 'updated_at' as keyof QuestionRow);

  // Fetch tags for each question
  const questionIds = data.map((q) => q.id);
  let tagsByQuestion: Record<string, Tag[]> = {};

  if (questionIds.length > 0) {
    const tagRows = await queryAll<{ question_id: string; tag_id: string; name: string }>(
      c.env.DB,
      `SELECT qt.question_id, t.id as tag_id, t.name
       FROM question_tags qt
       JOIN tags t ON qt.tag_id = t.id
       WHERE qt.question_id IN (${questionIds.map(() => '?').join(',')})`,
      questionIds
    );

    tagsByQuestion = tagRows.reduce(
      (acc, row) => {
        if (!acc[row.question_id]) acc[row.question_id] = [];
        acc[row.question_id].push({ id: row.tag_id, tenantId, name: row.name, createdAt: 0 });
        return acc;
      },
      {} as Record<string, Tag[]>
    );
  }

  const questions = data.map((row) => rowToQuestion(row, tagsByQuestion[row.id] || []));

  return c.json({
    success: true,
    data: questions,
    cursor,
    hasMore,
    requestId: c.get('requestId'),
  });
});

/**
 * GET /v1/questions/:id
 * Get a single question by ID
 */
questionRoutes.get('/:id', async (c) => {
  const tenantId = requireTenant(c);
  const questionId = c.req.param('id');

  const row = await queryOne<QuestionRow>(
    c.env.DB,
    `SELECT * FROM questions WHERE id = ? AND tenant_id = ?`,
    [questionId, tenantId]
  );

  if (!row) {
    throw ApiError.notFound('Question');
  }

  // Fetch tags
  const tagRows = await queryAll<TagRow>(
    c.env.DB,
    `SELECT t.id, t.name FROM tags t
     JOIN question_tags qt ON t.id = qt.tag_id
     WHERE qt.question_id = ?`,
    [questionId]
  );

  const tags: Tag[] = tagRows.map((t) => ({
    id: t.id,
    tenantId,
    name: t.name,
    createdAt: 0,
  }));

  return c.json({
    success: true,
    data: rowToQuestion(row, tags),
    requestId: c.get('requestId'),
  });
});

/**
 * POST /v1/questions
 * Create a new question
 */
questionRoutes.post('/', idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const user = requireRole(c, 'teacher', 'admin');
  const body = await c.req.json();
  const input = createQuestionSchema.parse(body) as CreateQuestionInput;

  const questionId = crypto.randomUUID();
  const now = Date.now();

  await execute(
    c.env.DB,
    `INSERT INTO questions (id, tenant_id, topic_id, type, difficulty, status, text, answers, explanation, time_limit_ms, points, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      questionId,
      tenantId,
      input.topicId ?? null,
      input.type,
      input.difficulty,
      input.text,
      JSON.stringify(input.answers),
      input.explanation ?? null,
      input.timeLimitMs,
      input.points,
      user.id,
      now,
      now,
    ]
  );

  // Add tags if provided
  if (input.tagIds && input.tagIds.length > 0) {
    const tagStmts = input.tagIds.map((tagId) =>
      c.env.DB.prepare(`INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)`).bind(
        questionId,
        tagId
      )
    );
    await c.env.DB.batch(tagStmts);
  }

  // Fetch the created question
  const row = await queryOne<QuestionRow>(
    c.env.DB,
    `SELECT * FROM questions WHERE id = ?`,
    [questionId]
  );

  return c.json(
    {
      success: true,
      data: rowToQuestion(row!, []),
      requestId: c.get('requestId'),
    },
    201
  );
});

/**
 * PATCH /v1/questions/:id
 * Update a question
 */
questionRoutes.patch('/:id', idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const questionId = c.req.param('id');
  const body = await c.req.json();
  const input = updateQuestionSchema.parse(body) as UpdateQuestionInput;

  // Verify question exists and belongs to tenant
  const existing = await queryOne<QuestionRow>(
    c.env.DB,
    `SELECT * FROM questions WHERE id = ? AND tenant_id = ?`,
    [questionId, tenantId]
  );

  if (!existing) {
    throw ApiError.notFound('Question');
  }

  // Build update query dynamically
  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.topicId !== undefined) {
    updates.push('topic_id = ?');
    params.push(input.topicId);
  }
  if (input.difficulty !== undefined) {
    updates.push('difficulty = ?');
    params.push(input.difficulty);
  }
  if (input.text !== undefined) {
    updates.push('text = ?');
    params.push(input.text);
  }
  if (input.answers !== undefined) {
    updates.push('answers = ?');
    params.push(JSON.stringify(input.answers));
  }
  if (input.explanation !== undefined) {
    updates.push('explanation = ?');
    params.push(input.explanation);
  }
  if (input.timeLimitMs !== undefined) {
    updates.push('time_limit_ms = ?');
    params.push(input.timeLimitMs);
  }
  if (input.points !== undefined) {
    updates.push('points = ?');
    params.push(input.points);
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    params.push(Date.now());
    params.push(questionId);

    await execute(
      c.env.DB,
      `UPDATE questions SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
  }

  // Update tags if provided
  if (input.tagIds !== undefined) {
    await execute(c.env.DB, `DELETE FROM question_tags WHERE question_id = ?`, [questionId]);

    if (input.tagIds.length > 0) {
      const tagStmts = input.tagIds.map((tagId) =>
        c.env.DB.prepare(`INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)`).bind(
          questionId,
          tagId
        )
      );
      await c.env.DB.batch(tagStmts);
    }
  }

  // Fetch updated question
  const row = await queryOne<QuestionRow>(
    c.env.DB,
    `SELECT * FROM questions WHERE id = ?`,
    [questionId]
  );

  return c.json({
    success: true,
    data: rowToQuestion(row!, []),
    requestId: c.get('requestId'),
  });
});

/**
 * POST /v1/questions/:id/publish
 * Publish a draft question
 */
questionRoutes.post('/:id/publish', idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const questionId = c.req.param('id');

  const result = await execute(
    c.env.DB,
    `UPDATE questions SET status = 'published', updated_at = ?
     WHERE id = ? AND tenant_id = ? AND status = 'draft'`,
    [Date.now(), questionId, tenantId]
  );

  if (result.meta.changes === 0) {
    throw ApiError.badRequest('Question not found or already published');
  }

  return c.json({
    success: true,
    data: { id: questionId, status: 'published' },
    requestId: c.get('requestId'),
  });
});

/**
 * POST /v1/questions/:id/retire
 * Retire a question
 */
questionRoutes.post('/:id/retire', idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const questionId = c.req.param('id');

  const result = await execute(
    c.env.DB,
    `UPDATE questions SET status = 'retired', updated_at = ?
     WHERE id = ? AND tenant_id = ? AND status != 'retired'`,
    [Date.now(), questionId, tenantId]
  );

  if (result.meta.changes === 0) {
    throw ApiError.badRequest('Question not found or already retired');
  }

  return c.json({
    success: true,
    data: { id: questionId, status: 'retired' },
    requestId: c.get('requestId'),
  });
});

/**
 * POST /v1/questions/import
 * Bulk import questions from JSON or CSV
 */
questionRoutes.post('/import', idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const user = requireRole(c, 'teacher', 'admin');
  const body = await c.req.json();
  const input = importQuestionsSchema.parse(body);

  const results: { success: number; failed: number; errors: Array<{ row: number; error: string }> } = {
    success: 0,
    failed: 0,
    errors: [],
  };

  let questions: Array<Partial<CreateQuestionInput> & { row: number }> = [];

  if (input.format === 'json') {
    try {
      const parsed = JSON.parse(input.data);
      questions = (Array.isArray(parsed) ? parsed : [parsed]).map((q, i) => ({ ...q, row: i + 1 }));
    } catch {
      throw ApiError.badRequest('Invalid JSON format');
    }
  } else {
    // Simple CSV parsing (could use a library for more robust handling)
    const lines = input.data.split('\n').filter((l) => l.trim());
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const question: Record<string, unknown> = { row: i + 1 };
      headers.forEach((h, idx) => {
        question[h] = values[idx];
      });
      questions.push(question as typeof questions[0]);
    }
  }

  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  for (const q of questions) {
    try {
      // Validate each question
      const validated = createQuestionSchema.parse({
        ...q,
        topicId: q.topicId || input.topicId,
        difficulty: q.difficulty || input.defaultDifficulty || 'medium',
        type: q.type || 'multiple_choice',
        timeLimitMs: q.timeLimitMs || 30000,
        points: q.points || 10,
      });

      const questionId = crypto.randomUUID();
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO questions (id, tenant_id, topic_id, type, difficulty, status, text, answers, explanation, time_limit_ms, points, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          questionId,
          tenantId,
          validated.topicId ?? null,
          validated.type,
          validated.difficulty,
          validated.text,
          JSON.stringify(validated.answers),
          validated.explanation ?? null,
          validated.timeLimitMs,
          validated.points,
          user.id,
          now,
          now
        )
      );
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        row: q.row,
        error: error instanceof Error ? error.message : 'Validation failed',
      });
    }
  }

  // Batch insert all valid questions
  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  return c.json({
    success: true,
    data: results,
    requestId: c.get('requestId'),
  }, results.failed > 0 ? 207 : 201); // 207 Multi-Status if partial success
});
