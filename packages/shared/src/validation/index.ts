/**
 * Zod validation schemas for Trivia Tug-of-War
 * Used on both client and server for consistent validation
 */

import { z } from 'zod';

// ============================================================================
// Base Schemas
// ============================================================================

export const uuidSchema = z.string().uuid();
export const timestampSchema = z.number().int().positive();
export const joinCodeSchema = z.string().regex(/^[A-Z0-9]{6}$/, 'Join code must be 6 alphanumeric characters');
export const emailSchema = z.string().email().max(255);
export const nicknameSchema = z.string().min(2).max(20).regex(/^[a-zA-Z0-9_-]+$/, 'Nickname must be alphanumeric');

// ============================================================================
// Auth Schemas
// ============================================================================

export const teacherLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(100),
});

export const studentJoinSchema = z.object({
  joinCode: joinCodeSchema,
  nickname: nicknameSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

// ============================================================================
// Question Schemas
// ============================================================================

export const questionTypeSchema = z.enum(['multiple_choice', 'true_false']);
export const difficultySchema = z.enum(['easy', 'medium', 'hard']);
export const questionStatusSchema = z.enum(['draft', 'published', 'retired']);

export const answerSchema = z.object({
  id: z.string().min(1).max(10),
  text: z.string().min(1).max(500),
  isCorrect: z.boolean(),
});

const baseQuestionSchema = z.object({
  topicId: uuidSchema.optional(),
  type: questionTypeSchema,
  difficulty: difficultySchema,
  text: z.string().min(10).max(1000),
  answers: z.array(answerSchema).min(2).max(6),
  explanation: z.string().max(1000).optional(),
  timeLimitMs: z.number().int().min(5000).max(120000).default(30000),
  points: z.number().int().min(1).max(100).default(10),
  tagIds: z.array(uuidSchema).max(10).optional(),
});

export const createQuestionSchema = baseQuestionSchema.refine(
  (data) => data.answers.filter(a => a.isCorrect).length >= 1,
  { message: 'At least one answer must be marked as correct' }
).refine(
  (data) => data.type !== 'true_false' || data.answers.length === 2,
  { message: 'True/false questions must have exactly 2 answers' }
);

export const updateQuestionSchema = baseQuestionSchema.partial().omit({ type: true });

export const questionQuerySchema = z.object({
  search: z.string().max(100).optional(),
  topicId: uuidSchema.optional(),
  tagId: uuidSchema.optional(),
  difficulty: difficultySchema.optional(),
  status: questionStatusSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const importQuestionsSchema = z.object({
  format: z.enum(['json', 'csv']),
  data: z.string().min(1).max(1000000), // Max 1MB of text
  topicId: uuidSchema.optional(),
  defaultDifficulty: difficultySchema.optional(),
});

// ============================================================================
// Tag & Topic Schemas
// ============================================================================

export const createTagSchema = z.object({
  name: z.string().min(1).max(50),
});

export const createTopicSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

// ============================================================================
// Session Schemas
// ============================================================================

export const createSessionSchema = z.object({
  name: z.string().min(1).max(100),
  rulesetId: uuidSchema.optional(),
});

export const rulesetSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  questionCount: z.number().int().min(1).max(100).default(10),
  timeLimitMsPerQuestion: z.number().int().min(5000).max(120000).default(30000),
  pointsPerCorrect: z.number().int().min(1).max(100).default(10),
  pointsForSpeed: z.boolean().default(true),
  streakBonus: z.boolean().default(true),
  streakThreshold: z.number().int().min(2).max(10).default(3),
  streakMultiplier: z.number().min(1).max(3).default(1.5),
  allowLatejoin: z.boolean().default(true),
});

export const setTeamsSchema = z.object({
  teams: z.array(z.object({
    name: z.string().min(1).max(50),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    memberIds: z.array(uuidSchema).optional(), // Optional for auto-balance
  })).min(2).max(4),
  autoBalance: z.boolean().default(true),
});

export const kickPlayerSchema = z.object({
  reason: z.string().max(200).optional(),
});

// ============================================================================
// WebSocket Message Schemas
// ============================================================================

export const baseClientMessageSchema = z.object({
  type: z.string(),
  clientMsgId: z.string().min(1).max(50).optional(),
  timestamp: timestampSchema.optional(),
});

export const helloMessageSchema = baseClientMessageSchema.extend({
  type: z.literal('HELLO'),
  token: z.string().min(1),
  clientVersion: z.string().min(1).max(20).optional(),
  reconnect: z.boolean().optional(),
  lastEventId: uuidSchema.optional(),
});

export const joinTeamMessageSchema = baseClientMessageSchema.extend({
  type: z.literal('JOIN_TEAM'),
  teamId: z.string().min(1), // Allow non-UUID for flexibility
});

export const submitAnswerMessageSchema = baseClientMessageSchema.extend({
  type: z.literal('SUBMIT_ANSWER'),
  instanceId: z.string().min(1),
  choiceId: z.string().min(1).max(10),
});

export const teacherNextQuestionSchema = baseClientMessageSchema.extend({
  type: z.literal('TEACHER_NEXT_QUESTION'),
  questionId: z.string().optional(),
});

export const teacherPauseSchema = baseClientMessageSchema.extend({
  type: z.literal('TEACHER_PAUSE'),
});

export const teacherResumeSchema = baseClientMessageSchema.extend({
  type: z.literal('TEACHER_RESUME'),
});

export const teacherManualAdjustSchema = baseClientMessageSchema.extend({
  type: z.literal('TEACHER_MANUAL_ADJUST'),
  delta: z.number().int().min(-100).max(100),
  reason: z.string().min(1).max(200).optional(),
});

export const teacherKickPlayerSchema = baseClientMessageSchema.extend({
  type: z.literal('TEACHER_KICK_PLAYER'),
  playerId: z.string().min(1),
});

export const teacherEndGameSchema = baseClientMessageSchema.extend({
  type: z.literal('TEACHER_END_GAME'),
});

export const pingMessageSchema = baseClientMessageSchema.extend({
  type: z.literal('PING'),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  helloMessageSchema,
  joinTeamMessageSchema,
  submitAnswerMessageSchema,
  teacherNextQuestionSchema,
  teacherPauseSchema,
  teacherResumeSchema,
  teacherManualAdjustSchema,
  teacherKickPlayerSchema,
  teacherEndGameSchema,
  pingMessageSchema,
]);

// ============================================================================
// HTTP Request Schemas (with Idempotency)
// ============================================================================

export const idempotencyHeaderSchema = z.object({
  'idempotency-key': z.string().uuid().optional(),
  'x-request-id': z.string().uuid().optional(),
});

// ============================================================================
// Report Query Schemas
// ============================================================================

export const sessionReportQuerySchema = z.object({
  includeQuestions: z.coerce.boolean().default(true),
  includeStudents: z.coerce.boolean().default(false),
});

// ============================================================================
// Type Exports from Schemas
// ============================================================================

export type TeacherLoginInput = z.infer<typeof teacherLoginSchema>;
export type StudentJoinInput = z.infer<typeof studentJoinSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type QuestionQueryInput = z.infer<typeof questionQuerySchema>;
export type ImportQuestionsInput = z.infer<typeof importQuestionsSchema>;
export type CreateTagInput = z.infer<typeof createTagSchema>;
export type CreateTopicInput = z.infer<typeof createTopicSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type RulesetInput = z.infer<typeof rulesetSchema>;
export type SetTeamsInput = z.infer<typeof setTeamsSchema>;
export type KickPlayerInput = z.infer<typeof kickPlayerSchema>;
export type ClientMessageInput = z.infer<typeof clientMessageSchema>;
