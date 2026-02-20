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
  const isAuthenticated = !!user && (user.role === 'teacher' || user.role === 'admin');

  const [wsState, setWsState] = useState<{
    position: number;
    teams: Team[];
    phase: string;
    students: { id: string; nickname: string; teamId: string | null }[];
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
            students: (message.payload.students ?? []).map((student) => ({
              ...student,
              teamId: student.teamId || null,
            })),
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
                teamId: message.payload.teamId || null,
              },
            ],
          }));
          break;
        case 'ROSTER_UPDATE':
          setWsState((prev) => ({
            ...prev,
            teams: message.teams,
            students:
              message.students?.map((student) => ({
                id: student.id,
                nickname: student.nickname,
                teamId: student.teamId || null,
              })) ??
              prev.students,
          }));
          break;
        case 'TUG_UPDATE':
          setWsState((prev) => ({
            ...prev,
            position: message.payload?.position ?? message.position ?? prev.position,
          }));
          break;
        case 'PHASE_CHANGE':
          setWsState((prev) => ({
            ...prev,
            phase: message.payload?.phase ?? message.phase ?? prev.phase,
          }));
          break;
        case 'QUESTION_PUSHED':
          setWsState((prev) => ({
            ...prev,
            currentQuestion: message.payload,
            phase: 'active_question',
          }));
          break;
        case 'QUESTION':
          setWsState((prev) => ({
            ...prev,
            currentQuestion: {
              instanceId: message.question.id,
              stem: message.question.text,
              choices: message.question.answers,
            },
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
    <div className="min-h-screen">
      {/* Header */}
      <header className="px-4 pt-4">
        <div className="card mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-primary-700">{session?.name}</h1>
            <p className="text-sm font-semibold text-slate-500">
              Join Code: <span className="rounded-lg bg-primary-50 px-2 py-1 font-mono text-lg font-black tracking-[0.2em] text-primary-700">{session?.joinCode}</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className={`rounded-full border-2 px-3 py-1 text-xs font-black uppercase tracking-wide ${
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
          <h2 className="mb-4 text-lg font-black uppercase tracking-tight text-primary-700">Game Controls</h2>
          <div className="flex flex-wrap gap-4">
            {wsState.phase === 'lobby' && (
              <button
                onClick={() => startGameMutation.mutate()}
                disabled={startGameMutation.isPending || wsState.students.length < 2}
                className="btn-primary"
              >
                {startGameMutation.isPending ? 'Starting...' : '🚀 Start Game'}
              </button>
            )}
            {(wsState.phase === 'active_question' || wsState.phase === 'reveal') && (
              <>
                <button
                  onClick={() => endGameMutation.mutate()}
                  disabled={endGameMutation.isPending}
                  className="btn-danger"
                >
                  🛑 End Game
                </button>
              </>
            )}
            {wsState.phase === 'paused' && (
              <button
                onClick={() => endGameMutation.mutate()}
                disabled={endGameMutation.isPending}
                className="btn-danger"
              >
                🛑 End Game
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
            <p className="mt-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-700">
              Need at least 2 players to start (currently {wsState.students.length})
            </p>
          )}
        </div>

        {/* Tug Meter */}
        {wsState.teams.length > 0 && (
          <div className="card mb-8">
            <h2 className="mb-4 text-lg font-black uppercase tracking-tight text-primary-700">Tug-of-War</h2>
            <TugMeter position={wsState.position} teams={wsState.teams} />
          </div>
        )}

        {/* Current Question (if active) */}
        {wsState.currentQuestion && wsState.phase === 'active_question' && (
          <div className="card mb-8">
            <h2 className="mb-4 text-lg font-black uppercase tracking-tight text-primary-700">Current Question</h2>
            <p className="text-xl font-black text-slate-800">{wsState.currentQuestion.stem}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {wsState.currentQuestion.choices.map((choice: any, i: number) => (
                <div key={choice.id} className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3 font-semibold text-slate-700">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-xs font-black text-white">{String.fromCharCode(65 + i)}</span>
                  {choice.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Teams & Players */}
        <div className="grid gap-4 md:grid-cols-2">
          {wsState.teams.map((team) => {
            const teamStudents = wsState.students.filter((s) => s.teamId === team.id);

            return (
              <div
                key={team.id}
                className={`card ${
                  team.side === 'left' ? 'border-l-8 border-team-red' : 'border-l-8 border-team-blue'
                }`}
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className={`text-xl font-black uppercase tracking-tight ${
                    team.side === 'left' ? 'text-team-red' : 'text-team-blue'
                  }`}>
                    {team.name}
                  </h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-2xl font-black text-slate-700">{team.score}</span>
                </div>

                <div className="space-y-2">
                  {teamStudents.length === 0 ? (
                    <p className="text-sm font-semibold text-slate-500">No players yet</p>
                  ) : (
                    teamStudents.map((student) => (
                      <div key={student.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="font-semibold text-slate-700">{student.nickname}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {wsState.students.some((student) => !student.teamId) && (
          <div className="card mt-4">
            <h3 className="mb-3 text-base font-black uppercase tracking-tight text-primary-700">Solo Players</h3>
            <div className="flex flex-wrap gap-2">
              {wsState.students
                .filter((student) => !student.teamId)
                .map((student) => (
                  <span key={student.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
                    {student.nickname}
                  </span>
                ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
