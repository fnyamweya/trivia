# Trivia Tug-of-War 🎮

A production-grade, realtime classroom trivia game built with Cloudflare's edge computing stack.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Cloudflare Edge                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌──────────────────────────────────────────┐│
│  │             │    │              Worker                       ││
│  │   Browser   │◄──►│  ┌────────┐  ┌─────────────────────────┐ ││
│  │             │    │  │  Hono  │  │   Durable Object        │ ││
│  └─────────────┘    │  │ Router │  │  ┌─────────────────────┐│ ││
│        │            │  │        │  │  │  Session State      ││ ││
│        │ WebSocket  │  │ - REST │  │  │  - Players          ││ ││
│        └────────────┼──│ - Auth │  │  │  - Questions        ││ ││
│                     │  │ - CORS │  │  │  - Tug Position     ││ ││
│                     │  └────────┘  │  │  - WebSocket Hub    ││ ││
│                     │       │      │  └─────────────────────┘│ ││
│                     │       ▼      └─────────────────────────┘ ││
│                     │  ┌────────┐                               ││
│                     │  │   D1   │  ┌─────────┐                  ││
│                     │  │  (SQL) │  │ Queues  │                  ││
│                     │  └────────┘  │(Analytics)│                ││
│                     │              └─────────┘                  ││
│                     └──────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite 6, TanStack Router & Query, Tailwind CSS |
| Backend | Cloudflare Workers, Hono, D1 (SQLite), Durable Objects |
| Realtime | WebSocket via Durable Objects |
| Auth | JWT (jose) with teacher/student flows |
| Build | pnpm workspaces, Turborepo, tsup |
| Deploy | Cloudflare Workers Builds, GitHub Actions |

## Project Structure

```
trivia/
├── apps/
│   ├── api/                    # Cloudflare Worker API
│   │   ├── migrations/         # D1 SQL migrations
│   │   ├── seeds/              # Seed data
│   │   └── src/
│   │       ├── routes/         # Hono route handlers
│   │       ├── durable-objects/# Session WebSocket handler
│   │       ├── auth/           # JWT & rate limiting
│   │       ├── db/             # D1 helpers & idempotency
│   │       └── observability/  # Logging & error handling
│   │
│   └── web/                    # React SPA
│       └── src/
│           ├── routes/         # TanStack file-based routes
│           ├── components/     # React components
│           ├── stores/         # Zustand state stores
│           └── lib/            # API & WebSocket clients
│
├── packages/
│   └── shared/                 # Shared types, protocol, validation
│       └── src/
│           ├── types/          # Domain types
│           ├── protocol/       # WebSocket message definitions
│           ├── validation/     # Zod schemas
│           └── constants/      # Game constants
│
├── turbo.json                  # Turborepo config
├── pnpm-workspace.yaml         # Workspace definition
└── tsconfig.base.json          # Shared TS config
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- Cloudflare account (for deployment)

### Local Development

```bash
# Install dependencies
pnpm install

# Build shared package
pnpm --filter @trivia/shared build

# Start API (runs D1 locally + Worker)
pnpm --filter @trivia/api dev

# Start web app (in another terminal)
pnpm --filter @trivia/web dev
```

The web app will be available at `http://localhost:5173` with the API proxied to port 8787.

### Database Setup

```bash
# Create local D1 database
cd apps/api
pnpm wrangler d1 migrations apply trivia-db --local

# Seed demo data
pnpm wrangler d1 execute trivia-db --local --file=seeds/seed.sql
```

### Seeded Credentials & Game Codes

- Teacher login:
  - Email: `teacher@demo.school`
  - Password: `password123`
- Seeded session join codes:
  - `MATH01` (Math Warmup)
  - `SCI123` (Science Sprint)

### Environment Variables

Create a `.dev.vars` file in `apps/api/`:

```env
JWT_SECRET=your-secret-key-min-32-chars-long
```

## Game Flow

### WebSocket Protocol

