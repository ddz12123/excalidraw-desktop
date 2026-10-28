# CLAUDE.md

## Project Structure

This repository is a local-first Electron desktop app, not a published library monorepo.

- **`src/main/`** - Electron main process, window lifecycle, `app://` protocol, offline network blocking
- **`src/preload/`** - minimal isolated preload bridge
- **`excalidraw-app/`** - renderer entry and app UI
- **`packages/`** - internal editor source packages (`common`, `element`, `math`, `utils`, `fractional-indexing`, `laser-pointer`, `excalidraw`)
- **`electron.vite.config.ts`** - main/preload/renderer build configuration

The packages under `packages/` are internal source packages. They are not built or published separately; the renderer imports them through Vite aliases.

## Development Workflow

1. **Editor features**: work in `packages/*`
2. **App integration**: work in `excalidraw-app/`
3. **Desktop shell**: work in `src/`
4. **Checks**: run `pnpm test:typecheck`, `pnpm test:code`, `pnpm test:other`

## Commands

```bash
pnpm install
pnpm dev              # electron-vite dev
pnpm build            # production bundle into out/
pnpm dist             # Windows installer into release/
pnpm test:typecheck
pnpm test:code
pnpm test:other
pnpm fix              # auto-fix formatting and lint issues
```

## Architecture Notes

- pnpm workspaces (`pnpm-workspace.yaml`), no version pin for pnpm
- Vite 8 + electron-vite 6 + Electron 45 + React 19
- Internal packages use path aliases (see `electron.vite.config.ts`, `vitest.config.mts`, `tsconfig.json`)
- The app is fully offline; production requests to remote http(s)/ws(s) are blocked in the main process
