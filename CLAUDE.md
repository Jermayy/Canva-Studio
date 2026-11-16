# Canvas Studio

Follows Jem's engineering playbook: @~/.claude/playbook/PLAYBOOK.md
(Global standards live in `~/Coding Projects/engineering-playbook`. Anything below overrides them for this project.)

## What this is

Offline-first Electron desktop app for designing event posters (birthday, Christmas…) from templates and drag-and-drop assets, with PDF/PNG export, native sharing and Supabase cloud sync. Stage: MVP.

## Stack

- Runtime: Node 24 (pinned in `.nvmrc` and `package.json#volta`), Electron 45
- Frameworks: React 19, TypeScript 6 (TS 7 isn't supported by typescript-eslint yet), electron-vite 6 / Vite 8, Konva + react-konva, zustand, zod 4
- Storage: IndexedDB through Dexie (local, one DB per user) + Supabase Postgres/Storage (cloud)
- Auth: Supabase Auth (email/password); session encrypted with OS keychain via `safeStorage`
- Packaging: electron-builder (`electron-builder.yml`)

## Commands

```bash
npm install                  # deps (Node >= 24)
npm run dev                  # app with hot reload
npm test                     # all tests (node + jsdom projects)
npm run test:coverage        # with coverage thresholds
npm run lint                 # ESLint (type-aware, strict)
npm run format:check         # Prettier
npm run typecheck            # tsc for node + web projects
npm run check                # everything above; run before saying "done"
npx electron-vite build      # production bundles in out/
npm run dist:mac             # packaged app in dist/
```

DB migration: apply `supabase/migrations/*.sql` via `supabase db push` or the dashboard SQL editor.

## Structure

- `src/main` — main process; modules take Electron as injected deps so they're unit-testable. `index.ts` is wiring only.
- `src/preload` — sandboxed; may import **only** `electron` and type-only/dependency-free modules (deps are externalized and can't load in the sandbox).
- `src/shared` — IPC contract (`ipc.ts`) and logger.
- `src/renderer/src/modules/<feature>/{domain,data,state,hooks,components}` — domain is pure and framework-free; components never call Supabase directly.
- `src/renderer/src/test` — factories, fake remote store, react-konva DOM mock, render helpers.

## Conventions specific to this project

Adapted from the portable steering kit the project was started with:

- Absolute imports only (`@renderer/…`, `@shared/…`, `@main/…`); relative imports fail lint.
- Every `if` uses braces (`curly: all`). No non-null assertions in source (allowed in tests after an expectation).
- Every document entering the editor or arriving from the cloud is parsed with zod (`designDocumentSchema`). Patches and new elements are re-validated in `documentOps`.
- Components are functions, never stored in variables; extract a component instead of a `renderX()` helper. Non-component helpers live in non-`.tsx` files (Fast Refresh rule).
- No `setState` inside effects (React Compiler lint): use the "draft is null until edited" pattern (see `fields.tsx`) or set state in callbacks.
- Add tests to an existing test file where one exists. Coverage targets: domain/state/data/sync ≥ 90% lines, components ≥ 70% (enforced in `vitest.config.mts`).
- Logging only via `@shared/logger` (structured JSON, secret keys redacted). `console` is lint-banned elsewhere.
- Never commit or push unless explicitly asked.

## Deviations from the playbook

- "MUST NOT store tokens in localStorage": met. Auth tokens go to the main process and are encrypted with the OS keychain. `localStorage` only holds the non-sensitive "offline guest" flag.
- No server API of our own: Supabase PostgREST + RLS is the API (ADR 0002). Health endpoints, rate limiting and auth throttling come from Supabase.
- Error tracker not yet integrated (open playbook question on vendor).

## Gotchas

- If Electron behaves like plain Node (`app` is undefined), the shell has `ELECTRON_RUN_AS_NODE=1` set. VS Code's extension host does this. Run `env -u ELECTRON_RUN_AS_NODE npm run dev`.
- jsdom lacks canvas, DragEvent and object URLs: tests mock react-konva globally (`test/reactKonvaMock.tsx`), stub `URL.createObjectURL` in `test/setup.ts`, and set drop coordinates with `createEvent` + `defineProperties`.
- Zod 4 runs `.refine` even after a prior check fails; guard inputs inside refinements.
- With fake timers in sync tests, fake only `setTimeout/setInterval` (fake-indexeddb needs real `setImmediate`).
- Konva centred shapes (ellipse/polygon/star) are wrapped in a `Group` so model `x,y` is always the top-left, like rects.

## Sensitive areas

- `src/main/secureStore.ts`, `src/main/ipcHandlers.ts` (sender checks, input validation), `src/renderer/src/modules/auth/*`, `supabase/migrations/*` (RLS policies, trigger). Changes here need a security review (`/security-review`).
