import type { Team } from '@trivia/shared';

interface TugMeterProps {
  position: number; // 0-100, 50 = center
  teams: Team[];
}

export function TugMeter({ position, teams }: TugMeterProps) {
  const leftTeam = teams.find((t) => t.side === 'left');
  const rightTeam = teams.find((t) => t.side === 'right');

  // Determine if someone is winning (past thresholds)
  const leftWinning = position < 20;
  const rightWinning = position > 80;

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Team Labels */}
      <div className="flex justify-between mb-2">
        <div className={`flex items-center gap-2 ${leftWinning ? 'scale-110' : ''} transition-transform`}>
          <div className="w-4 h-4 rounded-full bg-team-red" />
          <span className="font-bold text-team-red">
            {leftTeam?.name ?? 'Team Red'}
          </span>
          {leftTeam && (
            <span className="text-sm text-gray-400">
              {leftTeam.score} pts
            </span>
          )}
        </div>
        <div className={`flex items-center gap-2 ${rightWinning ? 'scale-110' : ''} transition-transform`}>
          {rightTeam && (
            <span className="text-sm text-gray-400">
              {rightTeam.score} pts
            </span>
          )}
          <span className="font-bold text-team-blue">
            {rightTeam?.name ?? 'Team Blue'}
          </span>
          <div className="w-4 h-4 rounded-full bg-team-blue" />
        </div>
      </div>

      {/* The Meter */}
      <div className="relative h-10 rounded-full overflow-hidden bg-gray-700">
        {/* Gradient background showing team zones */}
        <div className="absolute inset-0 bg-gradient-to-r from-team-red/30 via-transparent to-team-blue/30" />

        {/* Win zones */}
        <div className="absolute left-0 top-0 bottom-0 w-[20%] bg-team-red/20 border-r border-team-red/50" />
        <div className="absolute right-0 top-0 bottom-0 w-[20%] bg-team-blue/20 border-l border-team-blue/50" />

        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/30" />

        {/* The marker (rope position) */}
        <div
          className="absolute top-1 bottom-1 w-3 rounded-full bg-white shadow-lg transition-all duration-300 ease-out"
          style={{
            left: `calc(${position}% - 6px)`,
            boxShadow: '0 0 10px rgba(255,255,255,0.5)',
          }}
        />

        {/* Glow effect on winning side */}
        {leftWinning && (
          <div className="absolute left-0 top-0 bottom-0 w-1/3 bg-gradient-to-r from-team-red/40 to-transparent animate-pulse" />
        )}
        {rightWinning && (
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-team-blue/40 to-transparent animate-pulse" />
        )}
      </div>

      {/* Position indicator */}
      <div className="text-center mt-2">
        <span className="text-xs text-gray-400">
          {position < 45
            ? `${leftTeam?.name ?? 'Red'} pulling ahead!`
            : position > 55
              ? `${rightTeam?.name ?? 'Blue'} pulling ahead!`
              : 'Evenly matched!'}
        </span>
      </div>
    </div>
  );
}
