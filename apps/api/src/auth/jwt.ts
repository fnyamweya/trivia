/**
 * JWT Authentication Module
 * 
 * Handles token generation, verification, and user context extraction.
 */

import * as jose from 'jose';
import type { Context, Next } from 'hono';
import {
  ACCESS_TOKEN_EXPIRY_SECONDS,
  STUDENT_TOKEN_EXPIRY_SECONDS,
  type JWTPayload,
  type UserRole,
} from '@trivia/shared';
import type { Env, Variables, AuthUser } from '../types/env.js';
import { ApiError } from '../observability/error-handler.js';

/**
 * Generate a JWT access token
 */
export async function generateAccessToken(
  env: Env,
  payload: Omit<JWTPayload, 'exp' | 'iat'>
): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const expirySeconds = payload.role === 'student' 
    ? STUDENT_TOKEN_EXPIRY_SECONDS 
    : ACCESS_TOKEN_EXPIRY_SECONDS;

  return await new jose.SignJWT({
    sub: payload.sub,
    tenantId: payload.tenantId,
    role: payload.role,
    sessionId: payload.sessionId,
    teamId: payload.teamId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expirySeconds}s`)
    .sign(secret);
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(
  env: Env,
  token: string
): Promise<JWTPayload> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);

  try {
    const { payload } = await jose.jwtVerify(token, secret);
    return payload as unknown as JWTPayload;
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      throw ApiError.unauthorized('Token expired');
    }
    throw ApiError.unauthorized('Invalid token');
  }
}

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  return header.slice(7);
}

/**
 * Authentication middleware - requires valid JWT
 */
export function requireAuth(allowedRoles?: UserRole[]) {
  return async (
    c: Context<{ Bindings: Env; Variables: Variables }>,
    next: Next
  ): Promise<Response | void> => {
    const token = extractBearerToken(c.req.header('Authorization'));
    
    if (!token) {
      throw ApiError.unauthorized('Missing authorization token');
    }

    const payload = await verifyToken(c.env, token);

    // Check role if specified
    if (allowedRoles && !allowedRoles.includes(payload.role)) {
      throw ApiError.forbidden('Insufficient permissions');
    }

    // Set user context
    const user: AuthUser = {
      id: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      sessionId: payload.sessionId,
      teamId: payload.teamId,
    };

    c.set('user', user);
    c.set('tenantId', payload.tenantId);

    await next();
  };
}

/**
 * Optional authentication - extracts user if token present
 */
export async function optionalAuth(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next
): Promise<Response | void> {
  const token = extractBearerToken(c.req.header('Authorization'));
  
  if (token) {
    try {
      const payload = await verifyToken(c.env, token);
      c.set('user', {
        id: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        sessionId: payload.sessionId,
        teamId: payload.teamId,
      });
      c.set('tenantId', payload.tenantId);
    } catch {
      // Ignore invalid tokens for optional auth
    }
  }

  await next();
}

/**
 * Tenant isolation middleware - ensures tenant_id matches user's tenant
 */
export function requireTenant(
  c: Context<{ Bindings: Env; Variables: Variables }>
): string {
  const user = c.get('user');
  if (!user?.tenantId) {
    throw ApiError.unauthorized('Tenant context required');
  }
  return user.tenantId;
}

/**
 * Role-based access control helper
 */
export function requireRole(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  ...roles: UserRole[]
): AuthUser {
  const user = c.get('user');
  if (!user) {
    throw ApiError.unauthorized();
  }
  if (!roles.includes(user.role)) {
    throw ApiError.forbidden('Insufficient permissions');
  }
  return user;
}
