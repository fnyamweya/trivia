/**
 * Global Error Handler
 * 
 * Provides consistent error responses and logging for all API errors.
 */

import type { Context } from 'hono';
import { ZodError } from 'zod';
import { ERROR_CODES } from '@trivia/shared';
import type { Env, Variables } from '../types/env.js';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(ERROR_CODES.VALIDATION_ERROR, message, 400, details);
  }

  static unauthorized(message: string = 'Unauthorized'): ApiError {
    return new ApiError(ERROR_CODES.UNAUTHORIZED, message, 401);
  }

  static forbidden(message: string = 'Forbidden'): ApiError {
    return new ApiError(ERROR_CODES.FORBIDDEN, message, 403);
  }

  static notFound(resource: string = 'Resource'): ApiError {
    return new ApiError(ERROR_CODES.NOT_FOUND, `${resource} not found`, 404);
  }

  static conflict(message: string): ApiError {
    return new ApiError('CONFLICT', message, 409);
  }

  static tooManyRequests(message: string = 'Rate limit exceeded'): ApiError {
    return new ApiError(ERROR_CODES.RATE_LIMITED, message, 429);
  }

  static internal(message: string = 'Internal server error'): ApiError {
    return new ApiError(ERROR_CODES.INTERNAL_ERROR, message, 500);
  }
}

export async function errorHandler(
  error: Error,
  c: Context<{ Bindings: Env; Variables: Variables }>
): Promise<Response> {
  const requestId = c.get('requestId') ?? 'unknown';

  // Log the error
  console.error(JSON.stringify({
    level: 'error',
    event: 'unhandled_error',
    requestId,
    error: {
      name: error.name,
      message: error.message,
      stack: c.env.ENVIRONMENT === 'development' ? error.stack : undefined,
    },
    timestamp: new Date().toISOString(),
  }));

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return c.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Validation failed',
          details: {
            issues: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
          requestId,
        },
      },
      400
    );
  }

  // Handle API errors
  if (error instanceof ApiError) {
    return c.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId,
        },
      },
      error.status as 400 | 401 | 403 | 404 | 409 | 429 | 500
    );
  }

  // Handle unknown errors
  return c.json(
    {
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: c.env.ENVIRONMENT === 'development' ? error.message : 'Internal server error',
        requestId,
      },
    },
    500
  );
}
