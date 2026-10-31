# Setup and Development

This guide covers a local development environment for the Svelte frontend and the Tauri v2 shell. The project uses **bun** exclusively for JavaScript dependencies and scripts.

> **Runtime caveat (2026-10-29).** The Tauri v2 migration is complete, and `src-tauri/capabilities/default.json` grants the main window the six core permissions used by the custom title bar. No plugin crates, `invoke_handler` or native commands exist yet, so file dialogs and media metadata are not available. See [../architecture/03-tauri-backend.md](../architecture/03-tauri-backend.md).

## Prerequisites

| Requirement | Why | Check |
| --- | --- | --- |
| **bun** (current release) | Installs dependencies and runs scripts; `bun.lock` is the lockfile | `bun --version` |
| **Rust stable** + Cargo | Compiles the Tauri backend | `rustc --version`, `cargo --version` |
| **WebKitGTK 4.1** and GTK 3 development packages (Linux) | Tauri v2 uses `webkit2gtk-4.1`; v1's `4.0` is not sufficient | `pkg-config --modversion webkit2gtk-4.1` |
| **Build essentials** | C/C++ linker for Rust crates | `cc --version` |
| **Tauri CLI** | Provided by the `@tauri-apps/cli` devDependency; no global install required | `bun run tauri --version` |

### Linux system packages

Debian / Ubuntu:

```bash
sudo apt update
sudo apt install -y \
  build-essential curl wget file patchelf \
  libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev \
  libjavascriptcoregtk-4.1-dev libsoup-3.0-dev \
  librsvg2-dev libayatana-appindicator3-dev libxdo-dev
```

Arch Linux:

```bash
sudo pacman -S --needed \
  base-devel curl wget file openssl patchelf \
  gtk3 webkit2gtk-4.1 librsvg libayatana-appindicator
```

Fedora:

```bash
sudo dnf install gcc gcc-c++ make openssl-devel gtk3-devel \
  webkit2gtk4.1-devel librsvg2-devel libappindicator-gtk3-devel patchelf
```

Package names vary by distribution; the critical requirement is the **4.1** WebKitGTK development package.

- **macOS:** install the Xcode Command Line Tools (`xcode-select --install`).
- **Windows:** install the Microsoft C++ Build Tools and the WebView2 runtime (Evergreen).

## Installation

From the repository root:

```bash
bun install
```

This reads `bun.lock` and installs Svelte, Vite, Tailwind, lucide-svelte, the Tauri JS API/CLI and the tooling. Do not use `npm install`; it creates a second lockfile and may resolve different versions.

## Scripts

`package.json` defines the following frontend and desktop scripts:

| Script | Command | Purpose |
| --- | --- | --- |
| `bun run dev` | `bun run dev:tauri` | Default desktop workflow; Tauri starts Vite itself. |
| `bun run dev:tauri` | `tauri dev` | Desktop shell plus the Vite dev server. |
| `bun run dev:frontend` | `vite` | Browser-only frontend on port 5173. |
| `bun run build` | `bunx tauri build` | Frontend build plus native bundles. |
| `bun run check` | `svelte-check --tsconfig ./tsconfig.json` | Type-check `.svelte` and TypeScript files. |
| `bun run preview` | `vite preview` | Serve the built frontend on port 4173; requires a prior frontend build. |
| `bun run tauri` | `tauri` | Pass-through to the Tauri CLI. |

## Development

### Frontend only (browser)

```bash
bun run dev:frontend
```

Vite serves the app at <http://localhost:5173>. The port is fixed with `strictPort: true`, so Vite fails instead of silently choosing another port. This is the fastest way to work on Svelte/Tailwind and to verify the UI in a browser.

### Desktop shell

```bash
bun run dev
```

or the explicit form:

```bash
bun run dev:tauri
```

`tauri dev` runs `build.beforeDevCommand` (`bun run dev:frontend`), waits for `http://localhost:5173`, then opens the 1200 × 800 window. **Do not start `dev:frontend` in another terminal at the same time** — the second Vite instance cannot bind port 5173.

The v2 configuration provides:

- `build.devUrl: "http://localhost:5173"`;
- `build.beforeDevCommand: "bun run dev:frontend"`;
- a resizable 1200 × 800 window under `app.windows`, with native `decorations` disabled so the in-app title bar is used.

The in-app title bar can be replaced with native decorations from Interface settings (`useSystemTitleBar`). That runtime toggle calls `setDecorations` and is backed by `core:window:allow-set-decorations` in `src-tauri/capabilities/default.json`.

### Type checking

```bash
bun run check
```

The project currently passes with **0 errors and 0 warnings**. Run it after changing stores, component props or event handlers; `vite build` does not type-check.

## Production build

Preferred command:

```bash
bun run build
```

or the equivalent:

```bash
bunx tauri build
```

Flow:

