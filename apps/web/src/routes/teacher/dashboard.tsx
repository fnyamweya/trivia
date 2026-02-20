import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

export const Route = createFileRoute('/teacher/dashboard')({
  component: TeacherDashboard,
});

function TeacherDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const [sessionName, setSessionName] = useState(`Game ${new Date().toLocaleString()}`);

  const { data: recentSessions, isLoading } = useQuery({
    queryKey: ['teacher', 'sessions'],
    queryFn: async () => {
      const res = await api.get('/reports/teacher/recent');
      return res.data.data;
    },
    enabled: !!user,
  });

  const createSessionMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/sessions', {
        name,
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['teacher', 'sessions'] });
      navigate({ to: '/teacher/session/$sessionId', params: { sessionId: data.id } });
    },
  });

  // Redirect if not logged in
  if (!user) {
    navigate({ to: '/teacher/login' });
    return null;
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="px-4 pt-4">
        <div className="card mx-auto max-w-7xl">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black uppercase tracking-tight text-primary-700">Teacher Dashboard</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold text-slate-600">
                {user.displayName || user.email}
              </span>
              <button
                onClick={() => {
                  logout();
                  navigate({ to: '/' });
                }}
                className="btn-secondary text-xs"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Quick Actions */}
        <div className="card mb-8">
          <h2 className="mb-4 text-xl font-black uppercase tracking-tight text-primary-700">Create New Game</h2>
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <label htmlFor="sessionName" className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
                Game Name
              </label>
              <input
                id="sessionName"
                type="text"
                className="input"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="Enter a game name"
                maxLength={100}
              />
            </div>
            <button
              onClick={() => createSessionMutation.mutate(sessionName.trim() || `Game ${new Date().toLocaleString()}`)}
              disabled={createSessionMutation.isPending}
              className="btn-primary px-8 py-3 text-base"
            >
              {createSessionMutation.isPending ? 'Creating...' : '+ Create Game'}
            </button>
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-500">
            After creation, you will be taken to the live session control room with shareable join code.
          </p>
        </div>

        {/* Recent Sessions */}
        <div className="card">
          <h2 className="mb-4 text-xl font-black uppercase tracking-tight text-primary-700">Recent Games</h2>

          {isLoading ? (
            <p className="font-semibold text-slate-500">Loading...</p>
          ) : recentSessions?.length === 0 ? (
            <p className="font-semibold text-slate-500">No games yet. Create your first one!</p>
          ) : (
            <div className="divide-y">
              {recentSessions?.map((session: any) => (
                <div key={session.id} className="py-4 flex justify-between items-center">
                  <div>
                    <h3 className="font-medium">{session.name}</h3>
                    <p className="text-sm text-gray-500">
                      {session.studentCount} students • {session.totalQuestions} questions
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      session.status === 'completed' ? 'bg-green-100 text-green-800' :
                      session.status === 'lobby' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {session.status}
                    </span>
                    {session.status !== 'completed' && (
                      <Link
                        to="/teacher/session/$sessionId"
                        params={{ sessionId: session.id }}
                        className="btn-secondary text-sm"
                      >
                        Continue
                      </Link>
                    )}
                    <Link
                      to="/teacher/session/$sessionId/report"
                      params={{ sessionId: session.id }}
                      className="text-primary-600 hover:underline text-sm"
                    >
                      View Report
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/teacher/questions" className="card transition-transform hover:-translate-y-0.5">
            <h3 className="font-black uppercase tracking-tight text-primary-700">📚 Question Bank</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">Manage your questions</p>
          </Link>
          <div className="card opacity-50">
            <h3 className="font-black uppercase tracking-tight text-primary-700">📊 Analytics</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">Coming soon</p>
          </div>
          <div className="card opacity-50">
            <h3 className="font-black uppercase tracking-tight text-primary-700">⚙️ Settings</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">Coming soon</p>
          </div>
        </div>
      </main>
    </div>
  );
}
