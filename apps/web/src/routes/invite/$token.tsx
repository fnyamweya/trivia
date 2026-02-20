import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export const Route = createFileRoute('/invite/$token')({
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const setTeacherAuth = useAuthStore((state) => state.setTeacherAuth);

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const acceptInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/auth/teacher/accept-invite', {
        token,
        displayName,
        password,
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      setTeacherAuth(data);
      navigate({ to: '/teacher/dashboard' });
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message ?? 'Failed to accept invite');
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (displayName.trim().length < 2) {
      setError('Display name must be at least 2 characters.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    acceptInviteMutation.mutate();
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-black uppercase tracking-tight text-primary-700">Accept Teacher Invite</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600">
          Create your teacher account to access the school workspace.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Display Name</label>
            <input className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Password</label>
            <input type="password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Confirm Password</label>
            <input
              type="password"
              className="input"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <button className="btn-primary w-full" disabled={acceptInviteMutation.isPending} type="submit">
            {acceptInviteMutation.isPending ? 'Creating Account...' : 'Accept Invite'}
          </button>
        </form>
      </div>
    </div>
  );
}
