import { create } from 'zustand';
import { wsClient } from '@/lib/ws-client';
import type { ServerMessage, Team, SessionPhase } from '@trivia/shared';
import { useAuthStore } from '@/stores/auth';

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

interface RosterStudent {
  id: string;
  nickname: string;
  teamId: string | null;
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
  students: RosterStudent[];
  myTeamId: string | null;
  soloMode: boolean;
}

interface GameStore extends GameState {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  connect: (sessionId: string, token: string) => void;
  disconnect: () => void;
  submitAnswer: (choiceId: string) => void;
  joinTeam: (teamId: string) => void;
  setSoloMode: (enabled: boolean) => void;
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
  myTeamId: null,
  soloMode: false,
};

export const useGameStore = create<GameStore>((set, get) => {
  // Setup message handler
  const handleMessage = (message: ServerMessage) => {
    switch (message.type) {
      case 'WELCOME':
        {
          const myTeamId = message.teamId ?? null;
        set({
          sessionId: message.payload.sessionId,
          phase: message.payload.phase,
          position: {
            value: message.payload.position ?? 50,
            direction: 'none',
            lastChange: Date.now(),
          },
          teams: message.payload.teams ?? [],
          students: (message.payload.students ?? []).map((student) => ({
            id: student.id,
            nickname: student.nickname,
            teamId: student.teamId || null,
          })),
          myTeamId,
          soloMode: myTeamId === null,
        });
        }
        break;

      case 'PLAYER_JOINED':
        set((state) => ({
          students: [
            ...state.students.filter((s) => s.id !== message.payload.id),
            {
              id: message.payload.id,
              nickname: message.payload.nickname,
              teamId: message.payload.teamId || null,
            },
          ],
        }));
        break;

      case 'ROSTER_UPDATE':
        set((state) => {
          const currentUserId = useAuthStore.getState().user?.id;
          const rosterStudents =
            message.students?.map((student) => ({
              id: student.id,
              nickname: student.nickname,
              teamId: student.teamId || null,
            })) ??
            message.teams.flatMap((team) =>
              team.members.map((member) => ({
                id: member.id,
                nickname: member.nickname,
                teamId: team.id,
              }))
            );

          const myself = rosterStudents.find((student) => student.id === currentUserId);

          return {
            teams: message.teams,
            students: rosterStudents,
            myTeamId: myself?.teamId ?? state.myTeamId ?? null,
            soloMode: myself ? myself.teamId === null : state.soloMode,
          };
        });
        break;

      case 'QUESTION':
        set({
          currentQuestion: {
            instanceId: message.question.id,
            stem: message.question.text,
            choices: message.question.answers,
            timeLimit: Math.round(message.question.timeLimitMs / 1000),
            startedAt: message.startsAt,
          },
          myAnswer: null,
          phase: 'active_question',
          questionNumber: message.questionIndex + 1,
          totalQuestions: message.totalQuestions,
        });
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
        if (!message.payload && (message.position === undefined || message.delta === undefined)) {
          break;
        }
        {
          const positionValue = message.payload?.position ?? message.position ?? 50;
          const deltaValue = message.payload?.delta ?? message.delta ?? 0;
        set({
          position: {
            value: positionValue,
            direction: deltaValue > 0 ? 'right' : deltaValue < 0 ? 'left' : 'none',
            lastChange: Date.now(),
          },
        });
        }
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

      case 'ANSWER_RESULT':
        set((state) => ({
          myAnswer: state.myAnswer
            ? {
                ...state.myAnswer,
                correct: message.correct,
                points: message.pointsAwarded,
                streakBonus: 0,
              }
            : null,
        }));
        break;

      case 'REVEAL_ANSWER':
        set({
          phase: 'reveal',
        });
        break;

      case 'QUESTION_REVEAL':
        set({
          phase: 'reveal',
        });
        break;

      case 'GAME_END':
        if (!message.payload) {
          break;
        }
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
        set({ phase: message.payload?.phase ?? message.phase ?? 'lobby' });
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
      if (!state.soloMode && !state.myTeamId) return;

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

    joinTeam: (teamId: string) => {
      const currentUserId = useAuthStore.getState().user?.id;
      wsClient.send({
        type: 'JOIN_TEAM',
        teamId,
      });

      set((state) => ({
        myTeamId: teamId,
        soloMode: false,
        students: state.students.map((student) =>
          student.id === currentUserId ? { ...student, teamId } : student
        ),
      }));
    },

    setSoloMode: (enabled: boolean) => {
      if (enabled) {
        wsClient.send({
          type: 'JOIN_TEAM',
          teamId: 'SOLO',
        });
      }

      set((state) => ({
        soloMode: enabled,
        myTeamId: enabled ? null : state.myTeamId,
      }));
    },
  };
});
