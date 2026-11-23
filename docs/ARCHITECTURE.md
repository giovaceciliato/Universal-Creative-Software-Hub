# Architecture — working proposal

This is a **design proposal**, not an implemented architecture.

## Core modules

1. **Catalog service** — reads local/versioned app manifests; later supports signed remote catalog snapshots.
2. **Discover UI** — search, categories, app detail pages, and links to developer websites.
3. **Library service** — user-added paths, installed program entries, portable applications, and web shortcuts, stored locally.
4. **Launch adapters** — open URLs or launch locally selected executables with explicit user action.
5. **Install/update adapters** — platform-specific integrations. Installers are never executed solely because a community catalog entry supplies a URL.
6. **Developer submission workflow** — GitHub pull requests plus review and validation before publication.

## Proposed stack

- Desktop: Tauri 2 (Rust), targeting Windows, macOS, and Fedora Linux
- Future Android app: Tauri 2 mobile support with native Android adapters where necessary
- UI: React and TypeScript
- Local database: SQLite
- Initial catalog: repository JSON files in `catalog/apps/`
- Optional future service: catalog API, only if a static GitHub-hosted catalog becomes limiting

Avoid requiring accounts or a central backend for basic launching and browsing.

## Boundaries and trust

The **catalog is metadata**, not executable configuration.

- Prefer publisher-controlled official pages and package manager identifiers.
- Never let arbitrary catalog JSON specify shell commands to run.
- Verify installers and updates using publisher/platform signing where supported; checksums alone do not authenticate an unknown publisher.
- Require explicit confirmation before installation or execution of newly downloaded software.
- Reject unknown download mirrors and misleading freeware labels.
- Check compatibility and update channels separately on Windows, macOS, and Fedora Linux; add Android separately later.
- Record whether an update is **managed**, **detected but manual**, or **handled by the app itself**.
- Keep license terms and trademark usage independent from the hub's MIT license.

## Platform adapter boundaries

A shared manifest describes the creative application; an OS-specific adapter decides what the local device can actually do.

- **Windows:** local executable discovery, Windows-specific shortcuts, and verified installer/package-manager sources.
- **macOS:** .app bundles, explicit app launching, macOS permissions, and developer signing/notarization for our launcher distribution.
- **Fedora:** .desktop launcher entries, RPM/DNF and Flatpak integration where supported; portable AppImage handling is a separate design decision.
- **Android (future):** browse and launch Android-compatible tools using mobile-specific capabilities and approved distribution mechanisms. The desktop discovery/install APIs must not be reused blindly.

App availability, installability, and update capabilities must be reported independently, per platform. A catalog listing alone does not establish platform support.

## Suggested packages (future)

```text
apps/
  desktop/              # Tauri application and UI
packages/
  catalog/              # Types, schema and parsing
  launchers/             # Local launcher definitions
  update-adapters/       # Platform-specific supported integrations
catalog/
  apps/                  # Curated application manifests
  schema/                # Manifest JSON Schema
docs/
```

Do not create unused packages until implementation begins.

## MVP definition

The first usable release should browse the catalog, search/filter listings, save favorites, and maintain manually entered local launch paths. Automated installs, app detection, and update orchestration are later milestones.
