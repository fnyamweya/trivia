/**
 * Authentication Routes
 */

import { Hono } from 'hono';
import {
  teacherLoginSchema,
  studentJoinSchema,
  type TeacherLoginInput,
  type StudentJoinInput,
} from '@trivia/shared';
import { z } from 'zod';
import type { Env, Variables } from '../types/env.js';
import { generateAccessToken } from '../auth/jwt.js';
import { queryOne, execute } from '../db/helpers.js';
import { ApiError } from '../observability/error-handler.js';
import { createRateLimiter } from '../auth/rate-limiter.js';
import { hashPassword, verifyPassword } from '../auth/password.js';

export const authRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Stricter rate limiting for auth endpoints
const authRateLimiter = createRateLimiter(10, 60000); // 10 requests per minute

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  role: string;
}

interface SessionRow {
  id: string;
  tenant_id: string;
  teacher_id: string;
  status: string;
  name: string;
}

interface StudentRow {
  id: string;
  session_id: string;
  team_id: string | null;
  nickname: string;
}

interface TeacherInviteRow {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string | null;
  role: 'teacher' | 'admin';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: number;
}

const teacherAcceptInviteSchema = z.object({
  token: z.string().min(16),
  displayName: z.string().min(2).max(120),
  password: z.string().min(8).max(100),
});

async function hashToken(rawToken: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * POST /v1/auth/teacher/login
 * Teacher login (email + password)
 */
authRoutes.post('/teacher/login', authRateLimiter, async (c) => {
  const body = await c.req.json();
  const input = teacherLoginSchema.parse(body) as TeacherLoginInput;

  // Find user by email
  const user = await queryOne<UserRow>(
    c.env.DB,
    `SELECT id, tenant_id, email, display_name, password_hash, role
     FROM users WHERE email = ?`,
    [input.email]
  );

  if (!user) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  if (!user.password_hash) {
    throw ApiError.unauthorized('Password login is not configured for this account');
  }

  let valid = false;
  try {
    valid = await verifyPassword(input.password, user.password_hash);
  } catch {
    throw ApiError.unauthorized('Invalid credentials');
  }

  if (!valid) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  // Update last login
  await execute(
    c.env.DB,
    `UPDATE users SET last_login_at = ? WHERE id = ?`,
    [Date.now(), user.id]
  );

  // Generate token
  const accessToken = await generateAccessToken(c.env, {
    sub: user.id,
    tenantId: user.tenant_id,
    role: user.role as 'admin' | 'teacher',
  });

  return c.json({
    success: true,
    data: {
      accessToken,
      expiresIn: 3600,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    },
    requestId: c.get('requestId'),
  });
});

/**
 * POST /v1/auth/teacher/accept-invite
 * Accept an admin invite and create or activate teacher account.
 */
authRoutes.post('/teacher/accept-invite', authRateLimiter, async (c) => {
  const body = await c.req.json();
  const input = teacherAcceptInviteSchema.parse(body);
  const now = Date.now();
  const tokenHash = await hashToken(input.token);

  const invite = await queryOne<TeacherInviteRow>(
    c.env.DB,
    `SELECT id, tenant_id, email, display_name, role, status, expires_at
     FROM teacher_invites
     WHERE token_hash = ?`,
    [tokenHash]
  );

  if (!invite) {
    throw ApiError.badRequest('Invalid invite token');
  }

  if (invite.status !== 'pending') {
    throw ApiError.badRequest(`Invite is ${invite.status}`);
  }

  if (invite.expires_at < now) {
    await execute(
      c.env.DB,
      `UPDATE teacher_invites SET status = 'expired', updated_at = ? WHERE id = ?`,
      [now, invite.id]
    );
    throw ApiError.badRequest('Invite has expired');
  }

  const passwordHash = await hashPassword(input.password);

  const existingUser = await queryOne<UserRow>(
    c.env.DB,
    `SELECT id, tenant_id, email, display_name, password_hash, role
     FROM users WHERE tenant_id = ? AND email = ?`,
    [invite.tenant_id, invite.email]
  );

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
    await execute(
      c.env.DB,
      `UPDATE users
       SET display_name = ?, password_hash = ?, role = 'teacher', updated_at = ?
       WHERE id = ?`,
      [input.displayName, passwordHash, now, userId]
    );
  } else {
    userId = crypto.randomUUID();
    await execute(
      c.env.DB,
      `INSERT INTO users (id, tenant_id, email, display_name, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'teacher', ?, ?)`,
      [userId, invite.tenant_id, invite.email, input.displayName, passwordHash, now, now]
    );
  }

  await execute(
    c.env.DB,
    `UPDATE teacher_invites
     SET status = 'accepted', accepted_at = ?, accepted_user_id = ?, updated_at = ?
     WHERE id = ?`,
    [now, userId, now, invite.id]
  );

  const accessToken = await generateAccessToken(c.env, {
    sub: userId,
    tenantId: invite.tenant_id,
    role: 'teacher',
  });

  return c.json({
    success: true,
    data: {
      accessToken,
      expiresIn: 3600,
      user: {
        id: userId,
        email: invite.email,
        displayName: input.displayName,
        role: 'teacher',
      },
    },
    requestId: c.get('requestId'),
  }, 201);
});

