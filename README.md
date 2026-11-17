# Canvas Studio

A web app for designing event posters (birthdays, Christmas parties…) from templates and drag-and-drop assets, with PDF/PNG export, sharing, and local-first cloud sync.

## Why

Making a quick party invite shouldn't need an install or a design degree. Canvas Studio opens from a link, keeps working when the connection drops, and syncs your designs to your account when you're back online.

## Features

- **Canvas editor:** drag, resize, rotate and layer shapes, text, stickers and your own images; inline text editing; undo/redo; keyboard shortcuts; zoom and fit.
- **Templates and assets:** birthday, Christmas, party and blank templates in poster, square, story and landscape sizes, plus a bundled sticker library.
- **Export and share:** download as PDF or PNG, or share through the device's share sheet (Web Share API). Browsers that can't share files get a download instead.
- **Share links:** _Copy link_ creates a view-only link (`/s/<id>`). Anyone with it can see the design as an image and download it, but can't edit it. Copy again to refresh the image; _Stop sharing_ turns the link off.
- **Accounts:** email/password sign-in through Supabase Auth. Each user's data is isolated by row-level security on the server and by a separate local database in the browser.
- **Local-first sync:** every edit saves to the browser first. When online, changes upload in the background and arrive live on your other devices (realtime, with polling as a fallback). Conflicting edits never overwrite each other: the server copy wins and your version is kept as a "(conflicted copy)" design.
- **Guest mode:** use the app without an account; designs then stay in this browser only.

## Quick start

```bash
volta install node@24        # or use .nvmrc; Node >= 24 is required
npm install
npm run dev                  # http://localhost:5173
npm test                     # unit + component tests
npm run check                # format, lint, typecheck, tests with coverage
npm run test:db              # SQL tests (RLS, functions) — needs a Postgres, see below
npx playwright install chromium   # once
npm run test:e2e             # browser journeys against the production build
```

**No Supabase project is needed to run it.** With no `.env`, the app runs local-only: choose "Continue without an account" and everything except cloud sync works. To enable accounts and sync, see below.

## Setting up cloud sync (Supabase)

