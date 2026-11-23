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

- Catalog includes Blender, Krita and 17 ArtCraft apps, with local icons and official distribution pages.
- Saved catalog entries are bookmarks, not proof that the apps are installed.
- The read-only scanner checks the curated catalog against platform metadata and known paths. Unknown portable installs may not be found.
- Publisher-file direct downloads are available on supported architectures, with progress and checksum validation where pinned; no downloaded file is executed.
- User library currently uses localStorage, not SQLite; migration to an application database may follow.
- Native builds and installers must be tested on each target OS before being called released.
- This initial app icon is a temporary neutral geometric placeholder until branding is chosen.

## Native installation

`src-tauri/src/installations.rs` exposes allowlisted `preview_install` and
`install_app` commands. A confirmation modal always precedes installation.

Fedora requires DNF, `pkexec` and a running PolicyKit authentication agent.
Windows uses WinGet or Windows Installer with normal UAC prompts; macOS
requires Homebrew for Blender/Krita while ArtCraft DMGs open for manual copying.
No privilege prompt is bypassed. See [INSTALLATION.md](INSTALLATION.md).

## Downloads dashboard

Transfer history is stored locally under `ucsh:transfers:v1`, capped at 100.
Queued native downloads are serialized in the React session; closing the app
interrupts outstanding work rather than continuing a hidden transfer.
Native installer jobs remain subject to OS authentication.

`src-tauri/src/artcraft_catalog.rs` fetches and verifies the official
signed ArtCraft hosted catalog against the pinned public key in
`src-tauri/assets/`. If the service is unavailable or the signature cannot
be verified, the UI continues with the 19 bundled ArtCraft entries.

The remote catalog is read-only metadata: no new installer executable IDs
are accepted from a network response.

## Featured 50 collection

`catalog/collections/creative-top-50.json` is validated for exactly 50
unique existing catalog IDs during `npm run validate:catalog`.
The catalog contains 69 local entries after this change.
Web apps use a distinct `web` platform and open official URLs instead
of going through OS package managers.

The native scanner bundles all local catalog JSON files as read-only
matching metadata. The Rust installer has a separate allowlist for 23
verified Fedora RPM names; a manifest cannot change the allowlist.

## Tracked GitHub releases

The Tauri module `src-tauri/src/github_projects.rs` implements three
commands: `inspect_github_project`, `check_github_release` and
`download_github_asset`. The React tracker persists up to 25 public
repositories in `ucsh:github-projects:v1`. GitHub downloads are queued
alongside curated downloads through the existing transfer history.

Run the Rust unit tests to validate URL and asset-path checks, followed
by frontend/catalog CI and native Fedora/Windows/macOS builds. Do not
represent a downloaded package as installed or a differing GitHub tag
as a verified software update.
