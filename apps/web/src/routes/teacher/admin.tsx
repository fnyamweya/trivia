import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

interface AdminSettings {
  schoolName?: string;
  timezone?: string;
  defaultLanguage?: string;
  sessionDefaults?: {
    questionCount?: number;
    timeLimitMsPerQuestion?: number;
    pointsPerCorrect?: number;
    allowLatejoin?: boolean;
  };
}

interface TeacherInvite {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: number;
}

export const Route = createFileRoute('/teacher/admin')({
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [copiedLink, setCopiedLink] = useState('');

  const isAdmin = user?.role === 'admin';

  const { data: settings } = useQuery<AdminSettings>({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const res = await api.get('/admin/settings');
      return res.data.data;
    },
    enabled: isAdmin,
  });

  const { data: invites } = useQuery<TeacherInvite[]>({
    queryKey: ['admin', 'invites'],
    queryFn: async () => {
      const res = await api.get('/admin/invites');
      return res.data.data;
    },
    enabled: isAdmin,
  });

  const [formState, setFormState] = useState({
    schoolName: '',
    timezone: 'Africa/Nairobi',
    defaultLanguage: 'en',
    defaultQuestionCount: 10,
    defaultTimeLimitMs: 30000,
    defaultPoints: 10,
    allowLatejoin: true,
  });

  useEffect(() => {
    if (!settings) return;

    setFormState({
      schoolName: settings.schoolName ?? '',
      timezone: settings.timezone ?? 'Africa/Nairobi',
      defaultLanguage: settings.defaultLanguage ?? 'en',
      defaultQuestionCount: settings.sessionDefaults?.questionCount ?? 10,
      defaultTimeLimitMs: settings.sessionDefaults?.timeLimitMsPerQuestion ?? 30000,
      defaultPoints: settings.sessionDefaults?.pointsPerCorrect ?? 10,
      allowLatejoin: settings.sessionDefaults?.allowLatejoin ?? true,
    });
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async () => {
      await api.patch('/admin/settings', {
        schoolName: formState.schoolName,
        timezone: formState.timezone,
        defaultLanguage: formState.defaultLanguage,
        sessionDefaults: {
          questionCount: formState.defaultQuestionCount,
          timeLimitMsPerQuestion: formState.defaultTimeLimitMs,
          pointsPerCorrect: formState.defaultPoints,
          allowLatejoin: formState.allowLatejoin,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/admin/invites', {
        email: inviteEmail,
        displayName: inviteName || undefined,
      });
      return res.data.data as { inviteLink?: string };
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] });
      setInviteEmail('');
      setInviteName('');
      if (data.inviteLink) {
        await navigator.clipboard.writeText(data.inviteLink);
        setCopiedLink(data.inviteLink);
      }
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/admin/invites/${id}/resend`);
      return res.data.data as { inviteLink?: string };
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] });
      if (data.inviteLink) {
        await navigator.clipboard.writeText(data.inviteLink);
        setCopiedLink(data.inviteLink);
      }
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/invites/${id}/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] });
    },
  });

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="card max-w-md text-center">
          <h2 className="text-2xl font-black uppercase text-primary-700">Admin Access Required</h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Only admins can open school settings and teacher invites.
          </p>
          <Link to="/teacher/dashboard" className="btn-secondary mt-4">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-primary-700">Admin Settings</h1>
            <p className="text-sm font-semibold text-slate-600">
              Configure school defaults and invite teachers by email.
            </p>
          </div>
          <Link to="/teacher/dashboard" className="btn-secondary text-xs">
            ← Back
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card space-y-4">
            <h2 className="text-lg font-black uppercase tracking-tight text-primary-700">School Configuration</h2>

            <div>
              <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">School Name</label>
              <input
                className="input"
                value={formState.schoolName}
                onChange={(event) => setFormState((prev) => ({ ...prev, schoolName: event.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Timezone</label>
                <input
                  className="input"
                  value={formState.timezone}
                  onChange={(event) => setFormState((prev) => ({ ...prev, timezone: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Language</label>
                <input
                  className="input"
                  value={formState.defaultLanguage}
                  onChange={(event) => setFormState((prev) => ({ ...prev, defaultLanguage: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Questions</label>
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={100}
                  value={formState.defaultQuestionCount}
                  onChange={(event) => setFormState((prev) => ({ ...prev, defaultQuestionCount: Number(event.target.value) }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Time (ms)</label>
                <input
                  type="number"
                  className="input"
                  min={5000}
                  max={120000}
                  step={1000}
                  value={formState.defaultTimeLimitMs}
                  onChange={(event) => setFormState((prev) => ({ ...prev, defaultTimeLimitMs: Number(event.target.value) }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Points</label>
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={100}
                  value={formState.defaultPoints}
                  onChange={(event) => setFormState((prev) => ({ ...prev, defaultPoints: Number(event.target.value) }))}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={formState.allowLatejoin}
                onChange={(event) => setFormState((prev) => ({ ...prev, allowLatejoin: event.target.checked }))}
              />
              Allow late join in sessions
            </label>

            <button className="btn-primary" disabled={updateSettingsMutation.isPending} onClick={() => updateSettingsMutation.mutate()}>
              {updateSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          <div className="card space-y-4">
            <h2 className="text-lg font-black uppercase tracking-tight text-primary-700">Invite Teachers</h2>

            <div className="space-y-2">
              <input
                className="input"
                type="email"
                placeholder="teacher@school.edu"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
              <input
                className="input"
                placeholder="Teacher display name (optional)"
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
              />
              <button
                className="btn-primary"
                disabled={createInviteMutation.isPending || inviteEmail.length < 5}
                onClick={() => createInviteMutation.mutate()}
              >
                {createInviteMutation.isPending ? 'Inviting...' : 'Send Invite'}
              </button>
            </div>

            {copiedLink && (
              <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                Invite link copied to clipboard.
              </div>
            )}

            <div className="max-h-[300px] space-y-2 overflow-auto">
              {(invites ?? []).map((invite) => (
                <div key={invite.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-black text-slate-700">{invite.email}</p>
                      <p className="text-xs font-semibold text-slate-500">
                        {invite.status} • expires {new Date(invite.expires_at).toLocaleString()}
                      </p>
                    </div>
                    {invite.status === 'pending' && (
                      <div className="flex gap-2">
                        <button className="text-xs font-black text-primary-600" onClick={() => resendInviteMutation.mutate(invite.id)}>
                          Resend
                        </button>
                        <button className="text-xs font-black text-red-600" onClick={() => revokeInviteMutation.mutate(invite.id)}>
                          Revoke
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
