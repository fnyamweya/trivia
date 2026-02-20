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
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/teacher/login', { email, password });
      setTeacherAuth(response.data.data);
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
          <h1 className="mb-6 text-center text-3xl font-black uppercase tracking-tight text-primary-700">Teacher Login</h1>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
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

            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="input"
                required
                minLength={8}
              />
            </div>

            <div className="rounded-xl border-2 border-primary-200 bg-primary-50 p-3 text-sm font-semibold text-primary-700">
              <strong>Seeded account:</strong> <code>teacher@demo.school</code> / <code>password123</code>
            </div>

            {error && (
              <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-600">
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
