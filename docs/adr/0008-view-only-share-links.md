# 0008 · View-only share links

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

Users want to send a design to people who don't have an account: "anyone with the link can view a non-editable version of the image". Downloading and the Web Share API stay as they are; email from the server is planned for later.

Requirements and constraints:

- Viewers have no account, so the read path must be public, but it must not let anyone list or guess other people's shares.
- No server of our own (ADR 0002): Postgres, RLS and Storage do the enforcement.
- The owner must be able to turn a link off, and deleting a design or the account must remove its public copy.

## Options considered

1. **Snapshot PNG in a public bucket + share table + one security-definer lookup function.** The viewer page calls `get_shared_design(token)` and loads `<token>.png`.
2. **Render the live design document for viewers.** Always current, but exposes the document JSON (and uploaded image files) publicly, needs the editor's renderer on the public page, and makes "non-editable" a UI promise rather than a data boundary.
3. **Signed URLs from a private bucket.** Short-lived URLs need a server (or Edge Function) holding a key to mint them for anonymous viewers.

## Decision

Option 1, chosen by the user.

- **Token:** `design_shares.id` is a random v4 UUID (122 bits); one link per design, stable across re-shares.
- **Public read:** `get_shared_design(share_id)` (security definer) returns one share by exact id and nothing for shares of deleted designs. `anon` has no access to the table, and the share bucket can't be listed, so links can't be enumerated.
- **Image:** `design-shares/<token>.png` in a public bucket, so viewers fetch it directly from the CDN. Named by token, not under the user's folder, so public URLs don't reveal user ids. Storage policies only let the share's owner write it. Capped at 2400 px on the longest side.
- **Snapshot, not live:** "Copy link" saves and syncs the design, then uploads a fresh PNG under the same link. Viewers see the design as of the last copy.
- **Turning off:** "Stop sharing" deletes the image, then the row (image first, so a failure leaves a retryable link rather than a dead link to a live image). Deleting a design kills its link immediately (the lookup checks `deleted_at`) and removes the image best-effort. Account deletion deletes share images before the account (the server refuses otherwise).
- Share pages send `X-Robots-Tag: noindex`.

## Consequences

- No server code; every rule is in SQL and covered by `supabase/tests/share_links.test.sql`.
- Anyone who has the link (or the image URL) can view the image until it's turned off. After turning off, CDN copies can live up to the cache time (60 s for share images).
- Sharing needs an account and a connection, because the image is stored in the cloud.
- A design deleted while offline loses its link at once when the deletion syncs, but its image is only removed if the cleanup call succeeds. Otherwise it stays (unlisted, by URL only) until the account is deleted. A scheduled purge would close this gap.
