/**
 * Observability Middleware
 * 
 * Provides request ID tracking and structured logging for all API requests.
 */

import type { Context, Next } from 'hono';
import { HEADER_REQUEST_ID } from '@trivia/shared';
import type { Env, Variables } from '../types/env.js';

/**
 * Generates or extracts request ID for tracing
 */
export async function requestIdMiddleware(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next
): Promise<Response> {
  const requestId = c.req.header(HEADER_REQUEST_ID) ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.set('startTime', Date.now());

  await next();

  // Add request ID to response headers
  c.res.headers.set(HEADER_REQUEST_ID, requestId);
  return c.res;
}

/**
 * Structured logging middleware
 */
export async function loggerMiddleware(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next
): Promise<Response> {
  const requestId = c.get('requestId');
  const method = c.req.method;
  const path = c.req.path;
  const userAgent = c.req.header('User-Agent') ?? 'unknown';

  // Log request start at debug level
  if (c.env.LOG_LEVEL === 'debug') {
    console.log(JSON.stringify({
      level: 'debug',
      event: 'request_start',
      requestId,
      method,
      path,
      userAgent,
      timestamp: new Date().toISOString(),
    }));
  }

  await next();

  const duration = Date.now() - c.get('startTime');
  const status = c.res.status;

  // Log request completion
  const logLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  
  console.log(JSON.stringify({
    level: logLevel,
    event: 'request_complete',
    requestId,
    method,
    path,
    status,
    duration,
    timestamp: new Date().toISOString(),
  }));

  return c.res;
}

/**
 * Create a logger instance for a specific context
 */
export function createLogger(requestId: string, env: Env) {
  const shouldLog = (level: string): boolean => {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configuredLevel = env.LOG_LEVEL || 'info';
    return levels.indexOf(level) >= levels.indexOf(configuredLevel);
  };

  return {
    debug: (message: string, data?: Record<string, unknown>) => {
      if (shouldLog('debug')) {
        console.log(JSON.stringify({
          level: 'debug',
          message,
          requestId,
          ...data,
          timestamp: new Date().toISOString(),
        }));
      }
    },
    info: (message: string, data?: Record<string, unknown>) => {
      if (shouldLog('info')) {
        console.log(JSON.stringify({
          level: 'info',
          message,
          requestId,
          ...data,
          timestamp: new Date().toISOString(),
        }));
      }
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      if (shouldLog('warn')) {
        console.warn(JSON.stringify({
          level: 'warn',
          message,
          requestId,
          ...data,
          timestamp: new Date().toISOString(),
        }));
      }
    },
    error: (message: string, error?: Error, data?: Record<string, unknown>) => {
      if (shouldLog('error')) {
        console.error(JSON.stringify({
          level: 'error',
          message,
          requestId,
          error: error ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          } : undefined,
          ...data,
          timestamp: new Date().toISOString(),
        }));
      }
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
