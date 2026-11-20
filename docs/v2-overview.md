# Canvas Studio v2: what changed and why

Branch: `feature-canvas-studio-v2`, built fresh from `main` (v1). This page summarises how v2 differs from v1, the parts of the code worth reading first, what was verified, and what's left before going live. The original brief is at the bottom.

## At a glance

|                 | v1 (main)                            | v2 (this branch)                                                                                                                                                                                              |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering       | Konva (HTML canvas)                  | One React SVG renderer for editor, thumbnails and exports (ADR 0009)                                                                                                                                          |
| Export          | PDF, PNG                             | PDF, PNG, JPEG, **SVG (vector)**; 1–4× scale with dpi readout; JPEG quality; transparent PNG/SVG; custom, validated file names                                                                                |
| Sign-in         | Supabase only (or offline guest)     | Pluggable: device-local accounts (PBKDF2 + throttling) or Supabase Auth; **password reset with recovery codes** that keeps encrypted designs (ADR 0011)                                                       |
| Data at rest    | Plain IndexedDB                      | **AES-256-GCM envelope encryption** per account (ADR 0010)                                                                                                                                                    |
| No-account mode | Guest mode, saved locally            | **Sandbox**: full editor, nothing saved, clearly signposted                                                                                                                                                   |
| Sync            | Real Supabase sync + realtime        | Sync engine with a **simulated** transport (per the brief); status chip, offline, retry/backoff                                                                                                               |
| Sharing         | Download, Web Share, view-only links | Native share sheet, **email draft** (mailto + auto-download), **copy image** to clipboard                                                                                                                     |
| Home            | List of designs                      | **Projects dashboard**: filter by template type, created and last-edited ranges, search, sort, grid/list, all in the URL                                                                                      |
| Elements        | Shapes, text, stickers, images       | 9 shapes, gradients, outlines, shadows, lines/arrows/connectors, 53 icons, text styles and font pairings, images                                                                                              |
| Editor          | Toolbar + properties                 | Tool rail and insert panel, inspector, **Layers panel with plain-language descriptions**, status bar, smart guides, marquee select, rotate/resize handles, **⌘K command palette**, copy/paste, shortcut sheet |
| Feedback        | Basic                                | Live save state (Unsaved → Saving → Saved / Retry), sync state, export phases, skeletons, inline validation, toasts with undo                                                                                 |
| Customisation   | –                                    | Theme (system/light/dark), 6 accents, density, interface scale, canvas backdrop, snapping, layer hints, reduced motion                                                                                        |
| Routing         | Single screen + share page           | `/`, `/sign-in`, `/sign-up`, `/projects?…`, `/studio/:id`, `/sandbox` (History API, guarded)                                                                                                                  |

## Code worth reading first

- **`document/domain/geometry.ts`**: resizing rotated boxes in their own frame, with the opposite handle fixed. This is the maths behind professional-feeling handles.
- **`studio/state/studioStore.ts`**: every edit goes through `commit` (pure operation → zod validation → one undo step → optimistic save). Drags use `beginGesture` / `previewGesture` / `endGesture`, so a drag is a single undo step and a single save.
- **`workspace/state/workspaceStore.ts`**: the optimistic cache with per-document write-behind, flush on hide, retry on failure, delete rollback, and restore for undo.
- **`auth/infrastructure/keyring.ts`** + **`passwordKdf.ts`**: envelope encryption with non-extractable keys; a wrong password fails the GCM tag.
- **`render/DesignSvg.tsx`**: one renderer, so what you see is exactly what you export.
- **`studio/commands.ts`**: one command registry feeds the palette, and shortcuts reuse the same store actions.
- **`document/domain/layers.ts`**: human-readable layer titles, details, state notes and stack positions, shared by the Layers panel, status bar and screen readers.
- **`app/composeServices.ts`**: the composition root; everything else depends on ports. `src/test/testServices.tsx` swaps in fakes to run whole screens in jsdom.

Design principles in practice:

- **SOLID:** small ports (`IdentityProvider`, `Keyring`, `SessionVault`, `DocumentStore`, `AssetStore`, `CloudTransport`, `Rasterizer`, `PdfWriter`, `SvgRenderer`, `FileDelivery`) with swappable adapters.
- **DRY:** one renderer, one command registry, shared export settings between the Export and Share dialogs, and a shared template picker.
- **YAGNI:** no groups, no rulers, no real backend sync; the ports leave room for them.

## What was verified

