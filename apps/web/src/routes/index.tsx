import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">
            Trivia Tug-of-War
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Realtime classroom trivia competition
          </p>
        </div>

        <div className="space-y-4">
          <Link
            to="/join"
            className="btn-primary w-full block text-lg py-3"
          >
            🎮 Join Game
          </Link>

          <Link
            to="/teacher/login"
            className="btn-secondary w-full block text-lg py-3"
          >
            👨‍🏫 Teacher Login
          </Link>
        </div>

        <div className="pt-8">
          <div className="tug-meter">
            <div className="tug-marker animate-pulse-slow" style={{ '--tug-position': 50 } as React.CSSProperties} />
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Answer questions correctly to pull the rope!
          </p>
        </div>
      </div>
    </div>
  );
}
