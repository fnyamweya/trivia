/**
 * Environment type definitions
 * 
 * Note: In production, run `wrangler types` to generate these automatically.
 * This file provides a fallback for development and type hints.
 */

export interface Env {
  // D1 Database
  DB: D1Database;

  // Durable Objects
  SESSION_DO: DurableObjectNamespace;

  // Queues
  ANALYTICS_QUEUE: Queue<unknown>;

  // Static Assets
  ASSETS: Fetcher;

  // Environment Variables
  ENVIRONMENT: 'development' | 'staging' | 'production';
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  API_VERSION: string;

  // Secrets (set via wrangler secret put)
  JWT_SECRET: string;
  JWT_REFRESH_SECRET?: string;
}

export interface Variables {
  requestId: string;
  startTime: number;
  user?: AuthUser;
  tenantId?: string;
}

export interface AuthUser {
  id: string;
  tenantId: string;
  role: 'admin' | 'teacher' | 'student';
  sessionId?: string;
  teamId?: string;
}
