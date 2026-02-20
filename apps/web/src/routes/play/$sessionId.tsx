import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { useGameStore } from '@/stores/game';
import { useAuthStore } from '@/stores/auth';
import { TugMeter } from '@/components/TugMeter';
import { QuestionCard } from '@/components/QuestionCard';
import { Lobby } from '@/components/Lobby';
import { GameEnd } from '@/components/GameEnd';

export const Route = createFileRoute('/play/$sessionId')({
  component: PlayPage,
});

function PlayPage() {
  const { sessionId } = Route.useParams();
  const { accessToken, studentSession, user } = useAuthStore();
  const { connect, disconnect, position, teams, phase, connectionStatus } = useGameStore();

  useEffect(() => {
    if (accessToken) {
      connect(sessionId, accessToken);
    }

    return () => {
      disconnect();
    };
  }, [sessionId, accessToken, connect, disconnect]);

  if (!accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="card text-center">
          <h2 className="text-xl font-bold mb-2">Session expired</h2>
          <p className="text-gray-600 mb-4">Please rejoin the game with your code.</p>
          <Link to="/join" className="btn-primary">
            Go to Join Page
          </Link>
        </div>
      </div>
    );
  }

  if (user?.role !== 'student' || (studentSession && studentSession.id !== sessionId)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="card max-w-md text-center">
          <h2 className="mb-2 text-2xl font-black uppercase tracking-tight text-primary-700">Invalid Session</h2>
          <p className="mb-4 text-sm font-semibold text-slate-600">This play link doesn’t match your active student session.</p>
          <Link to="/join" className="btn-primary">
            Rejoin with Code
          </Link>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'connecting') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Connecting to game...</p>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="card text-center">
          <h2 className="text-xl font-bold text-red-600 mb-2">Connection Error</h2>
          <p className="text-gray-600 mb-4">Failed to connect to the game.</p>
          <button onClick={() => connect(sessionId, accessToken)} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white">
      {/* Tug Meter - Always visible */}
      <div className="sticky top-0 z-10 border-b border-white/20 bg-primary-700/90 p-4 backdrop-blur-sm">
        <TugMeter
          position={position?.value ?? 50}
          teams={teams ?? []}
        />
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {phase === 'lobby' || phase === 'ready' ? (
          <Lobby />
        ) : phase === 'completed' ? (
          <GameEnd />
        ) : phase === 'active_question' || phase === 'reveal' ? (
          <QuestionCard />
        ) : phase === 'paused' ? (
          <div className="card mx-auto max-w-lg py-16 text-center text-slate-700">
            <h2 className="mb-4 text-3xl font-black uppercase tracking-tight text-primary-700">Game Paused</h2>
            <p className="font-semibold">Waiting for teacher to resume...</p>
          </div>
        ) : (
          <div className="card mx-auto max-w-lg py-16 text-center text-slate-700">
            <p className="font-semibold">Waiting for game to start...</p>
          </div>
        )}
      </main>
    </div>
  );
}
