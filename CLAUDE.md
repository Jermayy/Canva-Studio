# Canvas Studio

Follows Jem's engineering playbook: @~/.claude/playbook/PLAYBOOK.md
(Global standards live in `~/Coding Projects/engineering-playbook`. Anything below overrides them for this project.)

## What this is

Local-first web app (static SPA on Vercel) for designing event posters (birthday, Christmas…) from templates and drag-and-drop assets, with PDF/PNG export, Web Share, share links and Supabase cloud sync. Stage: MVP. Migrated from Electron (ADR 0005).

## Stack

- Runtime: Node 24 for tooling (pinned in `.nvmrc` and `package.json#volta`); runs in modern browsers
- Frameworks: React 19, TypeScript 6 (TS 7 isn't supported by typescript-eslint yet), Vite 8, Konva + react-konva, zustand, zod 4
- Storage: IndexedDB through Dexie (local, one DB per user) + Supabase Postgres/Storage (cloud)
- Auth: Supabase Auth (email/password); session in localStorage under `canvas-studio-auth` (ADR 0006)
- Hosting: Vercel (`vercel.json`: headers, rewrites, caching); Supabase in Sydney (ap-southeast-2)

## Commands

```bash
npm install                  # deps (Node >= 24)
npm run dev                  # http://localhost:5173 (no .env needed: local-only)
npm test                     # all tests (node + jsdom projects)
npm run test:coverage        # with coverage thresholds
npm run test:db              # SQL/RLS tests on Postgres (PG* env vars; CI uses a service container)
npm run test:e2e             # Playwright journeys on the production build (E2E_BASE_URL for a deployment)
npm run lint                 # ESLint (type-aware, strict)
npm run format:check         # Prettier
npm run typecheck            # tsc for node + web projects
npm run check                # everything above; run before saying "done"
npm run build                # typecheck + production bundle in dist/
npm run preview              # serve dist/ locally
```

DB migration: `npx supabase db push --remote` (staging, then production after merge). Deploys, environments, dashboard-only Vercel/Supabase settings and rollback: `docs/runbooks/deploy.md`.

## Structure

- `src/main.tsx` — wiring only (config, Supabase client, browser adapters).
- `src/modules/<feature>/{domain,data,state,hooks,components}` — domain is pure and framework-free; components never call Supabase directly.
- Browser APIs (downloads, Web Share, storage, locks) are injected through small adapters (e.g. `export/fileDelivery.ts`) so they're unit-testable.
- `src/shared` — logger. `build/` — build-time helpers (CSP) used by `vite.config.mts`.
- `src/test` — factories, fake remote store, react-konva DOM mock, render helpers.

## Conventions specific to this project

Adapted from the portable steering kit the project was started with:

- Absolute imports only (`@/…`, `@build/…`); relative imports fail lint (config files excepted).
- Every `if` uses braces (`curly: all`). No non-null assertions in source (allowed in tests after an expectation).
- Every document entering the editor or arriving from the cloud is parsed with zod (`designDocumentSchema`). Patches and new elements are re-validated in `documentOps`.
- Components are functions, never stored in variables; extract a component instead of a `renderX()` helper. Non-component helpers live in non-`.tsx` files (Fast Refresh rule).
- No `setState` inside effects (React Compiler lint): use the "draft is null until edited" pattern (see `fields.tsx`) or set state in callbacks.
- Add tests to an existing test file where one exists. Coverage targets: domain/state/data/sync ≥ 90% lines, components ≥ 70% (enforced in `vitest.config.mts`).
- Logging only via `@shared/logger` (structured JSON, secret keys redacted). `console` is lint-banned elsewhere.
- Never commit or push unless explicitly asked.
- Every PR updates `README.md` (features, setup, config, structure, known gaps — whatever the change affects). CI enforces it (`.github/workflows/readme.yml`); the `skip-readme` label opts out only when there's genuinely nothing to document.

## Deviations from the playbook

- "MUST NOT store tokens in localStorage": **deviation**. A static SPA can't set HttpOnly cookies; the Supabase session is in localStorage, mitigated by a strict CSP and a lint ban on raw HTML injection. Threat model and revisit triggers in ADR 0006.
- No server API of our own: Supabase PostgREST + RLS is the API (ADR 0002). Health endpoints, rate limiting and auth throttling come from Supabase.
- Error tracker not yet integrated (open playbook question on vendor).

## Gotchas

- jsdom lacks canvas, DragEvent and object URLs: tests mock react-konva globally (`test/reactKonvaMock.tsx`), stub `URL.createObjectURL` in `test/setup.ts`, and set drop coordinates with `createEvent` + `defineProperties`.
- Zod 4 runs `.refine` even after a prior check fails; guard inputs inside refinements.
- With fake timers in sync tests, fake only `setTimeout/setInterval` (fake-indexeddb needs real `setImmediate`).
- Browsers can unload a page before an IndexedDB write started in `beforeunload` finishes: autosave also flushes on `visibilitychange`/`pagehide`, and prompts to leave only while edits are unsaved.
- E2E specs run `page.evaluate` code in the browser, hence the separate `tsconfig.e2e.json` with DOM types.
- Konva centred shapes (ellipse/polygon/star) are wrapped in a `Group` so model `x,y` is always the top-left, like rects.

## Sensitive areas

- `build/csp.ts`, `vercel.json` (security headers), `src/modules/auth/*`, `src/modules/export/fileDelivery.ts` (export validation), `supabase/migrations/*` (RLS policies, triggers, security-definer functions). Changes here need a security review (`/security-review`).
