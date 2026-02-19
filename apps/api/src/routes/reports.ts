/**
 * Report Routes
 */

import { Hono } from 'hono';
import { sessionReportQuerySchema, type SessionSummary, type QuestionSummary } from '@trivia/shared';
import type { Env, Variables } from '../types/env.js';
import { requireAuth, requireTenant } from '../auth/jwt.js';
import { queryAll, queryOne } from '../db/helpers.js';
import { ApiError } from '../observability/error-handler.js';

export const reportRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

reportRoutes.use('*', requireAuth(['teacher', 'admin']));

interface SessionRow {
  id: string;
  name: string;
  status: string;
  total_questions: number;
  final_position: number | null;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
}

interface TeamRow {
  id: string;
  name: string;
  color: string;
}

interface AttemptStats {
  total_attempts: number;
  correct_attempts: number;
  avg_response_time: number;
}

interface QuestionStats {
  question_instance_id: string;
  question_text: string;
  total_attempts: number;
  correct_attempts: number;
  avg_response_time: number;
}

interface TeamStats {
  team_id: string;
  attempts: number;
  correct: number;
  avg_time: number;
}

/**
 * GET /v1/reports/sessions/:id/summary
 * Get session summary report
 */
reportRoutes.get('/sessions/:id/summary', async (c) => {
  const tenantId = requireTenant(c);
  const sessionId = c.req.param('id');
  const query = sessionReportQuerySchema.parse(c.req.query());

  // Verify session exists and access
  const session = await queryOne<SessionRow>(
    c.env.DB,
    `SELECT * FROM sessions WHERE id = ? AND tenant_id = ?`,
    [sessionId, tenantId]
  );

  if (!session) {
    throw ApiError.notFound('Session');
  }

  // Get attempt statistics
  const stats = await queryOne<AttemptStats>(
    c.env.DB,
    `SELECT 
       COUNT(*) as total_attempts,
       SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_attempts,
       AVG(response_time_ms) as avg_response_time
     FROM attempts WHERE session_id = ?`,
    [sessionId]
  );

  // Get student count
  const studentCount = await queryOne<{ count: number }>(
    c.env.DB,
    `SELECT COUNT(*) as count FROM students WHERE session_id = ? AND connection_status != 'kicked'`,
    [sessionId]
  );

  // Get teams
  const teams = await queryAll<TeamRow>(
    c.env.DB,
    `SELECT id, name, color FROM teams WHERE session_id = ?`,
    [sessionId]
  );

  // Determine winner based on final position
  let winningTeam: TeamRow | null = null;
  if (session.final_position !== null && teams.length >= 2) {
    // Position < 50 means first team wins, > 50 means second team wins
    if (session.final_position < 50) {
      winningTeam = teams[0];
    } else if (session.final_position > 50) {
      winningTeam = teams[1];
    }
    // Position = 50 is a tie
  }

  const duration = session.ended_at && session.started_at
    ? session.ended_at - session.started_at
    : 0;

  const summary: SessionSummary = {
    sessionId: session.id,
    name: session.name,
    totalQuestions: session.total_questions,
    totalAttempts: stats?.total_attempts ?? 0,
    totalStudents: studentCount?.count ?? 0,
    duration,
    winningTeam: winningTeam ? {
      id: winningTeam.id,
      sessionId,
      name: winningTeam.name,
      color: winningTeam.color,
      side: 'left' as const, // Winner could be either, defaulting
      score: 0,
      members: [],
    } : undefined,
    finalPosition: session.final_position ?? 50,
    averageResponseTime: stats?.avg_response_time ?? 0,
    questionBreakdown: [],
  };

  // Get question breakdown if requested
  if (query.includeQuestions) {
    const questionStats = await queryAll<QuestionStats>(
      c.env.DB,
      `SELECT 
         qi.id as question_instance_id,
         qi.text as question_text,
         COUNT(a.id) as total_attempts,
         SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) as correct_attempts,
         AVG(a.response_time_ms) as avg_response_time
       FROM question_instances qi
       LEFT JOIN attempts a ON qi.id = a.question_instance_id
       WHERE qi.session_id = ?
       GROUP BY qi.id
       ORDER BY qi.index_num`,
      [sessionId]
    );

    // Get per-team stats for each question
    const teamStatsMap = new Map<string, Record<string, { attempts: number; correct: number; avgTime: number }>>();

    for (const qs of questionStats) {
      const teamStats = await queryAll<TeamStats>(
        c.env.DB,
        `SELECT 
           team_id,
           COUNT(*) as attempts,
           SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct,
           AVG(response_time_ms) as avg_time
         FROM attempts
         WHERE question_instance_id = ?
         GROUP BY team_id`,
        [qs.question_instance_id]
      );

      const statsObj: Record<string, { attempts: number; correct: number; avgTime: number }> = {};
      for (const ts of teamStats) {
        statsObj[ts.team_id] = {
          attempts: ts.attempts,
          correct: ts.correct,
          avgTime: ts.avg_time,
        };
      }
      teamStatsMap.set(qs.question_instance_id, statsObj);
    }

    summary.questionBreakdown = questionStats.map((qs) => ({
      questionInstanceId: qs.question_instance_id,
      questionText: qs.question_text,
      correctRate: qs.total_attempts > 0 ? qs.correct_attempts / qs.total_attempts : 0,
      averageResponseTime: qs.avg_response_time,
      attemptsByTeam: Object.fromEntries(
        Object.entries(teamStatsMap.get(qs.question_instance_id) || {}).map(([k, v]) => [k, v.attempts])
      ),
      correctByTeam: Object.fromEntries(
        Object.entries(teamStatsMap.get(qs.question_instance_id) || {}).map(([k, v]) => [k, v.correct])
      ),
    }));
  }

  return c.json({
    success: true,
    data: summary,
    requestId: c.get('requestId'),
  });
});