1. Tauri runs `build.beforeBuildCommand` (`bun x vite build`).
2. Vite writes the frontend to `src-tauri/gen/dist/` (`build.outDir` is `src-tauri/gen/dist`).
3. Tauri bundles the app using `build.frontendDist` (`gen/dist`, resolved relative to `src-tauri/`).

Outputs:

- frontend: `src-tauri/gen/dist/`;
- bundles: `src-tauri/target/release/bundle/` (platform-specific: `.deb`/`.rpm`/AppImage, `.dmg`/`.app`, `.msi`/NSIS).

Both directories are gitignored.

To build only the frontend:

```bash
bunx vite build
```

The output path was fixed in commit `b6c72c0`; the previous `../src-tauri/gen/dist` resolved outside the repository. `frontendDist` and `outDir` now point at the same directory.

To preview that frontend build in a browser:

```bash
bun run preview
```

`vite preview` serves the configured `build.outDir` at <http://localhost:4173> by default. It does not build first, so run `bunx vite build` (or `bun run build`) before previewing.

## Troubleshooting

| Symptom | Likely cause | Resolution |
| --- | --- | --- |
| TypeScript syntax errors inside `.svelte` | `svelte-preprocess` not applied, or `<script>` missing `lang="ts"` | Keep the `sveltePreprocess({ typescript: { ... } })` block in `vite.config.ts`; use `<script lang="ts">`; reinstall with `bun install`. |
| `Cannot find module 'svelte-preprocess'` | Dependencies not installed or a non-bun lockfile was used | Run `bun install`; remove stray `package-lock.json` / `yarn.lock` if present. |
| `export 'X' was not found in 'lucide-svelte'` | Icons are named exports in PascalCase; the installed version may not contain a given icon | Import only icons that exist in `lucide-svelte@0.460.0`; use `Play`, `Pause`, `Volume2`, `VolumeX`, `Maximize`, etc. Check the package's exports before inventing a name. |
| Blank window or "connection refused" | Vite is not running, or Tauri is pointed at the wrong port | Start `bun run dev` (which starts Vite through Tauri); keep port 5173, `strictPort: true` and `devUrl` aligned. |
| `Port 5173 is already in use` | A previous Vite or Tauri dev process is still running | Stop the old process (`pkill -f vite` if appropriate); run either `bun run dev` or `bun run dev:frontend`, not both. |
| WebKitGTK / `pkg-config` errors | Missing `webkit2gtk-4.1` development package, or only 4.0 installed | Install the 4.1 dev package for your distribution; restart the shell. |
| `tauri: command not found` | CLI is local, not global | Use `bun run tauri <args>` or `bunx tauri <args>`. |
| Tauri configuration errors mentioning v1 keys | An old `tauri.conf.json` was restored | The committed file uses `https://schema.tauri.app/config/2`; see the key table in [../architecture/03-tauri-backend.md](../architecture/03-tauri-backend.md). |
| `get_webview_window` not found | Building against Tauri v1, or the `tauri::Manager` trait is not imported | Keep `tauri = "2"`; import `tauri::Manager` in the debug block. |
| Window controls do nothing | The capability file is missing or the window label does not match | Keep `src-tauri/capabilities/default.json` with `"windows": ["main"]` and the six `core:window:allow-*` permissions. |
| Plugin or permission errors for dialog/fs/shell | Plugins and native commands are not implemented yet | Expected. The v2 shell has no plugin crates or `invoke_handler`; do not assume native media access. |
| `frontendDist` directory not found | Frontend was never built, or output went to the old path | Run `bunx vite build`; verify `src-tauri/gen/dist/index.html` exists; keep `outDir: 'src-tauri/gen/dist'`. |
| `bun run preview` shows an empty or stale app | No frontend build exists, or the build is outdated | Run `bunx vite build` first; preview serves `src-tauri/gen/dist`, not the Vite dev server. |
| Linker errors while compiling Rust | Missing build essentials or system libraries | Install `build-essential`/`base-devel`, OpenSSL and the WebKitGTK packages. |
| First Tauri build is very slow | Rust compiles all dependencies once | Normal; later builds reuse `src-tauri/target/`. |
| Permission errors writing `src-tauri/gen/dist` | Build directory owned by another user | Fix ownership or remove the stale generated directory. |

## Verification checklist

- [ ] `bun install` completes without changing the lockfile unexpectedly.
- [ ] `bun run dev:frontend` serves <http://localhost:5173> and the six rail destinations render.
- [ ] `bun run check` reports 0 errors and 0 warnings.
- [ ] `bunx vite build` writes `src-tauri/gen/dist/index.html`.
- [ ] `bun run preview` serves that build at <http://localhost:4173>.
- [ ] `cargo check` in `src-tauri/` succeeds with Tauri v2.
- [ ] `bun run dev` opens the 1200 × 800 window without a second Vite process.
- [ ] The in-app title bar controls work, and Interface settings can switch to native decorations.
- [ ] `bun run build` produces a bundle under `src-tauri/target/release/bundle/`.
- [ ] Native media commands remain unavailable until plugins, commands and an `invoke_handler` are added.
