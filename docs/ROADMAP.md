# Roadmap

Roadmap items are goals, **not completed features or guaranteed dates**.

## Phase 0 — project foundation
- [x] Public repository and MIT license
- [x] Initial documentation and catalog format
- [x] Example listings: Blender and Krita
- [x] Agree on UI structure and visual direction (monochrome redesign)
- [x] Select frontend/desktop stack (Tauri 2 + React/TypeScript)

## Supported platform targets

- **v0.1 desktop:** Windows, macOS, and Fedora Linux (same catalog and core experience).
- **Future:** Android, with an adapted interface and Android-compatible software catalog.
- **Out of scope for v0.1:** Android binaries and support commitments for Linux distributions other than Fedora.

See [PLATFORMS.md](PLATFORMS.md) for planned packages and test criteria.

## Phase 1 — usable desktop MVP
- [ ] App shell with Discover and My Library tabs
- [ ] Load and validate the curated catalog
- [ ] Search/filter by category, platform, and license model
- [ ] Manually add executable paths and website shortcuts
- [ ] Launch saved entries with user confirmation where appropriate
- [ ] Local favorites and library persistence
- [ ] Development builds and smoke tests on Windows, macOS, and Fedora
- [ ] Package launchers as .exe for Windows, .dmg for macOS, and .rpm for Fedora
- [ ] Verify app launch behavior and official download links on each of those OSs

## Phase 1.5 — monochrome UI and detection architecture
- [x] Replace purple prototype with minimalist black-and-white interface
- [x] Store verified-source monochrome SVG marks in repository
- [x] Extend catalog schema for per-platform detection identifiers
- [x] Define scan and update result states and adapter boundaries
- [ ] Validate real installations on Windows, macOS, Fedora

See [UI_DESIGN.md](UI_DESIGN.md) and [DETECTION_AND_UPDATES.md](DETECTION_AND_UPDATES.md).

## Phase 2 — operating-system integrations
- [x] Initial read-only Installed scan for Blender and Krita on Windows/macOS/Fedora (broader catalog detection remains future work)
- [ ] Verified installation sources/package manager adapters
- [ ] Update availability reporting with accurate status labels
- [ ] Optional user-approved updates where technically feasible
- [ ] Portable application handling (scanner does not yet detect arbitrary standalone AppImages)
- [x] Direct vendor-file downloads with progress on supported architectures; no automatic installation

## Phase 3 — community store
- [ ] Developer submission guide and review checklist
- [ ] New releases and curated recommendations
- [ ] Community contribution workflow with automated metadata checks
- [ ] Publisher verification and safer update provenance

## Phase 4 — Android (future)
- [ ] Reuse the shared catalog, types, and suitable UI components
- [ ] Build an Android-first navigation and touch interface
- [ ] Filter for Android-compatible applications; do not present desktop installers as mobile-compatible
- [ ] Add Android-specific app discovery and safe hand-off to official distribution channels
- [ ] Test mobile storage, lifecycle, permissions, and opening installed applications
- [ ] Package and test APK / Android App Bundle builds

## Explicitly out of scope for the MVP
- Hosting copies of third-party installers
- Executing arbitrary community-provided scripts
- Universal silent updates for all software
- Commercial app sales, payments, and user accounts

## Success criteria for v0.1
A user can find Blender or Krita, open its official download page, add a locally installed creative application to their library, and launch it again from one desktop interface.

## ArtCraft + native installation phase
- [x] Add all 17 Craft apps with official icons and source links
- [x] Extend read-only scanner with catalog entries
- [x] Add OS installer planning and explicit confirmation
- [x] Add initial DNF/PolicyKit, MSI, WinGet and Homebrew adapters
- [x] Check ArtCraft package SHA-256 against each publisher release manifest
- [ ] Test installs end-to-end on Windows, Fedora and macOS
- [ ] Verify upstream detached signatures against pinned signing keys
- [ ] Automate safe macOS DMG copying (manual Finder step for now)
- [ ] Add true software update detection and upgrades
