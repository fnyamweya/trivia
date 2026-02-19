/**
 * WebSocket Protocol for Trivia Tug-of-War
 * Complete message format with payload pattern
 */

import type { Team, SessionPhase, GameState } from '../types';

// ============================================================================
// Client -> Server Messages
// ============================================================================

export interface HelloMessage {
  type: 'HELLO';
  token: string;
  clientMsgId?: string;
}

export interface JoinTeamMessage {
  type: 'JOIN_TEAM';
  teamId: string;
  clientMsgId?: string;
}

export interface SubmitAnswerMessage {
  type: 'SUBMIT_ANSWER';
  instanceId: string;
  choiceId: string;
  clientMsgId?: string;
}

export interface TeacherNextQuestionMessage {
  type: 'TEACHER_NEXT_QUESTION';
  questionId?: string;  // Optional - let backend pick if not specified
  clientMsgId?: string;
}

export interface TeacherPauseMessage {
  type: 'TEACHER_PAUSE';
  clientMsgId?: string;
}

export interface TeacherResumeMessage {
  type: 'TEACHER_RESUME';
  clientMsgId?: string;
}

export interface TeacherManualAdjustMessage {
  type: 'TEACHER_MANUAL_ADJUST';
  delta: number;  // -100 to +100
  clientMsgId?: string;
}

export interface TeacherKickPlayerMessage {
  type: 'TEACHER_KICK_PLAYER';
  playerId: string;
  clientMsgId?: string;
}

export interface TeacherEndGameMessage {
  type: 'TEACHER_END_GAME';
  clientMsgId?: string;
}

export interface PingMessage {
  type: 'PING';
  clientMsgId?: string;
}

export type ClientMessage =
  | HelloMessage
  | JoinTeamMessage
  | SubmitAnswerMessage
  | TeacherNextQuestionMessage
  | TeacherPauseMessage
  | TeacherResumeMessage
  | TeacherManualAdjustMessage
  | TeacherKickPlayerMessage
  | TeacherEndGameMessage
  | PingMessage;

// ============================================================================
// Server -> Client Messages
// ============================================================================

export interface WelcomeMessage {
  type: 'WELCOME';
  payload: {
    sessionId: string;
    phase: SessionPhase;
    position?: number;
    teams?: Team[];
    students?: { id: string; nickname: string; teamId: string }[];
  };
}

export interface PlayerJoinedMessage {
  type: 'PLAYER_JOINED';
  payload: {
    id: string;
    nickname: string;
    teamId: string;
  };
}

export interface QuestionPushedMessage {
  type: 'QUESTION_PUSHED';
  payload: {
    instanceId: string;
    stem: string;
    choices: { id: string; text: string }[];
    timeLimit: number;
    questionNumber: number;
    totalQuestions: number;
  };
}

export interface TugUpdateMessage {
  type: 'TUG_UPDATE';
  payload: {
    position: number;
    delta: number;
    teamScores?: Record<string, number>;
  };
}

export interface AnswerAckMessage {
  type: 'ANSWER_ACK';
  payload: {
    correct: boolean;
    points: number;
    streakBonus: number;
    newStreak: number;
  };
}

export interface RevealAnswerMessage {
  type: 'REVEAL_ANSWER';
  payload: {
    correctChoiceId: string;
    stats?: Record<string, number>;
  };
}

export interface PhaseChangeMessage {
  type: 'PHASE_CHANGE';
  payload: {
    phase: SessionPhase;
  };
}

export interface GameEndMessage {
  type: 'GAME_END';
  payload: {
    winner: Team | null;
    finalPosition: number;
    summary?: {
      duration: number;
      totalQuestions: number;
    };
  };
}

export interface ErrorMessage {
  type: 'ERROR';
  requestId?: string;
  timestamp?: number;
  code: WsErrorCode;
  message: string;
  clientMsgId?: string;
}

export interface PongMessage {
  type: 'PONG';
  requestId?: string;
  timestamp?: number;
}

export interface AckMessage {
  type: 'ACK';
  requestId?: string;
  timestamp?: number;
  clientMsgId?: string;
}

export interface StateSnapshotMessage {
  type: 'STATE_SNAPSHOT';
  requestId?: string;
  timestamp?: number;
  state: GameState;
  snapshotVersion?: number;
}

export interface RosterUpdateMessage {
  type: 'ROSTER_UPDATE';
  requestId?: string;
  timestamp?: number;
  teams: Team[];
  students?: { id: string; nickname: string; teamId: string; connectionStatus: string }[];
  totalPlayers?: number;
}

export interface PlayerKickedMessage {
  type: 'PLAYER_KICKED';
  requestId?: string;
  timestamp?: number;
  studentId: string;
  reason?: string;
}

export type ServerMessage =
  | WelcomeMessage
  | PlayerJoinedMessage
  | QuestionPushedMessage
  | TugUpdateMessage
  | AnswerAckMessage
  | RevealAnswerMessage
  | PhaseChangeMessage
  | GameEndMessage
  | ErrorMessage
  | PongMessage
  | AckMessage
  | StateSnapshotMessage
  | RosterUpdateMessage
  | PlayerKickedMessage;

// ============================================================================
// WebSocket Error Codes
// ============================================================================

export type WsErrorCode =
  | 'INVALID_TOKEN'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_ENDED'
  | 'NOT_AUTHORIZED'
  | 'ALREADY_ANSWERED'
  | 'QUESTION_EXPIRED'
  | 'INVALID_ANSWER'
  | 'RATE_LIMITED'
  | 'INVALID_MESSAGE'
  | 'KICKED'
  | 'INTERNAL_ERROR';

// ============================================================================
// Protocol Constants
// ============================================================================

export const PROTOCOL_VERSION = '1.0.0';
