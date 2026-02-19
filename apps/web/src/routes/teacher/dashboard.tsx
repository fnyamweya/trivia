import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

export const Route = createFileRoute('/teacher/dashboard')({
  component: TeacherDashboard,
});

function TeacherDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();

  const { data: recentSessions, isLoading } = useQuery({
    queryKey: ['teacher', 'sessions'],
    queryFn: async () => {
      const res = await api.get('/reports/teacher/recent');
      return res.data;
    },
    enabled: !!user,
  });

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/sessions', {
        name: `Game ${new Date().toLocaleString()}`,
      });
      return res.data;
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
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Teacher Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {user.displayName || user.email}
            </span>
            <button
              onClick={() => {
                logout();
                navigate({ to: '/' });
              }}
              className="btn-secondary text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Quick Actions */}
        <div className="mb-8">
          <button
            onClick={() => createSessionMutation.mutate()}
            disabled={createSessionMutation.isPending}
            className="btn-primary text-lg px-8 py-3"
          >
            {createSessionMutation.isPending ? 'Creating...' : '+ New Game'}
          </button>
        </div>

        {/* Recent Sessions */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Recent Games</h2>

          {isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : recentSessions?.length === 0 ? (
            <p className="text-gray-500">No games yet. Create your first one!</p>
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
          <Link to="/teacher/questions" className="card hover:shadow-xl transition-shadow">
            <h3 className="font-semibold">📚 Question Bank</h3>
            <p className="text-sm text-gray-500 mt-1">Manage your questions</p>
          </Link>
          <div className="card opacity-50">
            <h3 className="font-semibold">📊 Analytics</h3>
            <p className="text-sm text-gray-500 mt-1">Coming soon</p>
          </div>
          <div className="card opacity-50">
            <h3 className="font-semibold">⚙️ Settings</h3>
            <p className="text-sm text-gray-500 mt-1">Coming soon</p>
          </div>
        </div>
      </main>
    </div>
  );
}
