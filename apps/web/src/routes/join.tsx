import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

export const Route = createFileRoute('/join')({
  component: JoinPage,
});

function JoinPage() {
  const navigate = useNavigate();
  const setStudentAuth = useAuthStore((state) => state.setStudentAuth);
  const [joinCode, setJoinCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/student/join', {
        joinCode: joinCode.toUpperCase(),
        nickname,
      });

      setStudentAuth(response.data.data);
      navigate({ to: '/play/$sessionId', params: { sessionId: response.data.data.session.id } });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to join game');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="card">
          <h1 className="text-2xl font-bold text-center mb-6">Join Game</h1>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label htmlFor="joinCode" className="block text-sm font-medium text-gray-700 mb-1">
                Game Code
              </label>
              <input
                id="joinCode"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABC123"
                className="input text-center text-2xl tracking-widest uppercase"
                maxLength={6}
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="nickname" className="block text-sm font-medium text-gray-700 mb-1">
                Your Nickname
              </label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="Enter your nickname"
                className="input"
                minLength={2}
                maxLength={20}
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Letters, numbers, underscores, and hyphens only
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || joinCode.length !== 6 || nickname.length < 2}
              className="btn-primary w-full"
            >
              {loading ? 'Joining...' : 'Join Game'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
