# Application detection and update architecture

**Status: initial native read-only scanner implemented** for Blender, Krita and 17 ArtCraft apps. Running a scan requires an explicit click. App update checking and update execution remain unimplemented. The downloader is separate and never runs downloaded files.

## 1. Sources of truth

The curated catalog (`catalog/apps/*.json`) stores app identity, official links, local monochrome icon paths, and **declarative installation hints**. It is not a source of executable commands.

Per-platform fields are limited to exact identifier arrays:
- Windows: `executableNames`, `wingetIds`
- macOS: `bundleNames`, `homebrewCasks`
- Fedora: `executableNames`, `desktopIds`, `flatpakIds`, `rpmNames`

Identifiers can vary with packaging and publisher. They must be reviewed before inclusion. A hint can locate a candidate; it cannot prove that an app is installed, nor that a particular version is available. The currently included Blender and Krita hints are starting candidates, not verified results on an individual computer.

The app's TypeScript contracts are in `src/integrations/contracts.ts`, with a pure hint mapper in `src/integrations/plan.ts`.

## 2. Scanner lifecycle

1. User opens **Installed** or Discover and explicitly chooses **Scan computer**.
2. The Tauri/Rust backend executes its allowlisted `scan_installed_apps` command and checks platform-specific local sources without a network request.
3. Normalize findings to `InstalledMatch`, linking matched sources to catalog IDs.
4. Report the source, provenance, confidence, optional observed version, and optional launch target.
5. Present ambiguous name-only matches as **Unverified** until user confirmation, never as an exact installed match.
6. Keep results in memory for the active session and provide a manual rescan. No persistent device inventory is collected.
7. Treat absent sources, timeouts and missing permissions as **Unknown**, not `Not installed`.

Do not scan private user document directories or transmit a device software inventory to a server. This feature should run locally by default. Only expose **allowlisted** Rust commands to the webview. Collect diagnostics or telemetry only with explicit opt-in.

## 3. Platform adapters

| Platform | Read-only detection sources | Update sources to investigate |
| --- | --- | --- |
| Windows | WinGet exact-ID listing (if available), known program folders and PATH. Registry scanning is not implemented. | WinGet for exact publisher-verified package IDs; vendor updater otherwise |
| macOS | /Applications and ~/Applications bundles, optional Homebrew casks | Homebrew cask where it is the actual installation channel; otherwise vendor update channel |
| Fedora | RPM database / DNF package list, Flatpak installations, desktop entries | DNF for RPM installations; Flatpak for Flatpak installations; publisher flow otherwise |

The same application may be installed multiple times or via different managers. Preserve installation source **per installation**, not merely per catalog entry. Never attempt to update a manually installed app using an unrelated package manager.

## 4. Update checking

Return an explicit `UpdateAssessment.state`:
- `available`: trusted source positively reports a newer version than the detected installation.
- `current`: the actual managing source confirms current status.
- `unknown`: not checked or insufficient data.
- `manual`: user must open the publisher's official download/updater flow.
- `unsupported`: no verified update provider exists.
- `error`: check failed with a user-readable explanation.

Version comparison is provider-specific. Never guess an update from a GitHub tag alone, a release timestamp, or a different packaging channel. Checking the hub's own version via Tauri Updater is a **separate** capability from updating catalog apps.

## 5. Update execution safety

- Updates start only after the user explicitly confirms a **specific** action.
- The native backend revalidates package ID, manager, package origin, and user approval.
- Use fixed provider operations, not shell command templates stored in manifests.
- Do not execute download URLs or arbitrary scripts submitted by developers.
- Respect privilege prompts from the OS or package manager; never bypass them.
- Where possible, delegate signature verification to trusted vendor/OS package systems.
- Provide progress, errors, and rollback instructions where supported; never promise universal rollbacks.
- Do not silently upgrade software during an app scan.

## 6. Implementation milestones

- [x] Shared app manifest fields and JSON Schema
- [x] Read-only TypeScript contracts and hint planning helper
- [x] Native Rust `scan_installed_apps` IPC for curated apps (initial Fedora, Windows, macOS adapters)
- [ ] Tests against WinGet, Homebrew, DNF and Flatpak fixture data
- [x] Scan results shown in Installed UI, with exact-package vs name-only confidence labels
- [ ] Native `check_updates` IPC, with per-provider state reporting
- [ ] User-confirmed `update_app` IPC with allowlisting and package origin checks
- [ ] Signed public package releases after platform testing

The Installed screen now reports actual scanner findings and source confidence; the Updates screen remains an honest placeholder. See [DOWNLOADS.md](DOWNLOADS.md) for separately implemented direct file downloads.

## Native installations are separate from update checks

A user-confirmed native `preview_install` / `install_app` flow now exists.
It chooses allowlisted package IDs or verified official ArtCraft artifacts,
not arbitrary commands supplied by catalog JSON. The Updates page is
still a placeholder. See [INSTALLATION.md](INSTALLATION.md).