1. **Student joins** → `POST /api/v1/auth/student/join` → receives JWT
2. **Connect WebSocket** → `ws://host/api/v1/sessions/:id/ws`
3. **Authenticate** → Send `HELLO` with token → Receive `WELCOME` with session state
4. **Question pushed** → Receive `QUESTION_PUSHED` with stem, choices, timer
5. **Answer** → Send `SUBMIT_ANSWER` → Receive `ANSWER_ACK` with correctness & points
6. **Tug updates** → Receive `TUG_UPDATE` as teams answer
7. **Game ends** → Receive `GAME_END` with winner

### Message Types

```typescript
// Client → Server
type ClientMessage =
  | { type: 'HELLO'; payload: { token: string } }
  | { type: 'SUBMIT_ANSWER'; payload: { instanceId: string; choiceId: string } }
  | { type: 'PING' }

// Server → Client
type ServerMessage =
  | { type: 'WELCOME'; payload: { sessionId, phase, position, teams, students } }
  | { type: 'QUESTION_PUSHED'; payload: { instanceId, stem, choices, timeLimit } }
  | { type: 'TUG_UPDATE'; payload: { position, delta, teamScores } }
  | { type: 'ANSWER_ACK'; payload: { correct, points, streakBonus, newStreak } }
  | { type: 'REVEAL_ANSWER'; payload: { correctChoiceId, stats } }
  | { type: 'GAME_END'; payload: { winner, finalPosition, summary } }
```

## Scoring System

- **Base points**: 100 per correct answer
- **Speed bonus**: Up to 50 points for fast answers (linear decay over question time)
- **Streak bonus**: +10% per consecutive correct (3-streak = 30% bonus, max 50%)
- **Tug mechanism**: Correct answers pull rope toward team's side

## API Endpoints

### Auth
- `POST /v1/auth/teacher/login` - Teacher email/password login
- `POST /v1/auth/student/join` - Student joins with code + nickname

### Sessions (Teacher only)
- `POST /v1/sessions` - Create new session
- `GET /v1/sessions/:id` - Get session details
- `POST /v1/sessions/:id/start` - Start session
- `POST /v1/sessions/:id/end` - End session
- `GET /v1/sessions/:id/roster` - Session roster
- `GET /v1/sessions/:id/ws` - WebSocket upgrade

### Questions (Teacher only)
- `GET /v1/questions` - List questions with cursor pagination
- `POST /v1/questions` - Create question
- `PATCH /v1/questions/:id` - Update question
- `POST /v1/questions/:id/publish` - Publish question
- `POST /v1/questions/:id/retire` - Retire question

### Reports
- `GET /v1/reports/teacher/recent` - Recent sessions for teacher
- `GET /v1/reports/sessions/:id/summary` - Session summary
- `GET /v1/reports/sessions/:id/questions` - Question-level breakdown

## Deployment

### Manual Deploy

```bash
# Deploy to staging
cd apps/api
pnpm wrangler deploy --env staging

# Deploy to production
pnpm wrangler deploy
```

### CI/CD (GitHub Actions)

1. Set repository secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

2. Push to `main` → Auto-deploys to staging
3. Trigger manual workflow → Deploy to production

### Cloudflare Resources

The Worker needs these bindings configured in `wrangler.jsonc`:

- **D1 Database**: `trivia-db`
- **Durable Object**: `SESSION_DO`
- **Queue**: `ANALYTICS_QUEUE` (optional)

## Testing

```bash
# Run all tests
pnpm test

# Run API tests only
pnpm --filter @trivia-tow/api test

# Run with coverage
pnpm --filter @trivia-tow/api test:coverage
```

## Architecture Decisions

### Why Full-Stack Worker?

Single deployment unit serving both SPA and API simplifies:
- CORS (same origin)
- Deployment (one `wrangler deploy`)
- Routing (Worker handles SPA fallback)

### Why Durable Objects?

- Strongly consistent session state
- WebSocket hibernation (cost-efficient idle connections)
- Co-located with compute (low latency)
- Automatic actor model (one instance per session)

### Why D1?

- Familiar SQL (SQLite)
- Replicated to edge locations
- Tight Worker integration
- Good enough for classroom-scale (not millions of writes)

### Event Sourcing (Lite)

`strength_events` table captures game events for:
- Replay/debugging
- Analytics aggregation
- Audit trail

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

## License

MIT