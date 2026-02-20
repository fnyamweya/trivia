import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../types/env.js';
import { requireAuth, requireRole, requireTenant } from '../auth/jwt.js';
import { ApiError } from '../observability/error-handler.js';
import { execute, queryAll, queryOne } from '../db/helpers.js';
import { idempotencyMiddleware } from '../db/idempotency.js';

export const adminRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

adminRoutes.use('*', requireAuth(['admin']));

const tenantSettingsSchema = z.object({
  schoolName: z.string().min(1).max(120).optional(),
  schoolLogoUrl: z.string().url().optional(),
  timezone: z.string().min(1).max(80).optional(),
  defaultLanguage: z.string().min(2).max(12).optional(),
  sessionDefaults: z.object({
    questionCount: z.number().int().min(1).max(100).optional(),
    timeLimitMsPerQuestion: z.number().int().min(5000).max(120000).optional(),
    pointsPerCorrect: z.number().int().min(1).max(100).optional(),
    allowLatejoin: z.boolean().optional(),
  }).optional(),
});

const inviteTeacherSchema = z.object({
  email: z.string().email().max(255),
  displayName: z.string().min(2).max(120).optional(),
  role: z.enum(['teacher']).default('teacher'),
  expiresInHours: z.number().int().min(1).max(168).default(72),
});

interface TenantRow {
  id: string;
  name: string;
  settings: string | null;
}

interface InviteRow {
  id: string;
  tenant_id: string;
  invited_by: string;
  email: string;
  display_name: string | null;
  role: 'teacher' | 'admin';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: number;
  accepted_at: number | null;
  accepted_user_id: string | null;
  created_at: number;
  updated_at: number;
}

async function hashToken(rawToken: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildInviteLink(baseUrl: string, rawToken: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/invite/${rawToken}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

adminRoutes.get('/settings', async (c) => {
  const tenantId = requireTenant(c);
  requireRole(c, 'admin');

  const tenant = await queryOne<TenantRow>(
    c.env.DB,
    `SELECT id, name, settings FROM tenants WHERE id = ?`,
    [tenantId]
  );

  if (!tenant) {
    throw ApiError.notFound('Tenant');
  }

  let parsedSettings: Record<string, unknown> = {};
  try {
    parsedSettings = tenant.settings ? JSON.parse(tenant.settings) : {};
  } catch {
    parsedSettings = {};
  }

  return c.json({
    success: true,
    data: {
      tenantId: tenant.id,
      schoolName: tenant.name,
      ...parsedSettings,
    },
    requestId: c.get('requestId'),
  });
});

adminRoutes.patch('/settings', idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  requireRole(c, 'admin');
  const input = tenantSettingsSchema.parse(await c.req.json());

  const tenant = await queryOne<TenantRow>(
    c.env.DB,
    `SELECT id, name, settings FROM tenants WHERE id = ?`,
    [tenantId]
  );

  if (!tenant) {
    throw ApiError.notFound('Tenant');
  }

  let existingSettings: Record<string, unknown> = {};
  try {
    existingSettings = tenant.settings ? JSON.parse(tenant.settings) : {};
  } catch {
    existingSettings = {};
  }

  const mergedSettings = {
    ...existingSettings,
    ...input,
  };

  await execute(
    c.env.DB,
    `UPDATE tenants SET name = ?, settings = ?, updated_at = ? WHERE id = ?`,
    [input.schoolName ?? tenant.name, JSON.stringify(mergedSettings), Date.now(), tenantId]
  );

  return c.json({
    success: true,
    data: {
      tenantId,
      schoolName: input.schoolName ?? tenant.name,
      ...mergedSettings,
    },
    requestId: c.get('requestId'),
  });
});

adminRoutes.get('/invites', async (c) => {
  const tenantId = requireTenant(c);
  requireRole(c, 'admin');

  await execute(
    c.env.DB,
    `UPDATE teacher_invites
     SET status = 'expired', updated_at = ?
     WHERE tenant_id = ? AND status = 'pending' AND expires_at < ?`,
    [Date.now(), tenantId, Date.now()]
  );

  const invites = await queryAll<InviteRow>(
    c.env.DB,
    `SELECT * FROM teacher_invites WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200`,
    [tenantId]
  );

  return c.json({
    success: true,
    data: invites,
    requestId: c.get('requestId'),
  });
});

adminRoutes.post('/invites', idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const admin = requireRole(c, 'admin');
  const input = inviteTeacherSchema.parse(await c.req.json());

  const now = Date.now();
  const expiresAt = now + input.expiresInHours * 60 * 60 * 1000;
  const rawToken = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const tokenHash = await hashToken(rawToken);

  await execute(
    c.env.DB,
    `UPDATE teacher_invites
     SET status = 'revoked', updated_at = ?
     WHERE tenant_id = ? AND email = ? AND status = 'pending'`,
    [now, tenantId, input.email]
  );

  const inviteId = crypto.randomUUID();
  await execute(
    c.env.DB,
    `INSERT INTO teacher_invites (
      id, tenant_id, invited_by, email, display_name, role, token_hash,
      status, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [
      inviteId,
      tenantId,
      admin.id,
      input.email,
      input.displayName ?? null,
      input.role,
      tokenHash,
      expiresAt,
      now,
      now,
    ]
  );

  const inviteLink = buildInviteLink(c.req.url, rawToken);

  return c.json({
    success: true,
    data: {
      id: inviteId,
      email: input.email,
      role: input.role,
      status: 'pending',
      expiresAt,
      inviteLink,
    },
    requestId: c.get('requestId'),
  }, 201);
});

adminRoutes.post('/invites/:id/resend', idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  const admin = requireRole(c, 'admin');
  const inviteId = c.req.param('id');

  const invite = await queryOne<InviteRow>(
    c.env.DB,
    `SELECT * FROM teacher_invites WHERE id = ? AND tenant_id = ?`,
    [inviteId, tenantId]
  );

  if (!invite) {
    throw ApiError.notFound('Invite');
  }

  if (invite.status === 'accepted' || invite.status === 'revoked') {
    throw ApiError.badRequest(`Cannot resend ${invite.status} invite`);
  }

  const now = Date.now();
  const rawToken = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const tokenHash = await hashToken(rawToken);
  const expiresAt = now + 72 * 60 * 60 * 1000;

  await execute(
    c.env.DB,
    `UPDATE teacher_invites
     SET token_hash = ?, status = 'pending', expires_at = ?, updated_at = ?, invited_by = ?
     WHERE id = ? AND tenant_id = ?`,
    [tokenHash, expiresAt, now, admin.id, inviteId, tenantId]
  );

  return c.json({
    success: true,
    data: {
      id: inviteId,
      inviteLink: buildInviteLink(c.req.url, rawToken),
      expiresAt,
    },
    requestId: c.get('requestId'),
  });
});

adminRoutes.post('/invites/:id/revoke', idempotencyMiddleware(), async (c) => {
  const tenantId = requireTenant(c);
  requireRole(c, 'admin');
  const inviteId = c.req.param('id');

  const result = await execute(
    c.env.DB,
    `UPDATE teacher_invites SET status = 'revoked', updated_at = ?
     WHERE id = ? AND tenant_id = ? AND status = 'pending'`,
    [Date.now(), inviteId, tenantId]
  );

  if (result.meta.changes === 0) {
    throw ApiError.badRequest('Invite not found or not pending');
  }

  return c.json({
    success: true,
    data: { id: inviteId, status: 'revoked' },
    requestId: c.get('requestId'),
  });
});