/**
 * GET /v1/reports/sessions/:id/questions
 * Get detailed question-by-question report
 */
reportRoutes.get('/sessions/:id/questions', async (c) => {
  const tenantId = requireTenant(c);
  const sessionId = c.req.param('id');

  // Verify session
  const session = await queryOne<{ id: string }>(
    c.env.DB,
    `SELECT id FROM sessions WHERE id = ? AND tenant_id = ?`,
    [sessionId, tenantId]
  );

  if (!session) {
    throw ApiError.notFound('Session');
  }

  // Get all question instances with their stats
  const questions = await queryAll<{
    id: string;
    index_num: number;
    text: string;
    answers: string;
    correct_answer_id: string;
    time_limit_ms: number;
    points: number;
    started_at: number;
    ended_at: number | null;
  }>(
    c.env.DB,
    `SELECT * FROM question_instances WHERE session_id = ? ORDER BY index_num`,
    [sessionId]
  );

  const detailedQuestions = await Promise.all(
    questions.map(async (q) => {
      // Get attempts for this question
      const attempts = await queryAll<{
        student_id: string;
        team_id: string;
        answer_id: string;
        is_correct: number;
        response_time_ms: number;
        points_awarded: number;
      }>(
        c.env.DB,
        `SELECT a.student_id, a.team_id, a.answer_id, a.is_correct, a.response_time_ms, a.points_awarded
         FROM attempts a
         WHERE a.question_instance_id = ?`,
        [q.id]
      );

      const totalAttempts = attempts.length;
      const correctAttempts = attempts.filter((a) => a.is_correct).length;
      const avgResponseTime = totalAttempts > 0
        ? attempts.reduce((sum, a) => sum + a.response_time_ms, 0) / totalAttempts
        : 0;

      // Group by answer to see answer distribution
      const answerDistribution: Record<string, number> = {};
      for (const attempt of attempts) {
        answerDistribution[attempt.answer_id] = (answerDistribution[attempt.answer_id] || 0) + 1;
      }

      return {
        questionInstanceId: q.id,
        index: q.index_num,
        text: q.text,
        answers: JSON.parse(q.answers),
        correctAnswerId: q.correct_answer_id,
        timeLimitMs: q.time_limit_ms,
        points: q.points,
        startedAt: q.started_at,
        endedAt: q.ended_at,
        stats: {
          totalAttempts,
          correctAttempts,
          correctRate: totalAttempts > 0 ? correctAttempts / totalAttempts : 0,
          averageResponseTime: avgResponseTime,
          answerDistribution,
        },
      };
    })
  );

  return c.json({
    success: true,
    data: detailedQuestions,
    requestId: c.get('requestId'),
  });
});

/**
 * GET /v1/reports/teacher/recent
 * Get recent sessions for the current teacher
 */
reportRoutes.get('/teacher/recent', async (c) => {
  const tenantId = requireTenant(c);
  const user = c.get('user')!;

  const sessions = await queryAll<SessionRow>(
    c.env.DB,
    `SELECT * FROM sessions 
     WHERE tenant_id = ? AND teacher_id = ?
     ORDER BY created_at DESC
     LIMIT 20`,
    [tenantId, user.id]
  );

  // Get basic stats for each session
  const sessionsWithStats = await Promise.all(
    sessions.map(async (s) => {
      const stats = await queryOne<{ student_count: number; attempt_count: number }>(
        c.env.DB,
        `SELECT 
           (SELECT COUNT(*) FROM students WHERE session_id = ? AND connection_status != 'kicked') as student_count,
           (SELECT COUNT(*) FROM attempts WHERE session_id = ?) as attempt_count`,
        [s.id, s.id]
      );

      return {
        id: s.id,
        name: s.name,
        status: s.status,
        totalQuestions: s.total_questions,
        finalPosition: s.final_position,
        studentCount: stats?.student_count ?? 0,
        attemptCount: stats?.attempt_count ?? 0,
        createdAt: s.created_at,
        startedAt: s.started_at,
        endedAt: s.ended_at,
      };
    })
  );

  return c.json({
    success: true,
    data: sessionsWithStats,
    requestId: c.get('requestId'),
  });
});
