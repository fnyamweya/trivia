/**
 * Core domain types for Trivia Tug-of-War
 * All types are shared between frontend and backend
 */

// ============================================================================
// Base Types
// ============================================================================

export type UUID = string;
export type Timestamp = number; // Unix timestamp in milliseconds
export type JoinCode = string; // 6-char alphanumeric

// ============================================================================
// Tenant & Users
// ============================================================================

export interface Tenant {
  id: UUID;
  name: string;
  slug: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type UserRole = 'admin' | 'teacher' | 'student';

export interface User {
  id: UUID;
  tenantId: UUID;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Student {
  id: UUID;
  sessionId: UUID;
  nickname: string;
  joinedAt: Timestamp;
  connectionStatus: 'connected' | 'disconnected' | 'kicked';
}

// ============================================================================
// Question Bank
// ============================================================================

export type QuestionType = 'multiple_choice' | 'true_false';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type QuestionStatus = 'draft' | 'published' | 'retired';

export interface Topic {
  id: UUID;
  tenantId: UUID;
  name: string;
  description?: string;
  color?: string;
  createdAt: Timestamp;
}

export interface Tag {
  id: UUID;
  tenantId: UUID;
  name: string;
  createdAt: Timestamp;
}

export interface Answer {
  id: string; // a, b, c, d or 0, 1
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: UUID;
  tenantId: UUID;
  topicId?: UUID;
  type: QuestionType;
  difficulty: DifficultyLevel;
  status: QuestionStatus;
  text: string;
  answers: Answer[];
  explanation?: string;
  timeLimitMs: number;
  points: number;
  tags: Tag[];
  createdBy: UUID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Student-safe version (no correct answer revealed)
export interface QuestionForStudent {
  id: UUID;
  type: QuestionType;
  difficulty: DifficultyLevel;
  text: string;
  answers: Omit<Answer, 'isCorrect'>[];
  timeLimitMs: number;
  points: number;
}

// ============================================================================
// Session & Game
// ============================================================================

export type SessionPhase =
  | 'lobby' // Waiting for players
  | 'ready' // Teams assigned, about to start
  | 'active_question' // Question being displayed
  | 'reveal' // Answer revealed
  | 'paused' // Teacher paused
  | 'completed'; // Game ended

export interface Ruleset {
  id: UUID;
  name: string;
  description?: string;
  questionCount: number;
  timeLimitMsPerQuestion: number;
  pointsPerCorrect: number;
  pointsForSpeed: boolean;
  streakBonus: boolean;
  streakThreshold: number;
  streakMultiplier: number;
  allowLatejoin: boolean;
}

export interface Team {
  id: UUID;
  sessionId: UUID;
  name: string;
  color: string;
  side: 'left' | 'right';
  score: number;
  members: Student[];
}

export interface Session {
  id: UUID;
  tenantId: UUID;
  teacherId: UUID;
  joinCode: JoinCode;
  name: string;
  status: SessionPhase;
  rulesetId?: UUID;
  teams: Team[];
  currentQuestionIndex: number;
  totalQuestions: number;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
}

// ============================================================================
// Game State (Durable Object)
// ============================================================================

export interface TugPosition {
  /** Position from 0 (Team A wins) to 100 (Team B wins), starting at 50 */
  value: number;
  lastEventId: UUID;
  updatedAt: Timestamp;
}

export interface QuestionInstance {
  id: UUID;
  questionId: UUID;
  sessionId: UUID;
  index: number; // 0-based question number
  text: string;
  answers: Answer[]; // Full answers for storage
  correctAnswerId: string;
  timeLimitMs: number;
  points: number;
  startedAt: Timestamp;
  endedAt?: Timestamp;
}

export interface TeamStreak {
  teamId: UUID;
  currentStreak: number;
  maxStreak: number;
}

export interface GameState {
  sessionId: UUID;
  phase: SessionPhase;
  position: TugPosition;
  currentQuestion?: QuestionInstance;
  questionIndex: number;
  totalQuestions: number;
  teams: Team[];
  streaks: Record<UUID, TeamStreak>;
  startedAt?: Timestamp;
  serverTime: Timestamp;
}

// ============================================================================
// Events (Event Sourcing)
// ============================================================================

export type EventType =
  | 'session_created'
  | 'session_started'
  | 'session_ended'
  | 'question_started'
  | 'question_ended'
  | 'answer_submitted'
  | 'tug_moved'
  | 'player_joined'
  | 'player_left'
  | 'player_kicked'
  | 'team_assigned'
  | 'manual_adjust';

export interface BaseEvent {
  id: UUID;
  sessionId: UUID;
  type: EventType;
  timestamp: Timestamp;
  metadata?: Record<string, unknown>;
}

export interface Attempt extends BaseEvent {
  type: 'answer_submitted';
  studentId: UUID;
  teamId: UUID;
  questionInstanceId: UUID;
  answerId: string;
  isCorrect: boolean;
  responseTimeMs: number;
  pointsAwarded: number;
}

export interface StrengthEvent extends BaseEvent {
  type: 'tug_moved';
  teamId: UUID;
  delta: number; // Positive = toward 100, negative = toward 0
  reason: 'correct_answer' | 'streak_bonus' | 'manual_adjust';
  newPosition: number;
  triggeredBy?: UUID; // studentId or teacherId
}

// ============================================================================
// Reports
// ============================================================================

export interface SessionSummary {
  sessionId: UUID;
  name: string;
  totalQuestions: number;
  totalAttempts: number;
  totalStudents: number;
  duration: number;
  winningTeam?: Team;
  finalPosition: number;
  averageResponseTime: number;
  questionBreakdown: QuestionSummary[];
}

export interface QuestionSummary {
  questionInstanceId: UUID;
  questionText: string;
  correctRate: number;
  averageResponseTime: number;
  attemptsByTeam: Record<UUID, number>;
  correctByTeam: Record<UUID, number>;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  cursor?: string;
  hasMore: boolean;
  total?: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  requestId: string;
}

// ============================================================================
// Auth Types
// ============================================================================

export interface JWTPayload {
  sub: UUID; // userId or studentId
  tenantId: UUID;
  role: UserRole;
  sessionId?: UUID; // For students
  teamId?: UUID; // For students
  exp: number;
  iat: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}
