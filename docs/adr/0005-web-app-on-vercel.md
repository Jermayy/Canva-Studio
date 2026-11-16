# 0005 · Web app (static SPA on Vercel) instead of Electron

- **Status:** Accepted
- **Date:** 2026-11-16
- **Supersedes:** [0001](0001-electron-react-desktop-stack.md), [0004](0004-native-share-instead-of-email-service.md)

## Context

The desktop build had real costs for the people it was meant for: a ~270 MB unsigned download, Gatekeeper warnings, and no way to try it from a link. The project also needs to be easy to evaluate (a reviewer should reach a working editor in seconds), and share links (ADR 0007) need a public URL anyway.

The renderer only depended on Electron through one typed API (`window.canvasStudio`: session storage, file save/share, app info). Editor, local database (IndexedDB via Dexie), sync and export encoding already ran in a browser.

## Options considered

1. **Static SPA on Vercel.** Plain Vite build; Vercel serves it with HTTP security headers and creates a preview deploy per pull request.
2. **Netlify / Cloudflare Pages.** Equivalent capability; no strong reason to prefer either.
3. **GitHub Pages.** Free, but no custom HTTP headers (no HSTS or `frame-ancestors`) and no per-PR previews.
4. **Keep Electron alongside the web build.** Two targets to test and release for no user who needs the desktop shell today.

## Decision

Option 1, chosen by the user. Electron, the preload and main process are removed. Their responsibilities move to browser APIs behind the same kind of injected adapter:

| Desktop (Electron)                 | Web                                                                   |
| ---------------------------------- | --------------------------------------------------------------------- |
| Save dialog via IPC                | Blob download (`FileDelivery.save`)                                   |
| macOS share sheet / reveal file    | Web Share API with files, falling back to a download                  |
| Session encrypted with OS keychain | Browser storage + strict CSP (ADR 0006)                               |
| IPC payload validation in main     | Same zod + file-signature checks, before the file leaves the app      |
| Navigation/window lockdown         | CSP, `frame-ancestors 'none'`, COOP, Permissions-Policy (vercel.json) |

## Consequences

- Zero-install; any modern browser. Preview deploys per PR give reviewers a live URL.
- Security headers live in `vercel.json` (static) and the CSP `<meta>` tag (built per environment because it names the Supabase host).
- Firefox and several desktop browsers can't share files; they get a download. Email from the server remains a later option.
- New multi-tab behaviour: several tabs can open the same local database and sync it at once, sending duplicate, conflicting writes. Sync passes are serialised across tabs with a Web Lock (`sync/crossTabLock.ts`).
- Browsers may evict IndexedDB data (Safari after 7 days without a visit). The app requests persistent storage and nudges guests to sign in; see README "Known gaps".
