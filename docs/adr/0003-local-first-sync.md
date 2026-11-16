# 0003 · Local-first storage with version-checked sync and conflict copies

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

The app must work with no internet and keep changes in the cloud so a user can close the app and continue later on any device. The cloud copy should update live when changes are made.

## Options considered

1. **Cloud as the source of truth, with an offline cache.** Simpler mentally, but editing offline becomes a special mode, and failures surface in the UI.
2. **Local-first (IndexedDB) plus a background sync engine.** The UI never waits on the network. This needs a conflict strategy.
3. **CRDTs (e.g. Yjs).** Merge concurrent edits automatically, but add significant complexity and storage overhead for a mostly single-user app.

Conflict strategies considered for option 2: last-write-wins (silently loses work), or server-wins plus keeping the local edit as a copy.

## Decision

Option 2, with server-wins plus a "(conflicted copy)" design:

- Every edit autosaves locally (400 ms debounce) and marks the record dirty; the sync engine pushes it with `update … where version = n`.
- A pull uses a keyset cursor on server time `(updated_at, id)`, rewound 5 s per run to cover out-of-order commits. Re-applied rows are skipped by version.
- Realtime events trigger a pull; 30 s polling covers missed events and socket outages; regaining connectivity triggers an immediate sync.
- Deletions are tombstones (`deleted_at`) so other devices learn about them.
- Images are content-addressed (SHA-256), uploaded once, and integrity-checked on download.

## Consequences

- No silent data loss; users may occasionally see a conflicted copy to reconcile by hand.
- Tombstones accumulate; a scheduled purge (e.g. after 30 days) is follow-up work.
- Edits are whole-document, so concurrent edits to different elements still conflict. Revisit with CRDTs if real-time co-editing is ever needed.
