/**
 * Shared constants for Trivia Tug-of-War
 */

// ============================================================================
// Game Constants
// ============================================================================

/** Starting position for tug-of-war (center) */
export const TUG_START_POSITION = 50;

/** Minimum position (Team A wins) */
export const TUG_MIN_POSITION = 0;

/** Maximum position (Team B wins) */
export const TUG_MAX_POSITION = 100;

/** Default points per correct answer */
export const DEFAULT_POINTS_PER_CORRECT = 10;

/** Default time limit per question in ms */
export const DEFAULT_TIME_LIMIT_MS = 30000;

/** Minimum time limit per question in ms */
export const MIN_TIME_LIMIT_MS = 5000;

/** Maximum time limit per question in ms */
export const MAX_TIME_LIMIT_MS = 120000;

/** Default number of questions per game */
export const DEFAULT_QUESTION_COUNT = 10;

/** Maximum questions per game */
export const MAX_QUESTION_COUNT = 100;

/** Streak threshold for bonus */
export const DEFAULT_STREAK_THRESHOLD = 3;

/** Default streak multiplier */
export const DEFAULT_STREAK_MULTIPLIER = 1.5;

// ============================================================================
// Session Constants
// ============================================================================

/** Join code length */
export const JOIN_CODE_LENGTH = 6;

/** Join code character set */
export const JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes confusing chars

/** Maximum players per session */
export const MAX_PLAYERS_PER_SESSION = 60;

/** Maximum teams per session */
export const MAX_TEAMS_PER_SESSION = 4;

/** Session idle timeout in ms (auto-end if no activity) */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Session maximum duration in ms */
export const SESSION_MAX_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

// ============================================================================
// Rate Limits
// ============================================================================

/** Maximum answer submissions per student per question */
export const MAX_ANSWERS_PER_QUESTION = 1;

/** Maximum WS messages per second per client */
export const WS_RATE_LIMIT_PER_SECOND = 10;

/** Maximum API requests per minute per IP */
export const API_RATE_LIMIT_PER_MINUTE = 60;

/** Maximum API requests per minute per teacher */
export const API_RATE_LIMIT_PER_TEACHER = 120;

// ============================================================================
// Pagination Defaults
// ============================================================================

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

// ============================================================================
// JWT Constants
// ============================================================================

/** Access token expiry in seconds */
export const ACCESS_TOKEN_EXPIRY_SECONDS = 60 * 60; // 1 hour

/** Refresh token expiry in seconds */
export const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

/** Student token expiry (session-scoped) in seconds */
export const STUDENT_TOKEN_EXPIRY_SECONDS = 4 * 60 * 60; // 4 hours

// ============================================================================
// WebSocket Constants
// ============================================================================

export const WS_HEARTBEAT_INTERVAL_MS = 30000;
export const WS_RECONNECT_BASE_DELAY_MS = 1000;
export const WS_RECONNECT_MAX_DELAY_MS = 30000;
export const WS_MAX_RECONNECT_ATTEMPTS = 10;
export const WS_CONNECTION_TIMEOUT_MS = 10000;

// ============================================================================
// API Versions
// ============================================================================

export const API_VERSION = 'v1';
export const API_BASE_PATH = `/api/${API_VERSION}`;

// ============================================================================
// HTTP Headers
// ============================================================================

export const HEADER_REQUEST_ID = 'x-request-id';
export const HEADER_IDEMPOTENCY_KEY = 'idempotency-key';
export const HEADER_TENANT_ID = 'x-tenant-id';
export const HEADER_CORRELATION_ID = 'x-correlation-id';

// ============================================================================
// Error Codes
// ============================================================================

export const ERROR_CODES = {
  // Auth errors (1xxx)
  INVALID_CREDENTIALS: 'E1001',
  TOKEN_EXPIRED: 'E1002',
  TOKEN_INVALID: 'E1003',
  UNAUTHORIZED: 'E1004',
  FORBIDDEN: 'E1005',

  // Validation errors (2xxx)
  VALIDATION_ERROR: 'E2001',
  INVALID_JOIN_CODE: 'E2002',
  NICKNAME_TAKEN: 'E2003',
  INVALID_QUESTION_FORMAT: 'E2004',

  // Resource errors (3xxx)
  NOT_FOUND: 'E3001',
  SESSION_NOT_FOUND: 'E3002',
  QUESTION_NOT_FOUND: 'E3003',
  TEAM_NOT_FOUND: 'E3004',

  // State errors (4xxx)
  SESSION_ENDED: 'E4001',
  SESSION_NOT_STARTED: 'E4002',
  ALREADY_ANSWERED: 'E4003',
  QUESTION_EXPIRED: 'E4004',
  PLAYER_KICKED: 'E4005',
  SESSION_FULL: 'E4006',

  // Rate limit errors (5xxx)
  RATE_LIMITED: 'E5001',
  TOO_MANY_REQUESTS: 'E5002',

  // Server errors (9xxx)
  INTERNAL_ERROR: 'E9001',
  DATABASE_ERROR: 'E9002',
  EXTERNAL_SERVICE_ERROR: 'E9003',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// ============================================================================
// Team Colors (Default Palette)
// ============================================================================

export const DEFAULT_TEAM_COLORS = [
  '#EF4444', // Red
  '#3B82F6', // Blue
  '#22C55E', // Green
  '#F59E0B', // Amber
] as const;

export const DEFAULT_TEAM_NAMES = ['Red Team', 'Blue Team', 'Green Team', 'Gold Team'] as const;
