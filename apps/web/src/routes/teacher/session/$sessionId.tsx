import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { wsClient } from '@/lib/ws-client';
import { TugMeter } from '@/components/TugMeter';
import type { ServerMessage, Team } from '@trivia/shared';

export const Route = createFileRoute('/teacher/session/$sessionId')({
  component: TeacherSessionPage,
});

function TeacherSessionPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const { accessToken, user } = useAuthStore();
  const queryClient = useQueryClient();
  const isAuthenticated = !!user && user.role === 'teacher';

  const [wsState, setWsState] = useState<{
    position: number;
    teams: Team[];
    phase: string;
    students: { id: string; nickname: string; teamId: string }[];
    currentQuestion: { instanceId: string; stem: string; choices: { id: string; text: string }[] } | null;
  }>({
    position: 50,
    teams: [],
    phase: 'lobby',
    students: [],
    currentQuestion: null,
  });

  // Fetch session details
  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const res = await api.get(`/sessions/${sessionId}`);
      return res.data;
    },
    enabled: isAuthenticated,
  });

  // WebSocket connection for realtime updates
  useEffect(() => {
    if (!accessToken || !isAuthenticated) return;

    wsClient.connect(sessionId, accessToken);

    const unsubMessage = wsClient.onMessage((message: ServerMessage) => {
      switch (message.type) {
        case 'WELCOME':
          setWsState((prev) => ({
            ...prev,
            phase: message.payload.phase,
            position: message.payload.position ?? 50,
            teams: message.payload.teams ?? [],
            students: message.payload.students ?? [],
          }));
          break;
        case 'PLAYER_JOINED':
          setWsState((prev) => ({
            ...prev,
            students: [
              ...prev.students.filter((s) => s.id !== message.payload.id),
              {
                id: message.payload.id,
                nickname: message.payload.nickname,
                teamId: message.payload.teamId,
              },
            ],
          }));
          break;
        case 'TUG_UPDATE':
          setWsState((prev) => ({
            ...prev,
            position: message.payload.position,
          }));
          break;
        case 'PHASE_CHANGE':
          setWsState((prev) => ({
            ...prev,
            phase: message.payload.phase,
          }));
          break;
        case 'QUESTION_PUSHED':
          setWsState((prev) => ({
            ...prev,
            currentQuestion: message.payload,
            phase: 'active_question',
          }));
          break;
        case 'GAME_END':
          setWsState((prev) => ({
            ...prev,
            phase: 'completed',
          }));
          queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
          break;
      }
    });

    return () => {
      unsubMessage();
      wsClient.disconnect();
    };
  }, [sessionId, accessToken, queryClient, isAuthenticated]);

  // Session control mutations
  const startGameMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/sessions/${sessionId}/start`);
    },
  });

  const endGameMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/sessions/${sessionId}/end`);
    },
    onSuccess: () => {
      navigate({ to: '/teacher/session/$sessionId/report', params: { sessionId } });
    },
  });

  // Redirect if not logged in as teacher
  if (!isAuthenticated) {
    navigate({ to: '/teacher/login' });
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{session?.name}</h1>
            <p className="text-sm text-gray-500">
              Join Code: <span className="font-mono font-bold text-lg">{session?.joinCode}</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              wsState.phase === 'completed' ? 'bg-green-100 text-green-800' :
              wsState.phase === 'lobby' ? 'bg-yellow-100 text-yellow-800' :
              wsState.phase === 'paused' ? 'bg-orange-100 text-orange-800' :
              'bg-blue-100 text-blue-800'
            }`}>
              {wsState.phase}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Control Panel */}
        <div className="card mb-8">
          <h2 className="text-lg font-semibold mb-4">Game Controls</h2>
          <div className="flex flex-wrap gap-4">
            {wsState.phase === 'lobby' && (
              <button
                onClick={() => startGameMutation.mutate()}
                disabled={startGameMutation.isPending || wsState.students.length < 2}
                className="btn-primary"
              >
                {startGameMutation.isPending ? 'Starting...' : '▶️ Start Game'}
              </button>
            )}
            {(wsState.phase === 'active_question' || wsState.phase === 'reveal') && (
              <>
                <button
                  onClick={() => endGameMutation.mutate()}
                  disabled={endGameMutation.isPending}
                  className="btn-danger"
                >
                  ⏹️ End Game
                </button>
              </>
            )}
            {wsState.phase === 'paused' && (
              <button
                onClick={() => endGameMutation.mutate()}
                disabled={endGameMutation.isPending}
                className="btn-danger"
              >
                ⏹️ End Game
              </button>
            )}
            {wsState.phase === 'completed' && (
              <button
                onClick={() => navigate({ to: '/teacher/session/$sessionId/report', params: { sessionId } })}
                className="btn-primary"
              >
                📊 View Report
              </button>
            )}
          </div>
          {wsState.phase === 'lobby' && wsState.students.length < 2 && (
            <p className="mt-2 text-sm text-amber-600">
              Need at least 2 players to start (currently {wsState.students.length})
            </p>
          )}
        </div>

        {/* Tug Meter */}
        {wsState.teams.length > 0 && (
          <div className="card mb-8">
            <h2 className="text-lg font-semibold mb-4">Tug-of-War</h2>
            <TugMeter position={wsState.position} teams={wsState.teams} />
          </div>
        )}

        {/* Current Question (if active) */}
        {wsState.currentQuestion && wsState.phase === 'active_question' && (
          <div className="card mb-8">
            <h2 className="text-lg font-semibold mb-4">Current Question</h2>
            <p className="text-xl">{wsState.currentQuestion.stem}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {wsState.currentQuestion.choices.map((choice: any, i: number) => (
                <div key={choice.id} className="p-3 bg-gray-100 rounded">
                  <span className="font-mono mr-2">{String.fromCharCode(65 + i)}.</span>
                  {choice.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Teams & Players */}
        <div className="grid md:grid-cols-2 gap-4">
          {wsState.teams.map((team) => {
            const teamStudents = wsState.students.filter((s) => s.teamId === team.id);

            return (
              <div
                key={team.id}
                className={`card ${
                  team.side === 'left' ? 'border-l-4 border-team-red' : 'border-l-4 border-team-blue'
                }`}
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className={`text-xl font-bold ${
                    team.side === 'left' ? 'text-team-red' : 'text-team-blue'
                  }`}>
                    {team.name}
                  </h3>
                  <span className="text-2xl font-bold">{team.score}</span>
                </div>

                <div className="space-y-2">
                  {teamStudents.length === 0 ? (
                    <p className="text-gray-400 text-sm">No players yet</p>
                  ) : (
                    teamStudents.map((student) => (
                      <div key={student.id} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span>{student.nickname}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
