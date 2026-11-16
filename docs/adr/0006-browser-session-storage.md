# 0006 · Store the Supabase session in browser storage

- **Status:** Accepted (deliberate deviation from playbook `06-frontend-web`: "MUST NOT store tokens in localStorage")
- **Date:** 2026-11-16

## Context

On the desktop the session was encrypted with the OS keychain. A static web app talking directly to Supabase has no server of its own, so it can't set `HttpOnly` cookies. The risk the playbook rule addresses is **XSS**: script running in our origin can read localStorage and steal the refresh token, giving an attacker the user's account until the token is revoked.

## Options considered

1. **localStorage (supabase-js default) + strict CSP.** Session survives reloads and is shared between tabs.
2. **sessionStorage.** Same XSS exposure while the tab is open; users must sign in again in every new tab. Worse UX for little gain.
3. **Backend-for-frontend.** Serverless functions hold the session in an `HttpOnly; Secure; SameSite=Lax` cookie and proxy every Supabase call, including realtime websockets. Meets the rule fully, but adds a server, a proxy for realtime, CSRF protection and a lot of surface for a poster editor.

## Decision

Option 1, chosen by the user, with these mitigations:

- **CSP** with `script-src 'self'` (no inline or third-party script in production), `connect-src` and `img-src` limited to the configured Supabase project, `object-src 'none'`, `base-uri 'none'`. A stolen token can't be sent to an attacker's server by injected script that the CSP blocks.
- **No raw HTML injection** anywhere (React escaping only; lint-enforced). User text is rendered on a canvas, not as HTML.
- **Short-lived access tokens** (Supabase default 1 h) with rotating refresh tokens and reuse detection.
- **Session key namespaced** (`canvas-studio-auth`) and removed on sign-out and account deletion.
- **No third-party scripts** (no analytics or tag managers) on the origin.

## When to revisit

Move to option 3 if any of these become true:

- The app stores personal data beyond an email address and poster designs, or handles payments.
- A customer, security review or compliance regime (e.g. ASVS L2) requires `HttpOnly` sessions.
- Any third-party script must run on the origin.

## Consequences

- Recorded as a deviation in `CLAUDE.md`.
- XSS remains the critical risk; any change that adds `dangerouslySetInnerHTML`, inline scripts or new CSP sources needs a security review.
