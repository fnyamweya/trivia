import { useGameStore } from '@/stores/game';

export function GameEnd() {
  const { winningTeam, teams, position } = useGameStore();

  const leftTeam = teams.find((t) => t.side === 'left');
  const rightTeam = teams.find((t) => t.side === 'right');
  const winner = winningTeam || (position.value < 50 ? leftTeam : rightTeam);

  return (
    <div className="mx-auto max-w-3xl text-center">
      {/* Victory Banner */}
      <div className="mb-8 text-white">
        <div className="text-6xl mb-4">🏆</div>
        <h1 className="mb-2 text-4xl font-black uppercase tracking-tight">Game Over!</h1>
        {winner && (
          <p className="text-2xl font-bold">
            <span
              className={
                winner.side === 'left'
                  ? 'text-team-red font-bold'
                  : 'text-team-blue font-bold'
              }
            >
              {winner.name}
            </span>{' '}
            wins!
          </p>
        )}
      </div>

      {/* Final Scores */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {teams.map((team) => {
          const isWinner = team.id === winner?.id;

          return (
            <div
              key={team.id}
              className={`card ${
                team.side === 'left' ? 'bg-team-red/10' : 'bg-team-blue/10'
              } ${isWinner ? 'ring-2 ring-yellow-400' : ''}`}
            >
              {isWinner && (
                <div className="text-2xl mb-2">👑</div>
              )}
              <h2
                className={`mb-2 text-xl font-black uppercase tracking-tight ${
                  team.side === 'left' ? 'text-team-red' : 'text-team-blue'
                }`}
              >
                {team.name}
              </h2>
              <p className="text-3xl font-black text-slate-700">{team.score}</p>
              <p className="text-sm font-semibold text-slate-500">points</p>
            </div>
          );
        })}
      </div>

      {/* Final Position */}
      <div className="card mb-8">
        <h3 className="mb-4 font-black uppercase tracking-tight text-primary-700">Final Rope Position</h3>
        <div className="relative h-8 overflow-hidden rounded-full bg-slate-700">
          <div className="absolute inset-0 bg-gradient-to-r from-team-red/30 via-transparent to-team-blue/30" />
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/30" />
          <div
            className="absolute bottom-1 top-1 w-3 rounded-full bg-yellow-300 shadow-lg"
            style={{ left: `calc(${position.value}% - 6px)` }}
          />
        </div>
      </div>

      {/* Play Again */}
      <button
        onClick={() => window.location.href = '/'}
        className="btn-primary text-lg px-8 py-3"
      >
        Back to Home
      </button>
    </div>
  );
}