- `npm run check`: Prettier, ESLint (strict, type-aware), TypeScript (strict), 237 Vitest tests with coverage thresholds (domain/state/data/application ≥ 90% lines, components ≥ 70%) all pass.
- `npm run test:e2e` (Playwright, production build): sandbox → real PNG, JPEG, SVG and PDF downloads with checked file signatures; sign-up → edit → hidden-tab flush → reload → ciphertext-only IndexedDB → dashboard filters; strict CSP; no console errors.
- Manual check in Chrome (dev server): landing, sandbox, drag/resize/undo, export of all four formats (PNG checked visually), sign-up with inline validation, encrypted reload, filters/search, save/sync chips, command palette, light theme with teal accent.

## Known gaps and trade-offs

- Cloud sync is **simulated** (by request). Designs don't roam between devices yet.
- **Password reset needs the recovery code** (ADR 0011): losing both the password and the code still means a lost workspace, by design. The Supabase email-reset path is unit-tested with fakes only.
- PDF is a high-resolution raster inside a vector page, not native vector.
- System fonts only (CSP), so typography can vary slightly between operating systems.
- Mobile layout works but is tuned for tablet and desktop. Touch gestures (pinch-zoom on the canvas) are basic.
- No groups or rulers, and the v1 view-only share links aren't in v2.
- Bundle: the main chunk is ~151 KB gzipped (React, zod, Dexie); the editor and exporters load on demand.

## Action points to take v2 live

1. **Review and merge** the `feature-canvas-studio-v2` PR. CI runs the same checks as above; branch protection requires them.
2. **Decide on accounts in production.**
   - _Device-local only (zero backend):_ unset `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` in the Vercel **Production** environment and redeploy. Everything works today.
   - _Supabase Auth:_ keep the vars. Confirm email confirmation and Site URL / redirect allow-list for `/sign-in` (the runbook lists the dashboard settings). v1's tables are unused by v2 but harmless.
3. **Tell existing v1 users.** v2 uses new database names, so v1 designs saved in the browser won't appear. Either announce it, or ask for a one-off importer (v1 IndexedDB → v2 encrypted workspace) before launch.
4. **Update the privacy wording** if you choose Supabase Auth or add analytics. The landing page currently says designs never leave the device and that sync is simulated.
5. **Before real users:** add an error tracker (the open playbook question on vendor). If you use Supabase, add `/reset-password` to the redirect allow-list and smoke-test the email reset in staging (ADR 0011).
6. **When ready for real sync:** implement `CloudTransport` against Supabase with ciphertext-only rows and v1-style version conflicts. The UI needs no changes.
7. **Smoke-test the preview deployment** (`E2E_BASE_URL=<preview> npm run test:e2e` also checks the security headers), then promote.

## Original brief

Kept verbatim for future reference.

```text
push the branch with the PR description included in it (any live syncing to the cloud can be simulated for now but UI and feedback should be visible for User experience)

VERSION CONTROL:
- switch back to the original branch
- New Branch should be called "feature-canvas-studio-v2"
- Completely fresh implementation

VERSION 2 REQUIREMENTS:
- Implement an advanced version of this application with these key features:
- SECURE login/auth capabilities, offline version with no saving available on the landing page
- Multiple Export/Download file formats: PDF, Jpeg, PNG, Vector
- Filtering by template type, date of creation,last edited
- Live update to local storage with optimistic caching
- dynamic UI feedback on saving, user input
- larger variety of elements for user to interact with
- custom file name input field
- native sharing and email sharing capabilities
- Loading states for UI feedback
- customisable app UI
- user uploaded image use on canvas
- clearer messaging on layers for each element on the canvas

IMPLEMENTATION APPROACH:
- This should feel like a professional business graphic application, assume you are a power user who needs to build high quality graphics for their full time work for professional events. This app should be friendly to casual and professionals alike

Make this implementation completely different to version 1:
- Different UI components and patterns
- Different User Experience Flow
- More Sophisticated Code Architecture
- professional polish and attention to detail

PROCESS:
1. Refer to Main branch with original implementation
2. git branch -b to  "feature-canvas-studio-v2"
3. implement new version of the application respecting all steering files and foundational system design principles (SOLID, YAGNI, DRY, etc)
4. Thoroughly test all functionality
5. Point out final action points required from me to turn this version live if I wish
6. Create a new documentation file that outlines key differences or code stand outs + this prompt for future referral
5. Commit changes and run new dev server when ready

Show me something that would be production/portfolio ready for an employer and ready to market status
```
