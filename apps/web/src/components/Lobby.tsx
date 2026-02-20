import { useGameStore } from '@/stores/game';
import { useAuthStore } from '@/stores/auth';
import { getAvatarForNickname } from '@/lib/avatars';

export function Lobby() {
  const { teams, students, phase, myTeamId, soloMode, joinTeam, setSoloMode } = useGameStore();
  const { user } = useAuthStore();

  const myTeam = teams.find((team) => team.id === myTeamId);
  const unassignedStudents = students.filter((student) => !student.teamId);

  const resolveAvatar = (student: { id: string; nickname: string }) => {
    if (student.id === user?.id && user.avatarEmoji) {
      return user.avatarEmoji;
    }

    return getAvatarForNickname(student.nickname).emoji;
  };

  return (
    <div className="mx-auto max-w-3xl text-center">
      {/* Team Assignment */}
      <div className="card mb-6">
        <h1 className="mb-2 text-3xl font-black uppercase tracking-tight text-primary-700">
          Welcome, <span className="text-primary-500">{user?.displayName}</span>!
        </h1>
        {myTeam ? (
          <p className="text-base font-semibold text-slate-600">
            You're on{' '}
            <span
              className={
                myTeam.name.toLowerCase().includes('red')
                  ? 'text-team-red font-bold'
                  : 'text-team-blue font-bold'
              }
            >
              {myTeam.name}
            </span>
          </p>
        ) : (
          <p className="text-base font-semibold text-slate-600">
            Choose a team or play in <span className="font-black text-primary-600">Solo Mode</span>.
          </p>
        )}

        <p className="mt-2 text-xs font-black uppercase tracking-wide text-primary-600">
          Selected style: {user?.preferredMode === 'individual' ? 'Individual' : 'Team Game'}
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {teams.map((team) => {
            const isSelected = team.id === myTeamId && !soloMode;
            return (
              <button
                key={team.id}
                onClick={() => joinTeam(team.id)}
                className={`rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50 shadow-lg shadow-primary-500/20'
                    : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow-md'
                }`}
              >
                <p className="text-sm font-black uppercase tracking-wide text-slate-700">{team.name}</p>
                <p className="text-xs font-semibold text-slate-500">Join team play</p>
              </button>
            );
          })}

          <button
            onClick={() => setSoloMode(true)}
            className={`rounded-2xl border-2 px-4 py-3 text-left transition-all ${
              soloMode
                ? 'border-primary-500 bg-primary-50 shadow-lg shadow-primary-500/20'
                : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow-md'
            }`}
          >
            <p className="text-sm font-black uppercase tracking-wide text-slate-700">Solo Mode</p>
            <p className="text-xs font-semibold text-slate-500">Play independently</p>
          </button>
        </div>
      </div>

      {/* Players Grid */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {teams.map((team) => {
          const teamStudents = students.filter((s) => s.teamId === team.id);
          const isMyTeam = team.id === myTeamId && !soloMode;

          return (
            <div
              key={team.id}
              className={`card ${
                team.side === 'left' ? 'bg-team-red/10' : 'bg-team-blue/10'
              } ${isMyTeam ? 'ring-2 ring-primary-400' : ''}`}
            >
              <h2
                className={`mb-4 text-xl font-black uppercase tracking-tight ${
                  team.side === 'left' ? 'text-team-red' : 'text-team-blue'
                }`}
              >
                {team.name}
              </h2>

              {teamStudents.length === 0 ? (
                <p className="text-sm font-semibold text-slate-500">No players yet</p>
              ) : (
                <ul className="space-y-2">
                  {teamStudents.map((student) => (
                    <li
                      key={student.id}
                      className={`flex items-center gap-2 ${
                        student.id === user?.id ? 'font-bold' : ''
                      }`}
                    >
                      <span className="text-lg leading-none">{resolveAvatar(student)}</span>
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                      {student.nickname}
                      {student.id === user?.id && (
                        <span className="text-xs font-black uppercase text-primary-500">(you)</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Solo/Unassigned */}
      {unassignedStudents.length > 0 && (
        <div className="card mb-6">
          <h3 className="mb-3 text-lg font-black uppercase tracking-tight text-primary-700">Solo Players</h3>
          <div className="flex flex-wrap justify-center gap-2">
            {unassignedStudents.map((student) => (
              <span key={student.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-600">
                <span className="mr-1">{resolveAvatar(student)}</span>
                {student.nickname}
                {student.id === user?.id ? ' (you)' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="card">
        {phase === 'lobby' ? (
          <>
            <div className="animate-bounce text-4xl mb-4">⏳</div>
            <h2 className="mb-2 text-xl font-black uppercase tracking-tight text-primary-700">Waiting for Game to Start</h2>
            <p className="font-semibold text-slate-600">
              The teacher will start the game once everyone has joined.
            </p>
          </>
        ) : phase === 'ready' ? (
          <>
            <div className="text-4xl mb-4">🚀</div>
            <h2 className="mb-2 text-xl font-black uppercase tracking-tight text-primary-700">Get Ready!</h2>
            <p className="font-semibold text-slate-600">The game is about to begin...</p>
          </>
        ) : null}
      </div>

      {/* Tips */}
      <div className="mt-6 rounded-2xl border-2 border-white/60 bg-white/80 p-4">
        <h3 className="mb-2 font-black uppercase tracking-tight text-primary-700">Quick Tips</h3>
        <ul className="space-y-1 text-sm font-semibold text-slate-600">
          <li>🎯 Answer quickly for bonus points</li>
          <li>🔥 Build streaks for extra points</li>
          <li>🤝 Work with your team to pull the rope</li>
        </ul>
      </div>
    </div>
  );
}
