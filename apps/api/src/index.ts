/**
 * Trivia Tug-of-War API Worker Entry Point
 * 
 * This is a full-stack Worker that:
 * 1. Serves the SPA frontend via Workers Assets
 * 2. Handles API routes under /api/v1/*
 * 3. Routes WebSocket connections to Durable Objects
 * 4. Processes analytics queue messages
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';

import { authRoutes } from './routes/auth.js';
import { questionRoutes } from './routes/questions.js';
import { sessionRoutes } from './routes/sessions.js';
import { tagRoutes } from './routes/tags.js';
import { topicRoutes } from './routes/topics.js';
import { reportRoutes } from './routes/reports.js';
import { healthRoutes } from './routes/health.js';
import { levelRoutes } from './routes/levels.js';
import { adminRoutes } from './routes/admin.js';

import { requestIdMiddleware, loggerMiddleware } from './observability/middleware.js';
import { errorHandler } from './observability/error-handler.js';
import { rateLimiter } from './auth/rate-limiter.js';

import { SessionDurableObject } from './durable-objects/session-do.js';

import type { Env, Variables } from './types/env.js';

// Re-export Durable Object for Wrangler
export { SessionDurableObject };

// Create Hono app with typed environment
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================================
// Global Middleware
// ============================================================================

// Request ID for tracing
app.use('*', requestIdMiddleware);

// Timing headers for performance monitoring
app.use('*', timing());

// Security headers
app.use('*', secureHeaders());

// CORS configuration
app.use('/api/*', cors({
  origin: (origin) => {
    // Allow same-origin and configured origins
    const allowedOrigins = ['http://localhost:5173', 'http://localhost:8787'];
    if (!origin || allowedOrigins.includes(origin)) {
      return origin || '*';
    }
    // In production, check against allowed domains
    if (origin.endsWith('.pages.dev') || origin.endsWith('.workers.dev')) {
      return origin;
    }
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-ID'],
  exposeHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
  maxAge: 86400,
  credentials: true,
}));

// Structured logging
app.use('/api/*', loggerMiddleware);

// Rate limiting (per IP)
app.use('/api/*', rateLimiter);

// Global error handler
app.onError(errorHandler);

// ============================================================================
// API Routes (versioned under /api/v1)
// ============================================================================

const api = new Hono<{ Bindings: Env; Variables: Variables }>();

// Health check (no auth required)
api.route('/health', healthRoutes);

// Auth routes
api.route('/auth', authRoutes);

// Question bank routes
api.route('/questions', questionRoutes);

// Tag management
api.route('/tags', tagRoutes);

// Topic management
api.route('/topics', topicRoutes);

// Session lifecycle and gameplay
api.route('/sessions', sessionRoutes);

// Reports
api.route('/reports', reportRoutes);

// Levels (ruleset-backed presets)
api.route('/levels', levelRoutes);

// Admin settings + invites
api.route('/admin', adminRoutes);

// Mount API under /api/v1
app.route('/api/v1', api);

// ============================================================================
// WebSocket Route (proxies to Durable Object)
// ============================================================================

app.get('/api/v1/sessions/:sessionId/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 426);
  }

  const sessionId = c.req.param('sessionId');
  const durableObjectId = c.env.SESSION_DO.idFromName(sessionId);
  const stub = c.env.SESSION_DO.get(durableObjectId);

  // Forward the WebSocket request to the Durable Object
  return stub.fetch(c.req.raw);
});

// ============================================================================
// SPA Fallback - Assets are handled by Cloudflare's asset binding
// Non-API routes that don't match static files will serve index.html
// This is configured via "not_found_handling": "single-page-application" in wrangler.jsonc
// ============================================================================

// API 404 handler
app.all('/api/*', (c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
        requestId: c.get('requestId'),
      },
    },
    404
  );
});

// ============================================================================
// Queue Consumer for Analytics
// ============================================================================

interface QueueMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

async function handleQueueBatch(
  batch: MessageBatch<QueueMessage>,
  env: Env
): Promise<void> {
  const events: QueueMessage[] = [];
  
  for (const message of batch.messages) {
    events.push(message.body);
    message.ack();
  }

  // Batch insert analytics events
  if (events.length > 0) {
    try {
      const stmt = env.DB.prepare(`
        INSERT INTO analytics_events (type, payload, timestamp, processed_at)
        VALUES (?, ?, ?, ?)
      `);

      const now = Date.now();
      await env.DB.batch(
        events.map((event) =>
          stmt.bind(
            event.type,
            JSON.stringify(event.payload),
            event.timestamp,
            now
          )
        )
      );
    } catch (error) {
      console.error('Failed to process analytics batch:', error);
      // Re-throw to trigger retry
      throw error;
    }
  }
}

// ============================================================================
// Worker Export
// ============================================================================

export default {
  fetch: app.fetch,
  queue: handleQueueBatch,
} satisfies ExportedHandler<Env, QueueMessage>;