/**
 * POST /v1/auth/student/join
 * Student joins a session with join code and nickname
 */
authRoutes.post('/student/join', authRateLimiter, async (c) => {
  const body = await c.req.json();
  const input = studentJoinSchema.parse(body) as StudentJoinInput;

  // Find active session by join code
  const session = await queryOne<SessionRow>(
    c.env.DB,
    `SELECT id, tenant_id, teacher_id, status, name
     FROM sessions 
     WHERE join_code = ? AND status NOT IN ('completed', 'cancelled')`,
    [input.joinCode.toUpperCase()]
  );

  if (!session) {
    throw new ApiError('E2002', 'Invalid join code', 400);
  }

  if (session.status === 'completed') {
    throw new ApiError('E4001', 'This session has ended', 400);
  }

  // Check if nickname is taken in this session
  const existingStudent = await queryOne<StudentRow>(
    c.env.DB,
    `SELECT id FROM students 
     WHERE session_id = ? AND nickname = ? AND connection_status != 'kicked'`,
    [session.id, input.nickname]
  );

  if (existingStudent) {
    throw new ApiError('E2003', 'Nickname already taken in this session', 400);
  }

  // Create student record
  const studentId = crypto.randomUUID();
  const now = Date.now();

  await execute(
    c.env.DB,
    `INSERT INTO students (id, session_id, nickname, connection_status, joined_at, last_seen_at)
     VALUES (?, ?, ?, 'connected', ?, ?)`,
    [studentId, session.id, input.nickname, now, now]
  );

  // Generate student token (session-scoped)
  const accessToken = await generateAccessToken(c.env, {
    sub: studentId,
    tenantId: session.tenant_id,
    role: 'student',
    sessionId: session.id,
  });

  return c.json({
    success: true,
    data: {
      accessToken,
      expiresIn: 14400, // 4 hours
      student: {
        id: studentId,
        nickname: input.nickname,
      },
      session: {
        id: session.id,
        name: session.name,
        status: session.status,
      },
    },
    requestId: c.get('requestId'),
  }, 201);
});

/**
 * POST /v1/auth/refresh
 * Refresh access token (optional - for teacher persistence)
 */
authRoutes.post('/refresh', authRateLimiter, async (c) => {
  // For simplicity, we'll generate a new token if the current one is valid
  // In production, implement proper refresh token rotation
  
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing token');
  }

  const token = authHeader.slice(7);
  
  // Verify and decode existing token (might be expired)
  // For refresh, we'd normally use a separate refresh token
  // This is simplified for the demo
  
  try {
    const { verifyToken } = await import('../auth/jwt.js');
    const payload = await verifyToken(c.env, token);

    // Only teachers can refresh
    if (payload.role === 'student') {
      throw ApiError.forbidden('Students cannot refresh tokens');
    }

    // Generate new token
    const newToken = await generateAccessToken(c.env, {
      sub: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    });

    return c.json({
      success: true,
      data: {
        accessToken: newToken,
        expiresIn: 3600,
      },
      requestId: c.get('requestId'),
    });
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }
});
