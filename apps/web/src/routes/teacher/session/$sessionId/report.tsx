import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const Route = createFileRoute('/teacher/session/$sessionId/report')({
  component: SessionReportPage,
});

function SessionReportPage() {
  const { sessionId } = Route.useParams();

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['session', sessionId, 'summary'],
    queryFn: async () => {
      const res = await api.get(`/reports/sessions/${sessionId}/summary`);
      return res.data;
    },
  });

  const { data: leaderboard, isLoading: loadingLeaderboard } = useQuery({
    queryKey: ['session', sessionId, 'leaderboard'],
    queryFn: async () => {
      const res = await api.get(`/reports/sessions/${sessionId}/leaderboard`);
      return res.data;
    },
  });

  if (loadingSummary || loadingLeaderboard) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="card w-full max-w-md text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
          <p className="font-semibold text-slate-600">Loading report...</p>
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
            <h1 className="text-2xl font-black uppercase tracking-tight text-primary-700">Session Report</h1>
            <p className="text-sm font-semibold text-slate-500">{summary?.sessionName}</p>
          </div>
          <Link to="/teacher/dashboard" className="btn-secondary text-xs">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card text-center">
            <p className="text-3xl font-black text-primary-600">{summary?.totalStudents ?? 0}</p>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Students</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-black text-primary-600">{summary?.totalQuestions ?? 0}</p>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Questions</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-black text-primary-600">
              {summary?.averageAccuracy ? `${Math.round(summary.averageAccuracy * 100)}%` : '-'}
            </p>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Avg Accuracy</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-black text-primary-600">
              {summary?.duration ? `${Math.round(summary.duration / 60)}m` : '-'}
            </p>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Duration</p>
          </div>
        </div>

        {/* Winner */}
        {summary?.winner && (
          <div className="card mb-8 border-yellow-200 bg-gradient-to-r from-yellow-50 to-yellow-100 text-center">
            <div className="text-4xl mb-2">🏆</div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-yellow-700">{summary.winner.name} Wins!</h2>
            <p className="font-semibold text-yellow-800">Final Score: {summary.winner.score} points</p>
          </div>
        )}

        {/* Team Results */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {summary?.teams?.map((team: any) => (
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
                <span className="rounded-full bg-slate-100 px-3 py-1 text-2xl font-black text-slate-700">{team.score} pts</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Correct Answers</p>
                  <p className="font-semibold text-slate-700">{team.correctAnswers ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Accuracy</p>
                  <p className="font-semibold text-slate-700">
                    {team.accuracy ? `${Math.round(team.accuracy * 100)}%` : '-'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Leaderboard */}
        <div className="card">
          <h2 className="mb-4 text-xl font-black uppercase tracking-tight text-primary-700">Individual Leaderboard</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 text-xs font-black uppercase tracking-wide text-slate-500">#</th>
                  <th className="pb-2 pr-4 text-xs font-black uppercase tracking-wide text-slate-500">Player</th>
                  <th className="pb-2 pr-4 text-xs font-black uppercase tracking-wide text-slate-500">Team</th>
                  <th className="pb-2 pr-4 text-right text-xs font-black uppercase tracking-wide text-slate-500">Score</th>
                  <th className="pb-2 pr-4 text-right text-xs font-black uppercase tracking-wide text-slate-500">Correct</th>
                  <th className="pb-2 text-right text-xs font-black uppercase tracking-wide text-slate-500">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard?.map((player: any, index: number) => (
                  <tr key={player.id} className="border-b last:border-0">
                    <td className="py-3 pr-4">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                    </td>
                    <td className="py-3 pr-4 font-semibold text-slate-700">{player.nickname}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2 py-1 text-xs font-black uppercase tracking-wide ${
                        player.teamSide === 'left'
                          ? 'bg-team-red/20 text-team-red'
                          : player.teamSide === 'right'
                            ? 'bg-team-blue/20 text-team-blue'
                            : 'bg-slate-200 text-slate-600'
                      }`}>
                        {player.teamName || 'Solo'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-black text-slate-700">{player.score}</td>
                    <td className="py-3 pr-4 text-right font-semibold text-slate-700">{player.correctAnswers}</td>
                    <td className="py-3 text-right">
                      {player.accuracy ? `${Math.round(player.accuracy * 100)}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
