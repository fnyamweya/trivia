import { useGameStore } from '@/stores/game';
import { useAuthStore } from '@/stores/auth';

export function Lobby() {
  const { teams, students, phase } = useGameStore();
  const { studentSession, user } = useAuthStore();

  const myTeam = studentSession?.team;

  return (
    <div className="max-w-2xl mx-auto text-center">
      {/* Team Assignment */}
      <div className="card bg-gray-800 mb-8">
        <h1 className="text-3xl font-bold mb-2">
          Welcome, <span className="text-primary-400">{user?.displayName}</span>!
        </h1>
        {myTeam && (
          <p className="text-lg">
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
        )}
      </div>

      {/* Players Grid */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {teams.map((team) => {
          const teamStudents = students.filter((s) => s.teamId === team.id);
          const isMyTeam = team.id === myTeam?.id;

          return (
            <div
              key={team.id}
              className={`card ${
                team.side === 'left' ? 'bg-team-red/20' : 'bg-team-blue/20'
              } ${isMyTeam ? 'ring-2 ring-primary-400' : ''}`}
            >
              <h2
                className={`text-xl font-bold mb-4 ${
                  team.side === 'left' ? 'text-team-red' : 'text-team-blue'
                }`}
              >
                {team.name}
              </h2>

              {teamStudents.length === 0 ? (
                <p className="text-gray-500 text-sm">No players yet</p>
              ) : (
                <ul className="space-y-2">
                  {teamStudents.map((student) => (
                    <li
                      key={student.id}
                      className={`flex items-center gap-2 ${
                        student.id === user?.id ? 'font-bold' : ''
                      }`}
                    >
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                      {student.nickname}
                      {student.id === user?.id && (
                        <span className="text-xs text-primary-400">(you)</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Status */}
      <div className="card bg-gray-800">
        {phase === 'lobby' ? (
          <>
            <div className="animate-bounce text-4xl mb-4">⏳</div>
            <h2 className="text-xl font-semibold mb-2">Waiting for Game to Start</h2>
            <p className="text-gray-400">
              The teacher will start the game once everyone has joined.
            </p>
          </>
        ) : phase === 'ready' ? (
          <>
            <div className="text-4xl mb-4">🚀</div>
            <h2 className="text-xl font-semibold mb-2">Get Ready!</h2>
            <p className="text-gray-400">The game is about to begin...</p>
          </>
        ) : null}
      </div>

      {/* Tips */}
      <div className="mt-8 p-4 bg-gray-800/50 rounded-lg">
        <h3 className="font-semibold mb-2">Quick Tips</h3>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>🎯 Answer quickly for bonus points</li>
          <li>🔥 Build streaks for extra points</li>
          <li>🤝 Work with your team to pull the rope</li>
        </ul>
      </div>
    </div>
  );
}
