/**
 * Session Durable Object
 * 
 * Authoritative game state for a single session.
 * Handles WebSocket connections, game logic, and persistence.
 * 
 * Performance target: p95 < 150ms for answer -> broadcast
 */

import {
  type GameState,
  type SessionPhase,
  type Team,
  type Student,
  type QuestionInstance,
  type Answer,
  type ClientMessage,
  type ServerMessage,
  type HelloMessage,
  type SubmitAnswerMessage,
  type TeacherKickPlayerMessage,
  type TeacherNextQuestionMessage,
  type TeacherManualAdjustMessage,
  type JoinTeamMessage,
  type WsErrorCode,
  TUG_START_POSITION,
  TUG_MIN_POSITION,
  TUG_MAX_POSITION,
  WS_RATE_LIMIT_PER_SECOND,
  clientMessageSchema,
} from '@trivia/shared';
import { verifyToken } from '../auth/jwt.js';
import type { Env, AuthUser } from '../types/env.js';

// ============================================================================
// Types
// ============================================================================

interface ConnectedClient {
  webSocket: WebSocket;
  userId: string;
  role: 'teacher' | 'student';
  teamId?: string;
  nickname?: string;
  lastMessageTime: number;
  messageCount: number;
  messageWindowStart: number;
}

interface StoredState {
  sessionId: string;
  tenantId: string;
  phase: SessionPhase;
  position: number;
  questionIds: string[];
  currentQuestionIndex: number;
  currentQuestion?: QuestionInstance;
  teams: Team[];
  streaks: Record<string, { current: number; max: number }>;
  startedAt?: number;
  lastEventId: string;
  snapshotVersion: number;
}

interface RulesetConfig {
  questionCount: number;
  timeLimitMsPerQuestion: number;
  pointsPerCorrect: number;
  pointsForSpeed: boolean;
  streakBonus: boolean;
  streakThreshold: number;
  streakMultiplier: number;
}

interface AnswerRecord {
  studentId: string;
  teamId: string;
  answerId: string;
  isCorrect: boolean;
  responseTimeMs: number;
  pointsAwarded: number;
  timestamp: number;
}

// ============================================================================
// Durable Object
// ============================================================================

