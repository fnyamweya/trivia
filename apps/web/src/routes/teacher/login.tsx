import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

export const Route = createFileRoute('/teacher/login')({
  component: TeacherLoginPage,
});

function TeacherLoginPage() {
  const navigate = useNavigate();
  const setTeacherAuth = useAuthStore((state) => state.setTeacherAuth);
  const [email, setEmail] = useState('teacher@demo.school');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/teacher/login', { email });
      setTeacherAuth(response.data);
      navigate({ to: '/teacher/dashboard' });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="card">
          <h1 className="text-2xl font-bold text-center mb-6">Teacher Login</h1>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@school.edu"
                className="input"
                required
                autoFocus
              />
            </div>

            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
              <strong>Demo Mode:</strong> Use <code>teacher@demo.school</code> to login.
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
