import type { Team } from '@trivia/shared';
import { useAuthStore } from '@/stores/auth';
import { getAvatarForNickname } from '@/lib/avatars';

interface TugMeterProps {
  position: number; // 0-100, 50 = center
  teams: Team[];
}

export function TugMeter({ position, teams }: TugMeterProps) {
  const { user } = useAuthStore();
  const leftTeam = teams.find((t) => t.side === 'left');
  const rightTeam = teams.find((t) => t.side === 'right');

  // Determine if someone is winning (past thresholds)
  const leftWinning = position < 20;
  const rightWinning = position > 80;

  const getStudentAvatar = (student: { id: string; nickname: string }) => {
    if (student.id === user?.id && user.avatarEmoji) {
      return user.avatarEmoji;
    }

    return getAvatarForNickname(student.nickname).emoji;
  };

  const leftPullers = (leftTeam?.members ?? []).slice(0, 3);
  const rightPullers = (rightTeam?.members ?? []).slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-2 flex items-end justify-between px-2">
        <div className="flex gap-1">
          {leftPullers.length === 0 ? (
            <span className="tug-puller-left">🧍</span>
          ) : (
            leftPullers.map((student) => (
              <span key={student.id} className="tug-puller-left" title={student.nickname}>
                {getStudentAvatar(student)}
              </span>
            ))
          )}
        </div>

        <div className="flex gap-1">
          {rightPullers.length === 0 ? (
            <span className="tug-puller-right">🧍</span>
          ) : (
            rightPullers.map((student) => (
              <span key={student.id} className="tug-puller-right" title={student.nickname}>
                {getStudentAvatar(student)}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Team Labels */}
      <div className="flex justify-between mb-2">
        <div className={`flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 ${leftWinning ? 'scale-110' : ''} transition-transform`}>
          <div className="h-4 w-4 rounded-full bg-team-red" />
          <span className="font-black uppercase tracking-wide text-red-100">
            {leftTeam?.name ?? 'Team Red'}
          </span>
          {leftTeam && (
            <span className="text-xs font-bold text-white/80">
              {leftTeam.score} pts
            </span>
          )}
        </div>
        <div className={`flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 ${rightWinning ? 'scale-110' : ''} transition-transform`}>
          {rightTeam && (
            <span className="text-xs font-bold text-white/80">
              {rightTeam.score} pts
            </span>
          )}
          <span className="font-black uppercase tracking-wide text-blue-100">
            {rightTeam?.name ?? 'Team Blue'}
          </span>
          <div className="h-4 w-4 rounded-full bg-team-blue" />
        </div>
      </div>

      {/* The Meter */}
      <div className="relative h-12 overflow-hidden rounded-2xl border-2 border-white/40 bg-[#0c2d63] shadow-xl tug-rope-shake">
        {/* Gradient background showing team zones */}
        <div className="absolute inset-0 bg-gradient-to-r from-team-red/30 via-transparent to-team-blue/30" />

        {/* Win zones */}
        <div className="absolute left-0 top-0 bottom-0 w-[20%] bg-team-red/20 border-r border-team-red/50" />
        <div className="absolute right-0 top-0 bottom-0 w-[20%] bg-team-blue/20 border-l border-team-blue/50" />

        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/30" />

        {/* The marker (rope position) */}
        <div
          className="absolute bottom-1 top-1 w-4 rounded-xl border border-white/60 bg-yellow-300 shadow-lg transition-all duration-300 ease-out"
          style={{
            left: `calc(${position}% - 8px)`,
            boxShadow: '0 0 12px rgba(255, 255, 255, 0.6)',
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
        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/90">
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
