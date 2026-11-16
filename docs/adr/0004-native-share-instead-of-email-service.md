# 0004 · Native OS share sheet for email and sharing

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

Users want to email or share their designs. Sending email from our side would need a provider, API keys kept server-side, sender-domain verification, abuse and rate limiting, and an internet connection.

## Options considered

1. **Native OS share.** The macOS share sheet (Mail, Messages, AirDrop) via Electron `ShareMenu`; elsewhere the file's folder opens to attach. No secrets, works offline (queued by Mail).
2. **Transactional email service** (e.g. Resend) via a server function.
3. **Both.**

## Decision

Option 1, chosen by the user. The export is written to a private temp folder and handed to the share sheet.

## Consequences

- No server-side email infrastructure or secrets to protect.
- Windows and Linux get "reveal file" rather than a share sheet. A server-sent email option can be added later behind the same `share` IPC without UI changes.
