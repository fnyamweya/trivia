import { useGameStore } from '@/stores/game';

export function GameEnd() {
  const { winningTeam, teams, position } = useGameStore();

  const leftTeam = teams.find((t) => t.side === 'left');
  const rightTeam = teams.find((t) => t.side === 'right');
  const winner = winningTeam || (position.value < 50 ? leftTeam : rightTeam);

  return (
    <div className="max-w-2xl mx-auto text-center">
      {/* Victory Banner */}
      <div className="mb-8">
        <div className="text-6xl mb-4">🏆</div>
        <h1 className="text-4xl font-bold mb-2">Game Over!</h1>
        {winner && (
          <p className="text-2xl">
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
                team.side === 'left' ? 'bg-team-red/20' : 'bg-team-blue/20'
              } ${isWinner ? 'ring-2 ring-yellow-400' : ''}`}
            >
              {isWinner && (
                <div className="text-2xl mb-2">👑</div>
              )}
              <h2
                className={`text-xl font-bold mb-2 ${
                  team.side === 'left' ? 'text-team-red' : 'text-team-blue'
                }`}
              >
                {team.name}
              </h2>
              <p className="text-3xl font-bold">{team.score}</p>
              <p className="text-sm text-gray-400">points</p>
            </div>
          );
        })}
      </div>

      {/* Final Position */}
      <div className="card bg-gray-800 mb-8">
        <h3 className="font-semibold mb-4">Final Rope Position</h3>
        <div className="relative h-8 rounded-full overflow-hidden bg-gray-700">
          <div className="absolute inset-0 bg-gradient-to-r from-team-red/30 via-transparent to-team-blue/30" />
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/30" />
          <div
            className="absolute top-1 bottom-1 w-3 rounded-full bg-white shadow-lg"
            style={{ left: `calc(${position}% - 6px)` }}
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
