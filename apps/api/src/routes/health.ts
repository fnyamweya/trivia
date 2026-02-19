/**
 * Health Check Routes
 */

import { Hono } from 'hono';
import type { Env, Variables } from '../types/env.js';

export const healthRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

healthRoutes.get('/', async (c) => {
  const requestId = c.get('requestId');
  
  // Check D1 connectivity
  let dbStatus = 'healthy';
  try {
    await c.env.DB.prepare('SELECT 1').first();
  } catch (error) {
    dbStatus = 'unhealthy';
  }

  return c.json({
    status: dbStatus === 'healthy' ? 'healthy' : 'degraded',
    version: c.env.API_VERSION,
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
    checks: {
      database: dbStatus,
    },
    requestId,
  });
});

healthRoutes.get('/ready', async (c) => {
  // Readiness probe - check all dependencies
  try {
    await c.env.DB.prepare('SELECT 1').first();
    return c.json({ ready: true });
  } catch {
    return c.json({ ready: false }, 503);
  }
});

healthRoutes.get('/live', (c) => {
  // Liveness probe - just return OK
  return c.json({ alive: true });
});