export class SessionDurableObject implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private clients: Map<WebSocket, ConnectedClient> = new Map();
  private storedState: StoredState | null = null;
  private ruleset: RulesetConfig | null = null;
  private questionTimer: number | null = null;
  private answersThisQuestion: Map<string, AnswerRecord> = new Map(); // studentId -> answer

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Set up WebSocket hibernation for better scaling
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{"type":"PING"}', '{"type":"PONG"}')
    );
  }

  // ============================================================================
  // Fetch Handler
  // ============================================================================

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // Internal API routes
    switch (url.pathname) {
      case '/init':
        return this.handleInit(request);
      case '/end':
        return this.handleEnd();
      case '/state':
        return this.handleGetState(url);
      case '/answer':
        return this.handleHttpAnswer(request);
      case '/kick':
        return this.handleKick(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  // ============================================================================
  // WebSocket Handling
  // ============================================================================

  private async handleWebSocketUpgrade(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept with hibernation
    this.state.acceptWebSocket(server);

    // Initialize client tracking (auth happens in HELLO message)
    const clientData: ConnectedClient = {
      webSocket: server,
      userId: '',
      role: 'student',
      lastMessageTime: Date.now(),
      messageCount: 0,
      messageWindowStart: Date.now(),
    };
    this.clients.set(server, clientData);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const client = this.clients.get(ws);
    if (!client) {
      ws.close(1008, 'Unknown client');
      return;
    }

    // Rate limiting
    const now = Date.now();
    if (now - client.messageWindowStart > 1000) {
      client.messageWindowStart = now;
      client.messageCount = 0;
    }
    client.messageCount++;

    if (client.messageCount > WS_RATE_LIMIT_PER_SECOND) {
      this.sendError(ws, 'RATE_LIMITED', 'Too many messages');
      return;
    }

    client.lastMessageTime = now;

    // Parse message
    const data = typeof message === 'string' ? message : new TextDecoder().decode(message);
    let parsed: ClientMessage;

    try {
      const raw = JSON.parse(data);
      parsed = clientMessageSchema.parse(raw) as ClientMessage;
    } catch {
      this.sendError(ws, 'INVALID_MESSAGE', 'Invalid message format');
      return;
    }

    // Handle message based on type
    try {
      switch (parsed.type) {
        case 'HELLO':
          await this.handleHello(ws, client, parsed);
          break;
        case 'JOIN_TEAM':
          await this.handleJoinTeam(ws, client, parsed);
          break;
        case 'SUBMIT_ANSWER':
          await this.handleSubmitAnswer(ws, client, parsed);
          break;
        case 'TEACHER_NEXT_QUESTION':
          await this.handleNextQuestion(ws, client, parsed);
          break;
        case 'TEACHER_PAUSE':
          await this.handlePause(ws, client);
          break;
        case 'TEACHER_RESUME':
          await this.handleResume(ws, client);
          break;
        case 'TEACHER_MANUAL_ADJUST':
          await this.handleManualAdjust(ws, client, parsed);
          break;
        case 'TEACHER_KICK_PLAYER':
          await this.handleTeacherKick(ws, client, parsed);
          break;
        case 'TEACHER_END_GAME':
          await this.handleTeacherEndGame(ws, client);
          break;
        case 'PING':
          this.send(ws, { type: 'PONG', requestId: crypto.randomUUID(), timestamp: now });
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.sendError(ws, 'INTERNAL_ERROR', 'Failed to process message', parsed.clientMsgId);
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    const client = this.clients.get(ws);
    if (client && client.userId) {
      // Update connection status in D1
      await this.updateStudentConnectionStatus(client.userId, 'disconnected');
      
      // Broadcast roster update
      this.broadcastRosterUpdate();
    }
    this.clients.delete(ws);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error);
    this.clients.delete(ws);
  }

  // ============================================================================
  // Message Handlers
  // ============================================================================

  private async handleHello(
    ws: WebSocket,
    client: ConnectedClient,
    message: HelloMessage
  ): Promise<void> {
    // Load state if needed
    await this.loadState();

    if (!this.storedState) {
      this.sendError(ws, 'SESSION_NOT_FOUND', 'Session not initialized');
      ws.close(1008, 'Session not found');
      return;
    }

    // Verify token
    let user: AuthUser;
    try {
      const payload = await verifyToken(this.env, message.token);
      user = {
        id: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role as 'teacher' | 'student',
        sessionId: payload.sessionId,
        teamId: payload.teamId,
      };
    } catch {
      this.sendError(ws, 'INVALID_TOKEN', 'Invalid or expired token');
      ws.close(1008, 'Invalid token');
      return;
    }

    // Verify session access
    if (user.role === 'student' && user.sessionId !== this.storedState.sessionId) {
      this.sendError(ws, 'NOT_AUTHORIZED', 'Not authorized for this session');
      ws.close(1008, 'Not authorized');
      return;
    }

    // Update client info
    client.userId = user.id;
    client.role = user.role as 'teacher' | 'student';
    client.teamId = user.teamId;

    // Update connection status
    if (user.role === 'student') {
      await this.updateStudentConnectionStatus(user.id, 'connected');
    }

    // Send welcome message
    this.send(ws, {
      type: 'WELCOME',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      clientMsgId: message.clientMsgId,
      serverTime: Date.now(),
      sessionId: this.storedState.sessionId,
      role: user.role === 'admin' ? 'teacher' : user.role,
      userId: user.id,
      teamId: user.teamId,
      payload: {
        sessionId: this.storedState.sessionId,
        phase: this.storedState.phase,
        position: this.storedState.position,
        teams: this.storedState.teams,
      },
    });

    // Send current state snapshot
    this.sendStateSnapshot(ws, client.role);

    // Broadcast roster update
    this.broadcastRosterUpdate();
  }

  private async handleJoinTeam(
    ws: WebSocket,
    client: ConnectedClient,
    message: JoinTeamMessage
  ): Promise<void> {
    if (client.role !== 'student') {
      this.sendError(ws, 'NOT_AUTHORIZED', 'Only students can join teams', message.clientMsgId);
      return;
    }

    if (!this.storedState) return;

    const team = this.storedState.teams.find((t) => t.id === message.teamId);
    if (!team) {
      this.sendError(ws, 'NOT_AUTHORIZED', 'Team not found', message.clientMsgId);
      return;
    }

    // Update in D1
    await this.env.DB.prepare(
      `UPDATE students SET team_id = ? WHERE id = ?`
    ).bind(message.teamId, client.userId).run();

    client.teamId = message.teamId;

    // Send ack
    this.send(ws, {
      type: 'ACK',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      clientMsgId: message.clientMsgId,
    });

    // Refresh and broadcast roster
    await this.loadTeams();
    this.broadcastRosterUpdate();
  }

  private async handleSubmitAnswer(
    ws: WebSocket,
    client: ConnectedClient,
    message: SubmitAnswerMessage
  ): Promise<void> {
    if (client.role !== 'student') {
      this.sendError(ws, 'NOT_AUTHORIZED', 'Only students can submit answers', message.clientMsgId);
      return;
    }

    if (!this.storedState || !this.storedState.currentQuestion) {
      this.sendError(ws, 'INVALID_MESSAGE', 'No active question', message.clientMsgId);
      return;
    }

    if (this.storedState.phase !== 'active_question') {
      this.sendError(ws, 'INVALID_MESSAGE', 'Not accepting answers', message.clientMsgId);
      return;
    }

    if (message.instanceId !== this.storedState.currentQuestion.id) {
      this.sendError(ws, 'QUESTION_EXPIRED', 'Question has changed', message.clientMsgId);
      return;
    }

    // Check if already answered
    if (this.answersThisQuestion.has(client.userId)) {
      this.sendError(ws, 'ALREADY_ANSWERED', 'Already submitted an answer', message.clientMsgId);
      return;
    }

    // Validate answer
    const question = this.storedState.currentQuestion;
    const answer = question.answers.find((a) => a.id === message.choiceId);
    if (!answer) {
      this.sendError(ws, 'INVALID_ANSWER', 'Invalid answer option', message.clientMsgId);
      return;
    }

    const now = Date.now();
    const responseTimeMs = now - question.startedAt;
    const isCorrect = answer.isCorrect;

    // Calculate points
    let pointsAwarded = 0;
    if (isCorrect) {
      pointsAwarded = question.points;
      // Speed bonus (faster = more points, up to 50% bonus)
      if (this.ruleset?.pointsForSpeed) {
        const speedFactor = Math.max(0, 1 - responseTimeMs / question.timeLimitMs);
        pointsAwarded += Math.floor(question.points * 0.5 * speedFactor);
      }
    }

    // Record the answer
    const answerRecord: AnswerRecord = {
      studentId: client.userId,
      teamId: client.teamId!,
      answerId: message.choiceId,
      isCorrect,
      responseTimeMs,
      pointsAwarded,
      timestamp: now,
    };
    this.answersThisQuestion.set(client.userId, answerRecord);

    // Persist attempt to D1
    const attemptId = crypto.randomUUID();
    await this.env.DB.prepare(
      `INSERT INTO attempts (id, session_id, question_instance_id, student_id, team_id, answer_id, is_correct, response_time_ms, points_awarded, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      attemptId,
      this.storedState.sessionId,
      question.id,
      client.userId,
      client.teamId,
      message.choiceId,
      isCorrect ? 1 : 0,
      responseTimeMs,
      pointsAwarded,
      now
    ).run();

    // Calculate and apply tug movement
    let delta = 0;
    if (isCorrect && client.teamId) {
      // Determine which direction to move (team 0 = negative, team 1 = positive)
      const teamIndex = this.storedState.teams.findIndex((t) => t.id === client.teamId);
      const basePoints = pointsAwarded;
      delta = teamIndex === 0 ? -basePoints / 10 : basePoints / 10;

      // Update streaks
      const streak = this.storedState.streaks[client.teamId] || { current: 0, max: 0 };
      streak.current++;
      streak.max = Math.max(streak.max, streak.current);

      // Apply streak bonus
      if (
        this.ruleset?.streakBonus &&
        streak.current >= (this.ruleset.streakThreshold || 3)
      ) {
        delta *= this.ruleset.streakMultiplier || 1.5;
      }

      this.storedState.streaks[client.teamId] = streak;

      // Reset opponent's streak
      for (const team of this.storedState.teams) {
        if (team.id !== client.teamId) {
          this.storedState.streaks[team.id] = { 
            current: 0, 
            max: this.storedState.streaks[team.id]?.max || 0 
          };
        }
      }

      // Apply position change
      const newPosition = Math.max(
        TUG_MIN_POSITION,
        Math.min(TUG_MAX_POSITION, this.storedState.position + delta)
      );
      this.storedState.position = newPosition;
      this.storedState.lastEventId = attemptId;

      // Persist strength event
      await this.env.DB.prepare(
        `INSERT INTO strength_events (id, session_id, team_id, delta, reason, new_position, triggered_by, occurred_at)
         VALUES (?, ?, ?, ?, 'correct_answer', ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        this.storedState.sessionId,
        client.teamId,
        Math.round(delta * 10),
        Math.round(newPosition),
        client.userId,
        now
      ).run();

      // Broadcast tug update to all clients
      this.broadcast({
        type: 'TUG_UPDATE',
        requestId: crypto.randomUUID(),
        timestamp: now,
        position: newPosition,
        lastEventId: attemptId,
        delta,
        reason: 'correct_answer',
        teamId: client.teamId,
      });
    }

    // Send result to the submitting student
    this.send(ws, {
      type: 'ANSWER_RESULT',
      requestId: crypto.randomUUID(),
      timestamp: now,
      clientMsgId: message.clientMsgId,
      correct: isCorrect,
      correctAnswerId: question.correctAnswerId,
      delta,
      newPosition: this.storedState.position,
      pointsAwarded,
      responseTimeMs,
    });

    // Save state
    await this.saveState();
  }

  private async handleNextQuestion(
    ws: WebSocket,
    client: ConnectedClient,
    message: TeacherNextQuestionMessage
  ): Promise<void> {
    if (client.role !== 'teacher') {
      this.sendError(ws, 'NOT_AUTHORIZED', 'Only teacher can advance questions', message.clientMsgId);
      return;
    }

    if (!this.storedState) return;

    // End current question if active
    if (this.storedState.phase === 'active_question' && this.storedState.currentQuestion) {
      await this.endCurrentQuestion();
    }

    // Check if there are more questions
    const nextIndex = this.storedState.currentQuestionIndex + 1;
    if (nextIndex >= this.storedState.questionIds.length) {
      // Game over
      await this.endGame();
      this.send(ws, {
        type: 'ACK',
        requestId: crypto.randomUUID(),
        timestamp: Date.now(),
        clientMsgId: message.clientMsgId,
      });
      return;
    }

    // Start next question
    await this.startQuestion(nextIndex);

    this.send(ws, {
      type: 'ACK',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      clientMsgId: message.clientMsgId,
    });
  }

  private async handlePause(_ws: WebSocket, client: ConnectedClient): Promise<void> {
    if (client.role !== 'teacher') return;
    if (!this.storedState || this.storedState.phase !== 'active_question') return;

    const previousPhase = this.storedState.phase;
    this.storedState.phase = 'paused';
    await this.saveState();

    this.broadcast({
      type: 'PHASE_CHANGE',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      phase: 'paused',
      previousPhase,
    });
  }

  private async handleResume(_ws: WebSocket, client: ConnectedClient): Promise<void> {
    if (client.role !== 'teacher') return;
    if (!this.storedState || this.storedState.phase !== 'paused') return;

    this.storedState.phase = 'active_question';
    await this.saveState();

    this.broadcast({
      type: 'PHASE_CHANGE',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      phase: 'active_question',
      previousPhase: 'paused',
    });
  }

  private async handleManualAdjust(
    ws: WebSocket,
    client: ConnectedClient,
    message: TeacherManualAdjustMessage
  ): Promise<void> {
    if (client.role !== 'teacher') return;
    if (!this.storedState) return;

    const delta = Math.max(-100, Math.min(100, message.delta));
    const newPosition = Math.max(
      TUG_MIN_POSITION,
      Math.min(TUG_MAX_POSITION, this.storedState.position + delta)
    );

    this.storedState.position = newPosition;
    this.storedState.lastEventId = crypto.randomUUID();
    await this.saveState();

    // Persist event
    await this.env.DB.prepare(
      `INSERT INTO strength_events (id, session_id, team_id, delta, reason, new_position, triggered_by, occurred_at)
       VALUES (?, ?, ?, ?, 'manual_adjust', ?, ?, ?)`
    ).bind(
      this.storedState.lastEventId,
      this.storedState.sessionId,
      this.storedState.teams[delta > 0 ? 1 : 0]?.id || '',
      Math.round(delta * 10),
      Math.round(newPosition),
      client.userId,
      Date.now()
    ).run();

    this.broadcast({
      type: 'TUG_UPDATE',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      position: newPosition,
      lastEventId: this.storedState.lastEventId,
      delta,
      reason: 'manual_adjust',
      teamId: this.storedState.teams[delta > 0 ? 1 : 0]?.id || '',
    });

    this.send(ws, {
      type: 'ACK',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      clientMsgId: message.clientMsgId,
    });
  }

  private async handleTeacherKick(
    ws: WebSocket,
    client: ConnectedClient,
    message: TeacherKickPlayerMessage
  ): Promise<void> {
    if (client.role !== 'teacher') return;

    await this.kickStudent(message.playerId, 'Kicked by teacher');

    this.send(ws, {
      type: 'ACK',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      clientMsgId: message.clientMsgId,
    });
  }

  private async handleTeacherEndGame(_ws: WebSocket, client: ConnectedClient): Promise<void> {
    if (client.role !== 'teacher') return;
    await this.endGame();
  }

  // ============================================================================
  // Internal API Handlers
  // ============================================================================

  private async handleInit(request: Request): Promise<Response> {
    const body = await request.json() as {
      sessionId: string;
      tenantId: string;
      questionIds: string[];
      rulesetId?: string;
    };

    // Initialize state
    this.storedState = {
      sessionId: body.sessionId,
      tenantId: body.tenantId,
      phase: 'ready',
      position: TUG_START_POSITION,
      questionIds: body.questionIds,
      currentQuestionIndex: -1,
      teams: [],
      streaks: {},
      startedAt: Date.now(),
      lastEventId: crypto.randomUUID(),
      snapshotVersion: 1,
    };

    // Load teams
    await this.loadTeams();

    // Load ruleset if provided
    if (body.rulesetId) {
      const ruleset = await this.env.DB.prepare(
        `SELECT * FROM rulesets WHERE id = ?`
      ).bind(body.rulesetId).first();

      if (ruleset) {
        this.ruleset = {
          questionCount: ruleset.question_count as number,
          timeLimitMsPerQuestion: ruleset.time_limit_ms_per_question as number,
          pointsPerCorrect: ruleset.points_per_correct as number,
          pointsForSpeed: (ruleset.points_for_speed as number) === 1,
          streakBonus: (ruleset.streak_bonus as number) === 1,
          streakThreshold: ruleset.streak_threshold as number,
          streakMultiplier: ruleset.streak_multiplier as number,
        };
      }
    }

    await this.saveState();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleEnd(): Promise<Response> {
    await this.loadState();
    
    if (this.storedState) {
      await this.endGame();
    }

    return new Response(
      JSON.stringify({ position: this.storedState?.position ?? TUG_START_POSITION }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private async handleGetState(url: URL): Promise<Response> {
    await this.loadState();

    if (!this.storedState) {
      return new Response(JSON.stringify({ error: 'Not initialized' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const role = url.searchParams.get('role') || 'student';
    const state = this.buildGameState(role === 'teacher');

    return new Response(JSON.stringify(state), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleHttpAnswer(request: Request): Promise<Response> {
    const body = await request.json() as {
      studentId: string;
      teamId: string;
      questionInstanceId: string;
      answerId: string;
    };

    await this.loadState();

    if (!this.storedState || !this.storedState.currentQuestion) {
      return new Response(JSON.stringify({ message: 'No active question' }), { status: 400 });
    }

    if (this.storedState.phase !== 'active_question') {
      return new Response(JSON.stringify({ message: 'Not accepting answers' }), { status: 400 });
    }

    if (body.questionInstanceId !== this.storedState.currentQuestion.id) {
      return new Response(JSON.stringify({ message: 'Question expired' }), { status: 400 });
    }

    if (this.answersThisQuestion.has(body.studentId)) {
      return new Response(JSON.stringify({ message: 'Already answered' }), { status: 400 });
    }

    // Process answer similar to WS handler...
    const question = this.storedState.currentQuestion;
    const answer = question.answers.find((a) => a.id === body.answerId);
    if (!answer) {
      return new Response(JSON.stringify({ message: 'Invalid answer' }), { status: 400 });
    }

    const now = Date.now();
    const responseTimeMs = now - question.startedAt;
    const isCorrect = answer.isCorrect;
    const pointsAwarded = isCorrect ? question.points : 0;

    // Record answer
    const answerRecord: AnswerRecord = {
      studentId: body.studentId,
      teamId: body.teamId,
      answerId: body.answerId,
      isCorrect,
      responseTimeMs,
      pointsAwarded,
      timestamp: now,
    };
    this.answersThisQuestion.set(body.studentId, answerRecord);

    // Persist and broadcast (simplified)
    const attemptId = crypto.randomUUID();
    await this.env.DB.prepare(
      `INSERT INTO attempts (id, session_id, question_instance_id, student_id, team_id, answer_id, is_correct, response_time_ms, points_awarded, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      attemptId, this.storedState.sessionId, question.id, body.studentId,
      body.teamId, body.answerId, isCorrect ? 1 : 0, responseTimeMs, pointsAwarded, now
    ).run();

    return new Response(JSON.stringify({
      correct: isCorrect,
      pointsAwarded,
      responseTimeMs,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  private async handleKick(request: Request): Promise<Response> {
    const body = await request.json() as { studentId: string; reason?: string };
    await this.kickStudent(body.studentId, body.reason);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ============================================================================
  // Game Logic
  // ============================================================================

  private async startQuestion(index: number): Promise<void> {
    if (!this.storedState) return;

    const questionId = this.storedState.questionIds[index];
    
    // Load question from D1
    const questionRow = await this.env.DB.prepare(
      `SELECT * FROM questions WHERE id = ?`
    ).bind(questionId).first();

    if (!questionRow) {
      console.error('Question not found:', questionId);
      return;
    }

    const now = Date.now();
    const instanceId = crypto.randomUUID();
    const answers = JSON.parse(questionRow.answers as string) as Answer[];
    const correctAnswer = answers.find((a) => a.isCorrect);

    const questionInstance: QuestionInstance = {
      id: instanceId,
      questionId,
      sessionId: this.storedState.sessionId,
      index,
      text: questionRow.text as string,
      answers,
      correctAnswerId: correctAnswer?.id || 'a',
      timeLimitMs: this.ruleset?.timeLimitMsPerQuestion || (questionRow.time_limit_ms as number),
      points: this.ruleset?.pointsPerCorrect || (questionRow.points as number),
      startedAt: now,
    };

    // Persist question instance
    await this.env.DB.prepare(
      `INSERT INTO question_instances (id, session_id, question_id, index_num, text, answers, correct_answer_id, time_limit_ms, points, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      instanceId,
      this.storedState.sessionId,
      questionId,
      index,
      questionInstance.text,
      JSON.stringify(answers),
      questionInstance.correctAnswerId,
      questionInstance.timeLimitMs,
      questionInstance.points,
      now
    ).run();

    // Update state
    this.storedState.currentQuestion = questionInstance;
    this.storedState.currentQuestionIndex = index;
    this.storedState.phase = 'active_question';
    this.storedState.snapshotVersion++;
    this.answersThisQuestion.clear();

    await this.saveState();

    // Broadcast question (student-safe version without correct answers)
    const studentSafeQuestion = {
      id: questionInstance.id,
      type: questionRow.type as string,
      difficulty: questionRow.difficulty as string,
      text: questionInstance.text,
      answers: answers.map((a) => ({ id: a.id, text: a.text })),
      timeLimitMs: questionInstance.timeLimitMs,
      points: questionInstance.points,
    };

    this.broadcast({
      type: 'QUESTION',
      requestId: crypto.randomUUID(),
      timestamp: now,
      question: studentSafeQuestion,
      questionIndex: index,
      totalQuestions: this.storedState.questionIds.length,
      timeLimitMs: questionInstance.timeLimitMs,
      startsAt: now,
    });

    // Set timer for auto-end
    // Note: In production, use Durable Object alarms for better reliability
    this.questionTimer = setTimeout(
      () => this.endCurrentQuestion(),
      questionInstance.timeLimitMs
    ) as unknown as number;
  }

  private async endCurrentQuestion(): Promise<void> {
    if (!this.storedState || !this.storedState.currentQuestion) return;

    // Clear timer
    if (this.questionTimer) {
      clearTimeout(this.questionTimer);
      this.questionTimer = null;
    }

    const question = this.storedState.currentQuestion;
    const now = Date.now();

    // Update question instance end time
    await this.env.DB.prepare(
      `UPDATE question_instances SET ended_at = ? WHERE id = ?`
    ).bind(now, question.id).run();

    // Calculate stats
    const attempts = Array.from(this.answersThisQuestion.values());
    const totalAttempts = attempts.length;
    const correctAttempts = attempts.filter((a) => a.isCorrect).length;

    const teamStats: Record<string, { attempts: number; correct: number; avgTime: number }> = {};
    for (const team of this.storedState.teams) {
      const teamAttempts = attempts.filter((a) => a.teamId === team.id);
      teamStats[team.id] = {
        attempts: teamAttempts.length,
        correct: teamAttempts.filter((a) => a.isCorrect).length,
        avgTime: teamAttempts.length > 0
          ? teamAttempts.reduce((sum, a) => sum + a.responseTimeMs, 0) / teamAttempts.length
          : 0,
      };
    }

    // Change phase to reveal
    this.storedState.phase = 'reveal';
    await this.saveState();

    // Broadcast reveal
    this.broadcast({
      type: 'QUESTION_REVEAL',
      requestId: crypto.randomUUID(),
      timestamp: now,
      questionInstanceId: question.id,
      correctAnswerId: question.correctAnswerId,
      explanation: undefined, // Could include if stored
      stats: {
        totalAttempts,
        correctAttempts,
        teamStats,
      },
    });
  }

  private async endGame(): Promise<void> {
    if (!this.storedState) return;

    const now = Date.now();

    // End current question if active
    if (this.storedState.currentQuestion) {
      await this.endCurrentQuestion();
    }

    // Update session status in D1
    await this.env.DB.prepare(
      `UPDATE sessions SET status = 'completed', final_position = ?, ended_at = ? WHERE id = ?`
    ).bind(
      Math.round(this.storedState.position),
      now,
      this.storedState.sessionId
    ).run();

    this.storedState.phase = 'completed';
    await this.saveState();

    // Determine winner
    let winner: Team | null = null;
    if (this.storedState.position < TUG_START_POSITION && this.storedState.teams[0]) {
      winner = this.storedState.teams[0];
    } else if (this.storedState.position > TUG_START_POSITION && this.storedState.teams[1]) {
      winner = this.storedState.teams[1];
    }

    // Broadcast game end
    this.broadcast({
      type: 'GAME_END',
      payload: {
        winner,
        finalPosition: this.storedState.position,
        summary: {
          totalQuestions: this.storedState.questionIds.length,
          duration: this.storedState.startedAt ? now - this.storedState.startedAt : 0,
        },
      },
    });

    // Close all connections gracefully
    for (const [ws] of this.clients) {
      ws.close(1000, 'Game ended');
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async loadState(): Promise<void> {
    if (this.storedState) return;

    const stored = await this.state.storage.get<StoredState>('state');
    if (stored) {
      this.storedState = stored;
      await this.loadTeams();
    }
  }

  private async saveState(): Promise<void> {
    if (this.storedState) {
      await this.state.storage.put('state', this.storedState);
    }
  }

  private async loadTeams(): Promise<void> {
    if (!this.storedState) return;

    const teamRows = await this.env.DB.prepare(
      `SELECT t.*, s.id as student_id, s.nickname, s.connection_status, s.joined_at
       FROM teams t
       LEFT JOIN students s ON t.id = s.team_id AND s.connection_status != 'kicked'
       WHERE t.session_id = ?`
    ).bind(this.storedState.sessionId).all();

    const teamsMap = new Map<string, Team>();
    let teamIndex = 0;

    for (const row of teamRows.results) {
      if (!teamsMap.has(row.id as string)) {
        teamsMap.set(row.id as string, {
          id: row.id as string,
          sessionId: this.storedState.sessionId,
          name: row.name as string,
          color: row.color as string,
          side: teamIndex === 0 ? 'left' : 'right',
          score: 0,
          members: [],
        });
        teamIndex++;
      }

      if (row.student_id) {
        teamsMap.get(row.id as string)!.members.push({
          id: row.student_id as string,
          sessionId: this.storedState.sessionId,
          nickname: row.nickname as string,
          joinedAt: row.joined_at as number,
          connectionStatus: row.connection_status as Student['connectionStatus'],
        });
      }
    }

    this.storedState.teams = Array.from(teamsMap.values());
  }

  private async updateStudentConnectionStatus(
    studentId: string,
    status: 'connected' | 'disconnected'
  ): Promise<void> {
    await this.env.DB.prepare(
      `UPDATE students SET connection_status = ?, last_seen_at = ? WHERE id = ?`
    ).bind(status, Date.now(), studentId).run();
  }

  private async kickStudent(studentId: string, reason?: string): Promise<void> {
    await this.env.DB.prepare(
      `UPDATE students SET connection_status = 'kicked', team_id = NULL WHERE id = ?`
    ).bind(studentId).run();

    // Find and close the student's WebSocket
    for (const [ws, client] of this.clients) {
      if (client.userId === studentId) {
        this.send(ws, {
          type: 'PLAYER_KICKED',
          requestId: crypto.randomUUID(),
          timestamp: Date.now(),
          studentId,
          reason,
        });
        ws.close(1008, reason || 'Kicked from session');
        this.clients.delete(ws);
        break;
      }
    }

    await this.loadTeams();
    this.broadcastRosterUpdate();
  }

  private buildGameState(includeAnswers: boolean): GameState {
    if (!this.storedState) {
      throw new Error('State not loaded');
    }

    return {
      sessionId: this.storedState.sessionId,
      phase: this.storedState.phase,
      position: {
        value: this.storedState.position,
        lastEventId: this.storedState.lastEventId,
        updatedAt: Date.now(),
      },
      currentQuestion: includeAnswers ? this.storedState.currentQuestion : undefined,
      questionIndex: this.storedState.currentQuestionIndex,
      totalQuestions: this.storedState.questionIds.length,
      teams: this.storedState.teams,
      streaks: Object.fromEntries(
        Object.entries(this.storedState.streaks).map(([k, v]) => [
          k,
          { teamId: k, currentStreak: v.current, maxStreak: v.max },
        ])
      ),
      startedAt: this.storedState.startedAt,
      serverTime: Date.now(),
    };
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  private sendError(
    ws: WebSocket,
    code: WsErrorCode,
    message: string,
    clientMsgId?: string
  ): void {
    this.send(ws, {
      type: 'ERROR',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      code,
      message,
      clientMsgId,
    });
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const [ws, client] of this.clients) {
      if (client.userId) {
        // Filter out sensitive data for students
        try {
          ws.send(data);
        } catch {
          // Connection might be closed
        }
      }
    }
  }

  private sendStateSnapshot(ws: WebSocket, role: 'teacher' | 'student'): void {
    if (!this.storedState) return;

    const state = this.buildGameState(role === 'teacher');

    this.send(ws, {
      type: 'STATE_SNAPSHOT',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      state,
      snapshotVersion: this.storedState.snapshotVersion,
    });
  }

  private broadcastRosterUpdate(): void {
    if (!this.storedState) return;

    this.broadcast({
      type: 'ROSTER_UPDATE',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      teams: this.storedState.teams,
      totalPlayers: this.storedState.teams.reduce((sum, t) => sum + t.members.length, 0),
    });
  }
}
