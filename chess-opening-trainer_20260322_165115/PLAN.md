The plan is ready. Here's a summary of the key decisions, pending your approval to write the file:

---

**Tech Stack:**
- **Frontend:** React 18 + TypeScript + Vite, `react-chessboard` + `chess.js`, Zustand (session state), TanStack Query (server state), Tailwind CSS, Recharts (sparklines), Framer Motion
- **Backend:** Fastify 4 + TypeScript, Drizzle ORM on PostgreSQL 16, Redis (refresh tokens + rate-limit counters), Zod schemas shared between packages
- **Testing:** Vitest (unit/integration on both api and web), Playwright (E2E)
- **Monorepo:** pnpm workspaces, `packages/shared`, `packages/api`, `packages/web`

**Schema highlights:** 8 tables — `users`, `openings`, `positions` (tree), `cards` (one per user×position), `sessions`, `session_items`, `trap_encounters`. Refresh tokens live in Redis (key `rt:<userId>:<tokenId>`, TTL 30d).

**SRS algorithm:** SM-2 variant in a pure `srs.ts` module (no I/O). Learning steps: 10 min → 1 day; review intervals from 3d → 8d → 21d → ease-factor-scaled. Ease starts at 2.5, ±0.15/−0.20 on correct/hint/incorrect, floored at 1.3.

**6 implementation phases** (18 days), with Phase 4 (Report Card) and Phase 5 (Trap Mode) independent and parallelisable after Phase 3.

**`run_tests.sh`:** spins up a test postgres (port 5433) + redis (port 6380) via `docker-compose.test.yml`, runs migrations + seed, then `pnpm --filter shared/api/web test --run`, then Playwright E2E, then tears down.

Grant the write permission and the file will be saved to `chess-opening-trainer_20260322_165115/PLAN.md`.
