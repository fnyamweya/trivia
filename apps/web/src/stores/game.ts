import { create } from 'zustand';
import { wsClient } from '@/lib/ws-client';
import type { ServerMessage, Team, SessionPhase } from '@trivia/shared';

interface Position {
  value: number; // 0-100, 50 = center
  direction: 'left' | 'right' | 'none';
  lastChange: number;
}

interface CurrentQuestion {
  instanceId: string;
  stem: string;
  choices: { id: string; text: string }[];
  timeLimit: number;
  startedAt: number;
}

interface StudentAnswer {
  choiceId: string;
  submittedAt: number;
  correct?: boolean;
  points?: number;
  streakBonus?: number;
}

interface GameState {
  sessionId: string | null;
  position: Position;
  teams: Team[];
  phase: SessionPhase;
  currentQuestion: CurrentQuestion | null;
  myAnswer: StudentAnswer | null;
  questionNumber: number;
  totalQuestions: number;
  winningTeam: Team | null;
  students: { id: string; nickname: string; teamId: string }[];
}

interface GameStore extends GameState {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  connect: (sessionId: string, token: string) => void;
  disconnect: () => void;
  submitAnswer: (choiceId: string) => void;
}

const initialState: GameState = {
  sessionId: null,
  position: { value: 50, direction: 'none', lastChange: 0 },
  teams: [],
  phase: 'lobby',
  currentQuestion: null,
  myAnswer: null,
  questionNumber: 0,
  totalQuestions: 0,
  winningTeam: null,
  students: [],
};

export const useGameStore = create<GameStore>((set, get) => {
  // Setup message handler
  const handleMessage = (message: ServerMessage) => {
    switch (message.type) {
      case 'WELCOME':
        set({
          sessionId: message.payload.sessionId,
          phase: message.payload.phase,
          position: {
            value: message.payload.position ?? 50,
            direction: 'none',
            lastChange: Date.now(),
          },
          teams: message.payload.teams ?? [],
          students: message.payload.students ?? [],
        });
        break;

      case 'PLAYER_JOINED':
        set((state) => ({
          students: [
            ...state.students.filter((s) => s.id !== message.payload.id),
            {
              id: message.payload.id,
              nickname: message.payload.nickname,
              teamId: message.payload.teamId,
            },
          ],
        }));
        break;

      case 'QUESTION_PUSHED':
        set({
          currentQuestion: {
            instanceId: message.payload.instanceId,
            stem: message.payload.stem,
            choices: message.payload.choices,
            timeLimit: message.payload.timeLimit,
            startedAt: Date.now(),
          },
          myAnswer: null,
          phase: 'active_question',
          questionNumber: message.payload.questionNumber,
          totalQuestions: message.payload.totalQuestions,
        });
        break;

      case 'TUG_UPDATE':
        set({
          position: {
            value: message.payload.position,
            direction: message.payload.delta > 0 ? 'right' : message.payload.delta < 0 ? 'left' : 'none',
            lastChange: Date.now(),
          },
        });
        break;

      case 'ANSWER_ACK':
        set((state) => ({
          myAnswer: state.myAnswer
            ? {
                ...state.myAnswer,
                correct: message.payload.correct,
                points: message.payload.points,
                streakBonus: message.payload.streakBonus,
              }
            : null,
        }));
        break;

      case 'REVEAL_ANSWER':
        set({
          phase: 'reveal',
        });
        break;

      case 'GAME_END':
        set({
          phase: 'completed',
          winningTeam: message.payload.winner,
          position: {
            value: message.payload.finalPosition,
            direction: 'none',
            lastChange: Date.now(),
          },
        });
        break;

      case 'PHASE_CHANGE':
        set({ phase: message.payload.phase });
        break;

      case 'ERROR':
        console.error('Game error:', message.message);
        break;
    }
  };

  wsClient.onMessage(handleMessage);
  wsClient.onStatusChange((status) => {
    set({ connectionStatus: status });
  });

  return {
    ...initialState,
    connectionStatus: 'disconnected',

    connect: (sessionId: string, token: string) => {
      set({ connectionStatus: 'connecting', sessionId });
      wsClient.connect(sessionId, token);
    },

    disconnect: () => {
      wsClient.disconnect();
      set({ ...initialState, connectionStatus: 'disconnected' });
    },

    submitAnswer: (choiceId: string) => {
      const state = get();
      if (!state.currentQuestion || state.myAnswer) return;

      // Optimistically set the answer
      set({
        myAnswer: {
          choiceId,
          submittedAt: Date.now(),
        },
      });

      wsClient.send({
        type: 'SUBMIT_ANSWER',
        instanceId: state.currentQuestion.instanceId,
        choiceId,
      });
    },
  };
});
