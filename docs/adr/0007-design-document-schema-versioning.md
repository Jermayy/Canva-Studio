# 0007 · Versioned design documents with forward-only migrations

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

A design is stored as one JSON document (`designs.document` in Postgres, and in IndexedDB). Every document already carried `schemaVersion: 1`, but nothing upgraded old documents, and a document written by a **newer** app was rejected as "invalid" and silently skipped by sync.

On the web this matters more than on the desktop: two tabs or devices can run different deploys at the same time (one tab left open since yesterday), so a newer client writing a newer format is a normal event, not an edge case.

## Options considered

1. **Version field + pure step migrations (v1→v2→…), run before validation.** Old documents are upgraded on read; newer ones are recognised and handled explicitly.
2. **Migrate every row server-side when the format changes** (SQL over `jsonb`). Fast to read, but couples deploys to a data migration, can't reach data in browsers, and JSON reshaping in SQL is error-prone.
3. **Only additive, optional fields forever.** No migrations needed, but the model collects legacy fields and renames become impossible.

## Decision

Option 1.

- `upgradeDesignDocument` (pure, in `editor/domain/designModel.ts`) applies `DOCUMENT_MIGRATIONS[n]` from the stored version up to `DESIGN_SCHEMA_VERSION`, then zod validates the result. A missing step is a loud error.
- **Cloud:** documents are upgraded on pull. A document from a newer version throws `NewerSchemaVersionError`; sync shows "Update available — reload" and does **not** advance its pull cursor, so the design is fetched again once the page reloads onto the new deploy. Nothing is skipped or lost.
- **Local (IndexedDB):** when the version is bumped, add a Dexie `version(n).upgrade()` that runs the same function over stored records, so local data is migrated once when the database opens.
- Pushing writes the current version, so rows upgrade gradually as they're edited. A server-side check rejects documents without a positive integer `schemaVersion`.

## Consequences

- Format changes are a code change plus a pure, unit-tested function; no coordinated data migration.
- Older clients never overwrite newer documents they can't read: they stop pulling and ask for a reload. (Pushing an older-format edit of a design that's newer on the server is caught by the version check in sync as a normal conflict.)
- Migrations must stay in the codebase until no stored document can be older than them.
