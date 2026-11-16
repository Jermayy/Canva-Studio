# Canvas Studio

A desktop poster and graphic designer for events such as birthdays and Christmas parties, with drag-and-drop templates, PDF/PNG export, native sharing and offline-first cloud sync.

## Why

Making a quick party invite or event poster shouldn't need a browser tab or an internet connection. Canvas Studio works fully offline and syncs your designs to your account whenever you're online, so you can close the app and carry on later on any device.

## Features

- **Canvas editor:** drag, resize, rotate and layer shapes, text, stickers and your own images; inline text editing; undo/redo; keyboard shortcuts; zoom and fit.
- **Templates and assets:** birthday, Christmas, party and blank templates in poster, square, story and landscape sizes, plus a bundled sticker library that works offline.
- **Export and share:** download as PDF or PNG, or open the macOS share sheet (Mail, Messages, AirDrop) with the file attached. On Windows and Linux the file's folder opens so you can attach it.
- **Accounts:** email/password sign-in through Supabase Auth. Each user's data is isolated by row-level security on the server and by a separate local database on the device.
- **Offline-first sync:** every edit saves locally first. When online, changes upload in the background and arrive live on your other devices (realtime, with polling as a fallback). Conflicting edits never overwrite each other: the server copy wins and your version is kept as a "(conflicted copy)" design.
- **Offline guest mode:** use the app without an account; designs then stay on this computer only.

## Quick start

```bash
volta install node@24        # or use .nvmrc; Node >= 24 is required
npm install
cp .env.example .env         # optional: fill in Supabase values for cloud sync
npm run dev                  # launches the app with hot reload
npm test                     # unit + component tests
npm run check                # format, lint, typecheck, tests with coverage
```

Leave the Supabase variables empty to run local-only.

## Setting up cloud sync (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the migration in `supabase/migrations/`. Either paste it into the dashboard SQL editor, or with the Supabase CLI run `supabase link` and then `supabase db push`.
3. Under **Authentication → Providers**, keep Email enabled. Leaving "Confirm email" on is recommended.
4. Copy the project URL and **publishable (anon) key** from **Project Settings → API** into `.env`.

The publishable key is designed to ship in client apps; row-level security is what protects each user's data. **Never** put the `service_role`/secret key in `.env`: the app refuses to start if you do.

## Configuration

| Variable                                 | Required | Description                                                  |
| ---------------------------------------- | -------- | ------------------------------------------------------------ |
| `RENDERER_VITE_SUPABASE_URL`             | for sync | Supabase project URL (https; http only for a local Supabase) |
| `RENDERER_VITE_SUPABASE_PUBLISHABLE_KEY` | for sync | Supabase publishable/anon key                                |

Set both or neither; setting only one is a startup error. The values are compiled into the app at build time.

## Building the desktop app

```bash
npm run dist:mac      # dist/Canvas Studio-<version>.dmg (+ .zip)
npm run dist:win      # NSIS installer
npm run dist:linux    # AppImage
```

The builds are **unsigned**. On macOS, the first launch needs right-click → Open. Before distributing to other people, set up code signing and notarization (see the [electron-builder code-signing guide](https://www.electron.build/code-signing)).

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
src/
  main/               Electron main process: window security, IPC, file export, OS keychain store
  preload/            Sandboxed bridge exposing a typed, minimal API (window.canvasStudio)
  shared/             IPC contract and structured logger (used by main and renderer)
  renderer/src/
    app/              Root App, config validation, workspace wiring, shared hooks
    modules/
      auth/           Supabase client, AuthService, sign-in screen
      designs/        Local database (Dexie/IndexedDB), repositories, home screen
      editor/         Document model, pure operations, undo history, store, canvas UI
      export/         PNG/PDF rendering
      library/        Templates, stickers, shapes, side panel
      sync/           Sync engine, Supabase adapter, status badge
supabase/             SQL migration (+ rollback)
docs/                 Architecture overview and ADRs
```

## Architecture

See [docs/architecture.md](docs/architecture.md) and [docs/adr/](docs/adr/).

## Data and privacy

- **Stored locally:** designs and uploaded images, in IndexedDB under the app's user-data folder, one database per account. The sign-in session is encrypted with the OS keychain (Electron `safeStorage`).
- **Stored in the cloud (signed-in users only):** email and password hash (Supabase Auth), designs, and uploaded images.
- **Deletion:** deleting your auth user removes your designs (`on delete cascade`). Uploaded image objects must currently be removed separately; see Known gaps.

## Known gaps

- No password reset, MFA or account-deletion UI yet. Supabase supports all three; they need screens.
- Deleted designs remain as server-side tombstones; there's no scheduled purge yet.
- Images are only removed from storage when the bucket is cleaned manually.
- No error-tracking service (e.g. Sentry) yet; logs go to the console as structured JSON.
- Unsigned builds, and no auto-update.

## Standards

Follows the engineering playbook (`~/Coding Projects/engineering-playbook`).
