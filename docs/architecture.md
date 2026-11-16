# Architecture

## Containers

```mermaid
flowchart LR
  subgraph Desktop["Electron app (per device)"]
    R["Renderer (React, sandboxed)<br/>editor · library · home · auth"]
    P["Preload<br/>window.canvasStudio"]
    M["Main process<br/>IPC · file save/share · window security"]
    IDB[("IndexedDB<br/>one DB per user")]
    KC[("OS keychain<br/>encrypted session")]
    R -- "typed IPC (invoke)" --> P --> M
    R --> IDB
    M --> KC
    M --> OS["Save dialog · Share sheet"]
  end
  subgraph Supabase
    AUTH["Auth"]
    PG[("Postgres<br/>designs + RLS")]
    RT["Realtime"]
    ST[("Storage<br/>design-assets")]
  end
  R -- "HTTPS (15s timeout)" --> AUTH
  R -- "HTTPS" --> PG
  R -- "WSS" --> RT
  R -- "HTTPS" --> ST
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

- **Offline-first.** The UI only ever talks to the local database. Sync is a background process that can fail without affecting editing.
- **Per-user isolation.** On the device, each account gets its own IndexedDB database (`canvas-studio-<userId>`). In the cloud, RLS policies restrict every row and storage object to `auth.uid()`.
- **No lost work.** Optimistic concurrency (`version`) detects concurrent edits; the losing side becomes a separate design instead of being overwritten. Deletions are tombstones, so they propagate too.
- **Validated boundaries.** IPC payloads (zod plus file signatures), cloud rows (zod), dropped drag payloads (zod), uploads (MIME allow-list, signatures, size, SHA-256 integrity on download) and new or patched elements are all validated.
- **Hardened Electron.** Context isolation, sandbox, no Node in the renderer, IPC sender origin checks, navigation and new windows blocked (https opens in the browser), and a strict CSP limiting network access to the configured Supabase host.

See `docs/adr/` for the reasoning behind each choice.
