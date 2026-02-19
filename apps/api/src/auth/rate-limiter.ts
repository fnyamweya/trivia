/**
 * Rate Limiter Middleware
 * 
 * Simple in-memory rate limiting for API requests.
 * For production scale, consider using Cloudflare's built-in rate limiting
 * or a KV-based distributed rate limiter.
 */

import type { Context, Next } from 'hono';
import { API_RATE_LIMIT_PER_MINUTE } from '@trivia/shared';
import type { Env, Variables } from '../types/env.js';
import { ApiError } from '../observability/error-handler.js';

// In-memory rate limit store (per isolate)
// Note: This is not distributed - for true rate limiting use Cloudflare Rate Limiting
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

const WINDOW_MS = 60 * 1000; // 1 minute window

/**
 * Get client identifier for rate limiting
 */
function getClientId(c: Context): string {
  // Try to get real IP from Cloudflare headers
  const cfConnectingIp = c.req.header('CF-Connecting-IP');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fallback to X-Forwarded-For or remote address
  const forwardedFor = c.req.header('X-Forwarded-For');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  return 'unknown';
}

/**
 * Clean up expired entries periodically
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now - value.windowStart > WINDOW_MS) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Rate limiting middleware
 */
export async function rateLimiter(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next
): Promise<Response | void> {
  // Skip rate limiting in development
  if (c.env.ENVIRONMENT === 'development') {
    await next();
    return;
  }

  const clientId = getClientId(c);
  const now = Date.now();

  // Get or create rate limit entry
  let entry = rateLimitStore.get(clientId);
  
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    // New window
    entry = { count: 0, windowStart: now };
    rateLimitStore.set(clientId, entry);
  }

  entry.count++;

  // Check if over limit
  if (entry.count > API_RATE_LIMIT_PER_MINUTE) {
    const retryAfter = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
    
    c.res.headers.set('Retry-After', String(retryAfter));
    c.res.headers.set('X-RateLimit-Limit', String(API_RATE_LIMIT_PER_MINUTE));
    c.res.headers.set('X-RateLimit-Remaining', '0');
    c.res.headers.set('X-RateLimit-Reset', String(Math.ceil((entry.windowStart + WINDOW_MS) / 1000)));
    
    throw ApiError.tooManyRequests(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
  }

  // Add rate limit headers
  c.res.headers.set('X-RateLimit-Limit', String(API_RATE_LIMIT_PER_MINUTE));
  c.res.headers.set('X-RateLimit-Remaining', String(API_RATE_LIMIT_PER_MINUTE - entry.count));
  c.res.headers.set('X-RateLimit-Reset', String(Math.ceil((entry.windowStart + WINDOW_MS) / 1000)));

  // Periodically clean up (every 100 requests)
  if (entry.count % 100 === 0) {
    cleanupExpiredEntries();
  }

  await next();
}

/**
 * Create a rate limiter for specific endpoints with custom limits
 */
export function createRateLimiter(limit: number, windowMs: number = WINDOW_MS) {
  const store = new Map<string, { count: number; windowStart: number }>();

  return async (
    c: Context<{ Bindings: Env; Variables: Variables }>,
    next: Next
  ): Promise<Response | void> => {
    if (c.env.ENVIRONMENT === 'development') {
      await next();
      return;
    }

    const clientId = getClientId(c);
    const now = Date.now();

    let entry = store.get(clientId);
    
    if (!entry || now - entry.windowStart > windowMs) {
      entry = { count: 0, windowStart: now };
      store.set(clientId, entry);
    }

    entry.count++;

    if (entry.count > limit) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      throw ApiError.tooManyRequests(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
    }

    await next();
  };
}
