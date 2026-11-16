# 0001 · Electron + React + Konva desktop stack

- **Status:** Superseded by [0005](0005-web-app-on-vercel.md)
- **Date:** 2026-11-10

## Context

The app must be a desktop executable, use the latest compatible JavaScript/TypeScript/React tooling, work offline, export PDF/PNG and hand files to the OS for sharing. The editor needs a robust canvas with drag, resize, rotate and layering.

## Options considered

1. **Electron + electron-vite + React 19 + Konva.** All TypeScript; mature security model; native file dialogs and macOS share sheet. Large binaries (~270 MB).
2. **Tauri v2 + React.** Much smaller binaries, but needs a Rust toolchain and Rust code for native features; more moving parts.
3. **Fabric.js instead of Konva.** Similar capability; react-konva fits React's declarative model better and has React 19 support.

## Decision

Option 1, chosen by the user. Versions: Electron 45, electron-vite 6, Vite 8, React 19.3, react-konva 19 / Konva 10, TypeScript 6.0. TypeScript 7 is released, but typescript-eslint 8 supports only `<6.1`, and linting is a requirement.

## Consequences

- Large install size; acceptable for a desktop design tool.
- The renderer is untrusted by design: sandboxed, with a minimal typed preload API. The preload may import only `electron` and dependency-free modules.
- Upgrade TypeScript to 7 once typescript-eslint supports it.
