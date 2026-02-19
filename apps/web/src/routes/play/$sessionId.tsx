import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
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
  const { accessToken } = useAuthStore();
  const { connect, disconnect, position, teams, phase, connectionStatus } = useGameStore();

  useEffect(() => {
    if (accessToken) {
      connect(sessionId, accessToken);
    }

    return () => {
      disconnect();
    };
  }, [sessionId, accessToken, connect, disconnect]);

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
          <button onClick={() => connect(sessionId, accessToken!)} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      {/* Tug Meter - Always visible */}
      <div className="sticky top-0 z-10 bg-gray-900/90 backdrop-blur-sm p-4">
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
          <div className="text-center py-16">
            <h2 className="text-3xl font-bold mb-4">Game Paused</h2>
            <p className="text-gray-400">Waiting for teacher to resume...</p>
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-400">Waiting for game to start...</p>
          </div>
        )}
      </main>
    </div>
  );
}
