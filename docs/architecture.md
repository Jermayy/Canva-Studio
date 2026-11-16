# Architecture

## Containers

```mermaid
flowchart LR
  subgraph Browser["Browser tab (per device)"]
    UI["React SPA<br/>editor · library · home · auth"]
    FD["FileDelivery<br/>download · Web Share API"]
    IDB[("IndexedDB<br/>one DB per user")]
    LS[("localStorage<br/>Supabase session (ADR 0006)")]
    UI --> FD
    UI --> IDB
    UI --> LS
  end
  subgraph Vercel
    CDN["Static hosting<br/>security headers · SPA rewrites"]
  end
  subgraph Supabase["Supabase (ap-southeast-2, Sydney)"]
    AUTH["Auth"]
    PG[("Postgres<br/>designs · design_shares + RLS")]
    RT["Realtime"]
    ST[("Storage<br/>design-assets (private)<br/>design-shares (public, by token)")]
  end
  V["Anyone with a share link<br/>/s/&lt;token&gt;"]
  V -- "rpc get_shared_design" --> PG
  V -- "GET &lt;token&gt;.png" --> ST
  CDN -- "HTML/JS/CSS" --> UI
  UI -- "HTTPS (15s timeout)" --> AUTH
  UI -- "HTTPS" --> PG
  UI -- "WSS" --> RT
  UI -- "HTTPS" --> ST
  PG -. "change events" .-> RT
```

## Data flow for an edit

```mermaid
sequenceDiagram
  participant UI as Canvas UI
  participant Store as editorStore (zustand)
  participant Local as LocalDesignRepository (IndexedDB)
  participant Sync as SyncEngine
  participant Cloud as Supabase
  UI->>Store: updateElements(ids, patch)
  Store->>Store: validate (zod) + push undo history, revision++
  Store-->>Local: autosave after 400ms (dirty = 1)
  Local-->>Sync: requestSync() (debounced 1.5s)
  Sync->>Cloud: update … where version = n (sets n+1)
  alt accepted
    Cloud-->>Sync: row v(n+1)
    Sync->>Local: markSynced (clears dirty only if no newer edit)
  else version conflict
    Sync->>Local: keep local as "(conflicted copy)", adopt server copy
  end
  Cloud-->>Sync: realtime change on another device → pull (keyset cursor)
```

## Key properties

- **Local-first.** The UI only ever talks to the local database. Sync is a background process that can fail without affecting editing.
- **Per-user isolation.** On the device, each account gets its own IndexedDB database (`canvas-studio-<userId>`). In the cloud, RLS policies restrict every row and storage object to `auth.uid()`.
- **No lost work.** Optimistic concurrency (`version`) detects concurrent edits; the losing side becomes a separate design instead of being overwritten. Deletions are tombstones, so they propagate too. Sync passes are serialised across browser tabs with a Web Lock, so two tabs never push the same edit.
- **Versioned documents.** Documents carry `schemaVersion`; old ones are upgraded by pure step migrations on read, and ones from a newer deploy pause sync with "reload to update" instead of being skipped (ADR 0007).
- **Validated boundaries.** Exported files (zod plus file signatures), cloud rows (zod), dropped drag payloads (zod), uploads (MIME allow-list, signatures, size, SHA-256 integrity on download) and new or patched elements are all validated.
- **Hardened browser surface.** A build-time CSP (`script-src 'self'`, network and images limited to the configured Supabase host), plus HTTP headers from `vercel.json`: HSTS, `frame-ancestors 'none'`, nosniff, COOP and a restrictive Permissions-Policy. The session is in browser storage, so XSS is treated as the critical risk (ADR 0006).

- **Public only by token.** Share links expose one PNG and title per shared design through a security-definer lookup by exact token; nothing public can be listed (ADR 0008).
- **Authorisation is tested.** RLS policies and SQL functions have tests in `supabase/tests/`, run on Postgres in CI.

See `docs/adr/` for the reasoning behind each choice.