1. Create a project at [supabase.com](https://supabase.com) in the **Sydney (ap-southeast-2)** region (see Data and privacy).
2. Apply the migrations in `supabase/migrations/`, in order. Either paste them into the dashboard SQL editor, or with the Supabase CLI run `supabase link` and then `supabase db push`.
3. Under **Authentication → Providers**, keep Email enabled. Leaving "Confirm email" on is recommended.
4. Under **Authentication → URL Configuration**, set the Site URL to your deployed URL and add `http://localhost:5173` to the redirect allow-list.
5. Copy the project URL and **publishable (anon) key** from **Project Settings → API** into `.env` (`cp .env.example .env`).

The publishable key is designed to ship in browsers; row-level security is what protects each user's data. **Never** put the `service_role`/secret key in `.env`: the app refuses to start if you do.

## End-to-end tests

`e2e/` runs the critical journeys in Chromium against a production build served by `vite preview`, in local-only mode, so no secrets are needed: create a design from a template, edit it, keep it across reloads (including the last edit when the tab is hidden), download a real PNG, the share page for a bad link, a strict CSP, and no console errors or CSP violations.

Against a deployment, `E2E_BASE_URL=https://<preview-url> npm run test:e2e` also checks the HTTP security headers from `vercel.json`.

## Database tests

`supabase/tests/*.test.sql` check the migrations' row-level security and functions on plain Postgres, using small stand-ins for Supabase's `auth` and `storage` schemas. CI runs them against a Postgres service container. Locally:

```bash
docker run --rm -d -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17
npm run test:db
```

The stand-ins aren't a full Supabase: behaviour that depends on real Supabase (Storage API, Auth) is covered by the TypeScript tests with fakes and should be smoke-tested in staging.

## Configuration

| Variable                        | Required | Description                                                  |
| ------------------------------- | -------- | ------------------------------------------------------------ |
| `VITE_SUPABASE_URL`             | for sync | Supabase project URL (https; http only for a local Supabase) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | for sync | Supabase publishable/anon key                                |

Set both or neither; setting only one is a startup error. Values are compiled into the bundle at build time, so they are public by design.

## Deploying (Vercel)

The app is a static SPA. `vercel.json` sets the build, SPA rewrites, long-lived caching for hashed assets and the HTTP security headers (HSTS, `frame-ancestors`, nosniff, COOP, Permissions-Policy). The Content-Security-Policy is injected into `index.html` at build time because it names the Supabase host.

1. Import the repo in Vercel. Framework and build settings come from `vercel.json`.
2. Set the environment variables **per environment** (playbook: environments are isolated):
   - **Production:** the production Supabase project.
   - **Preview:** a separate staging Supabase project, or leave both unset so previews run local-only. Never point previews at production data.
3. Every pull request gets a preview URL; merging to `main` deploys production.

Rollback: promote the previous deployment in the Vercel dashboard (instant, no rebuild).

## Keyboard shortcuts

| Action      | Shortcut                                                    |
| ----------- | ----------------------------------------------------------- |
| Undo / redo | ⌘Z / ⇧⌘Z (Ctrl on Windows/Linux)                            |
| Duplicate   | ⌘D                                                          |
| Delete      | Delete / Backspace                                          |
| Nudge       | Arrow keys (Shift = 10px)                                   |
| Zoom        | ⌘+ / ⌘−                                                     |
| Deselect    | Esc                                                         |
| Edit text   | Double-click; ⌘Enter or click away to finish, Esc to cancel |

## Project structure

```
index.html            App shell (CSP injected at build time)
build/                Build-time helpers (CSP), run by vite.config.mts
src/
  main.tsx            Entry point: config validation and wiring only
  app/                Root App, config, workspace wiring, shared hooks
  shared/             Structured logger
  modules/
    auth/             Supabase client, AuthService, sign-in screen
    designs/          Local database (Dexie/IndexedDB), repositories, home screen
    editor/           Document model, pure operations, undo history, store, canvas UI
    export/           PNG/PDF rendering, file delivery (download / Web Share)
    account/          Account deletion (use case + dialog)
    library/          Templates, stickers, shapes, side panel
    share/            Share links: Supabase adapter, editor link bar, public page
    sync/             Sync engine, Supabase adapter, status badge
  test/               Factories, fakes, react-konva mock
supabase/             SQL migrations (+ rollbacks)
docs/                 Architecture overview and ADRs
vercel.json           Hosting config and security headers
```

## Architecture

See [docs/architecture.md](docs/architecture.md) and [docs/adr/](docs/adr/). The move from Electron to the web is recorded in [ADR 0005](docs/adr/0005-web-app-on-vercel.md), the session-storage trade-off in [ADR 0006](docs/adr/0006-browser-session-storage.md), document versioning in [ADR 0007](docs/adr/0007-design-document-schema-versioning.md) and share links in [ADR 0008](docs/adr/0008-view-only-share-links.md).

## Data and privacy

- **Stored in the browser:** designs and uploaded images in IndexedDB, one database per account. The sign-in session is in localStorage (see ADR 0006).
- **Stored in the cloud (signed-in users only), in Supabase's Sydney region:** email and password hash (Supabase Auth), designs, and uploaded images.
- **Public (only what you share):** for each design you share, its title and a PNG image, readable by anyone with the link until you stop sharing. Images may stay in CDN caches for up to a minute after that.
- **Account deletion (self-service):** _Delete account_ on the home screen, confirmed with your password. It deletes your uploaded files, then your account (which cascades to your designs and share links), then this browser's local copy. The server refuses to delete an account that still has files, so no personal files are orphaned. Each step is safe to retry if it's interrupted.

## Known gaps

- No password reset or MFA UI yet. Supabase supports both; they need screens.
- Account deletion clears the local copy in the browser where you delete it; other browsers keep their local copy until they're signed out (they can't sync it anywhere).
- Deleted designs remain as server-side tombstones; there's no scheduled purge yet.
- **Offline:** editing, saving and guest mode work offline once the page has loaded, and sync catches up when you reconnect. Opening or reloading the page with no connection doesn't work yet: that needs a service worker to cache the app shell (planned). The app asks the browser to keep its data (persistent storage) when you create a design; guests see a note that browser storage can be cleared.
- No error-tracking service yet; logs go to the browser console as structured JSON.
- PDF export is a raster image (PNG) inside a PDF: fine for screens and home printing, not for large-format print.

## Contributing

Every pull request updates this README to match the change (features, setup, configuration, structure, known gaps). CI's **README** check fails a PR that doesn't touch it; add the `skip-readme` label only when there's genuinely nothing to document. Dependabot PRs are exempt.

## Standards

Follows the engineering playbook (`~/Coding Projects/engineering-playbook`).
