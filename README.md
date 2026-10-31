# Excalidraw Desktop

English | [简体中文](./README.zh-CN.md)

Local-first, fully offline Excalidraw desktop app built with Electron.

Forked from [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw).

## Screenshots

![Excalidraw Desktop](./public/images/home.png)

## Features

- fully local editing, no accounts and no cloud
- local scene persistence, local image storage, local libraries
- close prompt with minimize-to-tray and quit options, plus a tray menu
- custom frameless top bar with window controls and categorized menus
- GitHub Releases auto-update with a Check for updates menu item
- Mermaid to Excalidraw conversion
- file and image export
- local MCP server so Claude Desktop, Cursor and VS Code can drive the canvas
- external network requests blocked in production

## Download

Installers for Windows, macOS and Linux are published on [GitHub Releases](https://github.com/ddz12123/excalidraw-desktop/releases).

## Development

```bash
pnpm install
pnpm dev
```

The project-level `.npmrc` uses npmmirror for the npm registry. The install and package scripts set mirrors for Electron and electron-builder binaries.

If a mirror is unavailable, override it for a single command:

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm install
```

## Build

```bash
pnpm build     # electron-vite production bundle into out/
pnpm build:win # Windows x64 installer + portable exe into release-build/
pnpm dist      # package for the current platform into release-build/
```

Manual platform packaging should run on the matching operating system:

```bash
pnpm exec electron-builder --win --x64
pnpm exec electron-builder --mac --arm64 --x64
pnpm exec electron-builder --linux --x64
```

## Windows artifacts

`pnpm build:win` produces two executables:

- `Excalidraw-Setup-<version>-win-x64.exe` - assisted NSIS installer, used by `electron-updater`
- `Excalidraw-Portable-<version>-win-x64.exe` - portable build, run it directly without installing

The installer flow lets the user choose the installation directory, allows elevation when installing into a protected location, creates desktop and Start menu shortcuts named `Excalidraw`, and uses the custom application icon for the installer, uninstaller and shortcuts.

The portable build extracts itself to a temp directory on every run, but stores scenes, libraries and images in the same `%APPDATA%\Excalidraw` location as the installed app, so both builds open the same data. Since the app is single instance, starting the portable build while the installed app runs only focuses the existing window. Auto-update is not applied to the portable build.

## Release workflow

Pushing a tag starting with `v` (for example `v0.1.0`) triggers `.github/workflows/release.yml`, which builds Windows, macOS and Linux installers, publishes them to GitHub Releases, and uploads `latest.yml` / `latest-mac.yml` / `latest-linux.yml` for `electron-updater`. Bump `version` in `package.json` before tagging so the tag, installer version and updater metadata stay in sync.

Packaged builds check for updates shortly after startup and also expose "Check for updates" in the main menu. Code signing is disabled by default; macOS auto-update requires a signed and notarized app.

## MCP server

The desktop app can expose the open canvas to MCP clients such as Claude Desktop, Cursor and VS Code.

1. Open `Edit → MCP Server…`.
2. Enable the server, then click **Save and apply**.
3. Copy the generated client config into your MCP client and restart it.

The server binds to `127.0.0.1` only and requires the access token shown in the dialog. It provides `get_scene`, `add_elements`, `update_elements`, `delete_elements` and `export_image` tools. The generated config uses `npx -y mcp-remote <endpoint>` so stdio-only clients work; clients with native Streamable HTTP support can use the endpoint URL directly. Settings are stored in `mcp-server.json` in the app's user data directory. `npx` requires Node.js on the machine running the MCP client.

![MCP server example](./public/images/mcp-example.png)

A ready-to-use skill lives at [`skills/excalidraw-desktop-mcp/SKILL.md`](./skills/excalidraw-desktop-mcp/SKILL.md); copy it into any agent's skill/rule directory when needed.

## Checks

```bash
pnpm test:typecheck
pnpm test:code
pnpm test:other
```

## Structure

- `src/main` - Electron main process, window, offline protocol and updater
- `src/main/mcp` - local MCP server, settings storage and renderer bridge
- `src/preload` - minimal isolated preload bridge
- `excalidraw-app` - renderer entry and app UI
- `excalidraw-app/mcp` - renderer-side MCP tool implementations
- `packages/*` - internal editor source packages (not published)

## License

MIT, see [LICENSE](./LICENSE). Upstream copyright belongs to the Excalidraw authors.
