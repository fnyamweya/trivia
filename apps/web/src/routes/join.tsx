import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { AVATAR_OPTIONS, getAvatarById } from '@/lib/avatars';

export const Route = createFileRoute('/join')({
  component: JoinPage,
});

function JoinPage() {
  const navigate = useNavigate();
  const setStudentAuth = useAuthStore((state) => state.setStudentAuth);
  const [joinCode, setJoinCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [avatarId, setAvatarId] = useState(AVATAR_OPTIONS[0].id);
  const [playMode, setPlayMode] = useState<'team' | 'individual'>('team');
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

      const selectedAvatar = getAvatarById(avatarId);
      setStudentAuth(response.data.data, { id: selectedAvatar.id, emoji: selectedAvatar.emoji }, playMode);
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
          <h1 className="mb-6 text-center text-3xl font-black uppercase tracking-tight text-primary-700">Join Game</h1>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label htmlFor="joinCode" className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
                Game Code
              </label>
              <input
                id="joinCode"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABC123"
                className="input text-center text-2xl font-black tracking-[0.35em] uppercase"
                maxLength={6}
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="nickname" className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
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
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Letters, numbers, underscores, and hyphens only
              </p>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">
                Choose Play Style
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPlayMode('team')}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    playMode === 'team'
                      ? 'border-primary-500 bg-primary-50 shadow-md shadow-primary-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <p className="text-sm font-black uppercase text-slate-700">🤝 Team Game</p>
                  <p className="text-xs font-semibold text-slate-500">Join a side and pull together</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPlayMode('individual')}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    playMode === 'individual'
                      ? 'border-primary-500 bg-primary-50 shadow-md shadow-primary-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <p className="text-sm font-black uppercase text-slate-700">🧠 Individual</p>
                  <p className="text-xs font-semibold text-slate-500">Compete as a solo student</p>
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">
                Future You Avatar
              </label>
              <p className="mb-2 text-xs font-semibold text-slate-500">
                Pick who you want to become in the future.
              </p>
              <div className="grid grid-cols-4 gap-2">
                {AVATAR_OPTIONS.map((avatar) => {
                  const isSelected = avatar.id === avatarId;
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      title={avatar.name}
                      onClick={() => setAvatarId(avatar.id)}
                      className={`rounded-xl border-2 p-2 text-2xl transition-all ${
                        isSelected
                          ? 'border-primary-500 bg-primary-50 shadow-md shadow-primary-500/20'
                          : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block leading-none">{avatar.emoji}</span>
                      <span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-slate-600">
                        {avatar.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-600">
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
