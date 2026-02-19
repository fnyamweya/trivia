/**
 * Idempotency Key Handler
 * 
 * Ensures state-mutating operations can be safely retried.
 * Stores idempotency keys in D1 with TTL cleanup.
 */

import type { Context, Next } from 'hono';
import { HEADER_IDEMPOTENCY_KEY } from '@trivia/shared';
import type { Env, Variables } from '../types/env.js';
import { queryOne, execute } from './helpers.js';

interface IdempotencyRecord {
  id: string;
  key: string;
  tenant_id: string;
  response_status: number;
  response_body: string;
  created_at: number;
  expires_at: number;
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if an idempotency key has been used and return cached response
 */
export async function checkIdempotencyKey(
  db: D1Database,
  key: string,
  tenantId: string
): Promise<{ status: number; body: unknown } | null> {
  const record = await queryOne<IdempotencyRecord>(
    db,
    `SELECT * FROM idempotency_keys 
     WHERE key = ? AND tenant_id = ? AND expires_at > ?`,
    [key, tenantId, Date.now()]
  );

  if (record) {
    return {
      status: record.response_status,
      body: JSON.parse(record.response_body),
    };
  }

  return null;
}

/**
 * Store the response for an idempotency key
 */
export async function storeIdempotencyKey(
  db: D1Database,
  key: string,
  tenantId: string,
  status: number,
  body: unknown
): Promise<void> {
  const now = Date.now();
  await execute(
    db,
    `INSERT INTO idempotency_keys (id, key, tenant_id, response_status, response_body, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (key, tenant_id) DO UPDATE SET
       response_status = excluded.response_status,
       response_body = excluded.response_body`,
    [
      crypto.randomUUID(),
      key,
      tenantId,
      status,
      JSON.stringify(body),
      now,
      now + IDEMPOTENCY_TTL_MS,
    ]
  );
}

/**
 * Middleware for idempotent POST/PUT/PATCH endpoints
 */
export function idempotencyMiddleware() {
  return async (
    c: Context<{ Bindings: Env; Variables: Variables }>,
    next: Next
  ): Promise<Response | void> => {
    // Only apply to mutating methods
    const method = c.req.method;
    if (!['POST', 'PUT', 'PATCH'].includes(method)) {
      await next();
      return;
    }

    const idempotencyKey = c.req.header(HEADER_IDEMPOTENCY_KEY);
    
    // If no idempotency key, proceed normally
    if (!idempotencyKey) {
      await next();
      return;
    }

    const tenantId = c.get('tenantId');
    if (!tenantId) {
      // Without tenant context, skip idempotency (e.g., auth endpoints)
      await next();
      return;
    }

    // Check for existing response
    const cached = await checkIdempotencyKey(c.env.DB, idempotencyKey, tenantId);
    if (cached) {
      return c.json(cached.body, cached.status as 200 | 201);
    }

    // Continue with the request
    await next();

    // Store the response for future idempotent requests
    // Only store successful responses (2xx)
    if (c.res.status >= 200 && c.res.status < 300) {
      const clonedResponse = c.res.clone();
      const body = await clonedResponse.json();
      await storeIdempotencyKey(
        c.env.DB,
        idempotencyKey,
        tenantId,
        c.res.status,
        body
      );
    }
  };
}

/**
 * Cleanup expired idempotency keys (run periodically)
 */
export async function cleanupIdempotencyKeys(db: D1Database): Promise<number> {
  const result = await execute(
    db,
    `DELETE FROM idempotency_keys WHERE expires_at < ?`,
    [Date.now()]
  );
  return result.meta.changes ?? 0;
}
