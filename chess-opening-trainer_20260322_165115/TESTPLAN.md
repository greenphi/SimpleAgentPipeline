The write needs your approval to save `TESTPLAN.md` to `chess-opening-trainer_20260322_165115/`. Once you grant it, here's a summary of what the plan covers:

---

**Structure (13 sections):**

1. **Philosophy & Approach** — pyramid model (unit → integration → E2E), no DB mocking in integration tests, pure modules first, accessibility as a first-class test concern
2. **Test Runner Command** — exact `run_tests.sh` script spinning up Docker (postgres:5433, redis:6380), migrations, seed, then `pnpm --filter shared/api/web test --run`, then Playwright, then teardown
3. **Directory & File Map** — every test file named and placed to match PLAN.md's structure (`packages/shared/api/web/src/__tests__/`, `e2e/tests/`)
4. **SRS Drill Engine** — 13 unit tests for `nextInterval` (learning steps, graduation, review, ease floor/ceiling, lapse), 8 tests for `buildSession`, service unit tests, 11 integration route tests, 10 component tests for `DrillSession` + `HintButton`
5. **Report Card** — 11 unit tests for `computeReportCard` (accuracy, streaks, sparkline trigger, mastery, hardest position), 5 route tests, component + hook tests
6. **Trap Detector/Setter** — session builder unit tests, service unit tests (encounters, stats), 8 route tests, 9 component tests
7. **Authentication** — 14 integration tests covering register, login, refresh, logout, JWT attacks, rate limiting; 6 E2E tests
8. **Database Schema** — constraint and FK tests against real DB, migration idempotency
9. **Edge Cases Catalogue** — SRS engine edge cases, UI race conditions, report card with 0/1 data points, trap mode with 0 traps, JWT `alg:none` attack, SQL injection
10. **Accessibility** — axe-core scans in every E2E spec, aria-live move announcements, focus trapping, color-not-sole-indicator requirement
11. **Performance** — Lighthouse targets (≥90), API p95 < 200ms, bundle < 250kB gzipped
12. **Test Data & Fixtures** — exact seed data for test user, 2 openings, 20 cards in mixed states, 4 traps, 2 completed sessions
13. **CI Configuration Notes** — Node 20, Docker requirement, headless Chromium, clean DB per run
