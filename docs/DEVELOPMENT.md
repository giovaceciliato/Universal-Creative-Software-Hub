# Local development

**Development-stage project:** the web preview runs without Tauri, while local executable launching needs the native desktop shell. No releases are published yet.

## Required tooling

- Node.js 22+ and npm
- Rust toolchain (stable) and Cargo for Tauri builds
- Tauri 2 platform dependencies

See https://v2.tauri.app/start/prerequisites/ for up-to-date per-OS prerequisites.

### Fedora Linux

Install the dependencies described in the official Fedora section of the Tauri prerequisites, which include WebKit2GTK 4.1 development files, GTK3 development files, SSL, and a C compiler/toolchain. Fedora is the primary Linux testing target.

## Run frontend preview

```sh
npm install
npm run validate:catalog
npm run dev
```

Open the shown local Vite URL. The preview supports browsing, searching, favorites, and saving website shortcuts; **scanning, native direct downloads, and opening local executables are intentionally unavailable outside of the Tauri desktop application.**

## Run the desktop shell

```sh
npm install
npm run tauri dev
```

The desktop app supports manual read-only app detection, publisher-file downloads, file selection, and user-initiated opening through Tauri's native commands and official dialog/opener plugins. The outcome for `.desktop`, `.app` bundles, and executable formats may differ by OS; do not treat successful file selection as verified launching until tested.

## Build

```sh
npm run build
npm run tauri build
```

The `tauri.*.conf.json` files configure Windows NSIS, macOS DMG, and Linux RPM as intended bundle targets. Platform toolchains and signing/notarization are not handled by the frontend build.

## Project organization

- `src/`: React UI, app catalog import, and local browser storage
- `catalog/apps/`: versioned JSON metadata bundled by Vite
- `src-tauri/`: Rust/Tauri desktop shell and scoped permissions
- `scripts/validate-catalog.mjs`: basic catalog linting

## Current limitations

- Catalog currently has Blender and Krita; download buttons lead to publishers' official pages.
- Saved catalog entries are bookmarks, not proof that the apps are installed.
- A read-only scanner now checks Blender and Krita through platform-specific local package metadata and known paths. Other programs are not yet recognized; source and confidence are shown.
- Publisher-file direct downloads are available on supported architectures, with progress and checksum validation where pinned; no downloaded file is executed.
- User library currently uses localStorage, not SQLite; migration to an application database may follow.
- Native builds and installers must be tested on each target OS before being called released.
- This initial app icon is a temporary neutral geometric placeholder until branding is chosen.
