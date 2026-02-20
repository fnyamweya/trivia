import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-8 text-center">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-primary-700">
            Trivia Tug-of-War
          </h1>
          <p className="mt-2 text-base font-semibold text-slate-600">
            Realtime classroom trivia competition
          </p>
        </div>

        <div className="space-y-4">
          <Link
            to="/join"
            className="btn-primary block w-full text-base"
          >
            🎮 Join Game
          </Link>

          <Link
            to="/teacher/login"
            className="btn-secondary block w-full text-base"
          >
            👨‍🏫 Teacher Login
          </Link>
        </div>

        <div className="rounded-2xl border-2 border-slate-100 bg-slate-50 p-4">
          <div className="tug-meter">
            <div className="tug-marker animate-pulse-slow" style={{ '--tug-position': 50 } as React.CSSProperties} />
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Answer questions correctly to pull the rope!
          </p>
        </div>
      </div>
    </div>
  );
}
