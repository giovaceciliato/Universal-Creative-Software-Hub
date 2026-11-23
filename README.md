# Universal Creative Software Hub

**A customizable desktop launcher and curated store for free creative software.**

Universal Creative Software Hub aims to make creative tools easier to discover, organize, launch, and keep up to date — from established applications like **Blender** and **Krita** to tools built by independent developers.

> **Status:** Alpha desktop application. Catalog discovery, local shortcuts, manual installed-app scanning, and publisher-file downloads are implemented in source. Native installation of supported catalog apps is in alpha; third-party update management remains **unimplemented**.

## Vision

A single place where artists and makers can:
- **Discover** free creative software for 3D, illustration, animation, photography, video, audio, and experimental art.
- **Build a personal library** of installed software, portable applications, web apps, and custom shortcuts.
- **Launch** their creative tools without switching between multiple launchers.
- **Stay updated** through supported, trustworthy update sources.
- **Support independent developers** by finding their projects alongside established software.

Free and open-source software is welcome, as is legitimately distributed freeware. Each listing should explain its license and download source. Inclusion does not imply endorsement by the application's publisher.

## Planned experience

| Area | What it does |
| --- | --- |
| Discover | Curated catalog, categories, search, developer profiles |
| My Library | Customizable shortcuts, installed apps, web links, portable software |
| Updates | Per-app status and updates via verified sources, where technically supported |
| Developer submissions | Contributions and app listings reviewed through GitHub |

## First catalog entries

| App | Category | Official download |
| --- | --- | --- |
| [Blender](https://www.blender.org/) | 3D, animation, rendering | [Blender download](https://www.blender.org/download/) |
| [Krita](https://krita.org/) | Digital painting, illustration | [Krita download](https://krita.org/en/download/) |

The catalog is stored in [`catalog/apps/`](catalog/apps/). Initially, entries link to **official download pages**; this repository does not host or redistribute their installers.

## Technical direction (proposed, not yet finalized)

- Desktop shell: **Tauri + Rust**
- Interface: **TypeScript + React**
- Local preferences and library: **localStorage** in the current prototype; SQLite is a possible later migration
- Catalog: versioned JSON manifests, with community contributions through pull requests
- Update/install adapters: platform-native package managers and publisher-supported channels, introduced incrementally

### Target platforms

**Initial desktop release: Windows, macOS, and Fedora Linux.** Android is planned for a later release, not for v0.1. These are development targets, not shipping claims.

| OS | Planned distribution | Initial priority |
| --- | --- | --- |
| Windows | Windows installer (`.exe`) | v0.1 desktop |
| macOS | DMG / app bundle | v0.1 desktop |
| Fedora Linux | RPM; AppImage as a possible portable option | v0.1 desktop |
| Android | APK / Android App Bundle | Later phase |

Fedora is the primary Linux target for the first release. Other Linux distributions may be supported later but are not a v0.1 commitment.

Core catalog and user-interface code should remain reusable on Android, while OS-specific launching, discovery, installation, updates, and permission handling must be implemented independently. The Android app would feature Android-compatible creative tools; **desktop-only apps such as Blender cannot be assumed to run on Android**.

See [Platform support](docs/PLATFORMS.md) for a more precise target and testing matrix.

## Project documents

- [Architecture](docs/ARCHITECTURE.md)
- [Platform support](docs/PLATFORMS.md)
- [Roadmap](docs/ROADMAP.md)
- [Catalog format](catalog/README.md)
- [Contributing](CONTRIBUTING.md)

## Principles

1. **Creator-first:** make the software easy to find, not the developer hard to find.
2. **Open catalog:** independent developers should have a clear path to submit apps.
3. **User control:** local programs and custom launch targets remain under the user's control.
4. **Secure distribution:** no silent installation from untrusted sources.
5. **Honest licensing:** free, open source, and freeware are distinct labels; respect third-party licenses.

## License

The hub's own source code is licensed under the [MIT License](LICENSE). Third-party applications listed in the catalog retain their **own** licenses, trademarks, and distribution terms.

## Try the early desktop prototype

The desktop prototype includes Discover, catalog search, local favorites and shortcuts, read-only app scanning, native publisher-file downloads, and user-approved installation. Updates are **not implemented**; supported native installations require explicit confirmation.

```sh
npm install
npm run validate:catalog
npm run dev           # browser preview (cannot launch local files)
npm run tauri dev     # native Windows/macOS/Fedora development shell
```

The native command generates temporary platform icons from an SVG source before starting Tauri. Install Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) first.

See [Development](docs/DEVELOPMENT.md) for requirements and current limitations. Cross-platform installers are targets and must pass real build/testing checks before release.

## Monochrome UI and native integration contracts

The next UI iteration uses a **white/black minimalist design**, recognizable local SVG marks for Blender and Krita, and clear separation between **saved software**, **installed software**, and **software updates**.

The catalog also includes declarative per-platform identifiers for future native detection and updates. **An identifier is not proof of installation.** The scanner now executes only on request, using OS/package-manager information for the apps in our catalog. It never triggers updates or installation.

- [UI design](docs/UI_DESIGN.md)
- [Detection and updates architecture](docs/DETECTION_AND_UPDATES.md)
- [Third-party icon credits](docs/ICONS.md)

## Scan and download — early native implementation

In the desktop app, click **Scan computer** under Discover or Installed. The read-only scanner recognizes **Blender, Krita and the ArtCraft suite** through supported sources via RPM/Flatpak/desktop entries and PATH on Fedora, Homebrew/application bundles on macOS, and WinGet/known locations on Windows. Name-only matches are explicitly marked unverified.

The **Download** button saves an official publisher release file directly into the device's Downloads folder (one-click, with progress). This is a **download**, not an installation or upgrade. Files are not executed automatically. Known SHA-256 hashes are checked; Krita Linux AppImage requires manual signature verification because no SHA-256 hash is pinned yet.

For supported platforms and file versions, see [Direct downloads and integrity](docs/DOWNLOADS.md). On unsupported architectures or in the browser preview, the app links to the official publisher download page instead.

### Run the latest branch

```sh
git fetch origin
git switch feat/native-scan-direct-download
npm install
npm run tauri dev
```

This code is still an alpha. Real scanning and download behavior must be tested on the host platform; GitHub CI checks compilation but cannot validate every existing installation or download mirror.

## Install software and ArtCraft suite

The catalog includes **19 ArtCraft Launcher applications** (17 official and 2 community) from the official
[ArtCraft Team](https://getartcraft.com/apps), with their original app icons.
ArtCraft Studio is separate and is not included in the currently signed Craft app catalog.

Click **Install app** to review the release, provider and expected authorization
prompt before proceeding. Windows uses WinGet or MSI; Fedora uses DNF and
PolicyKit; macOS uses Homebrew or opens ArtCraft DMGs for manual finishing.
The **Download** action remains separate.

ArtCraft installers are restricted to allowlisted `storytold` GitHub releases,
with SHA-256 verification against the publisher's release manifest. No
catalog-provided scripts are ever executed.

See [Native installation and security](docs/INSTALLATION.md) and
[ArtCraft suite](docs/ARTCRAFT_SUITE.md). Native installation needs real-OS
testing; it is not a guaranteed one-click install on every platform.

```sh
git fetch origin
git switch --track origin/feat/native-install-artcraft-suite
npm install
npm run tauri dev
```

## Downloads dashboard and signed ArtCraft synchronization

The **Downloads** tab now shows queued downloads, live progress, completed and
failed transfers, and installation tasks. Each task shows the package version
selected and, if a prior scan found it, the currently installed version.
Transfer history is stored **locally** (up to 100 entries); interrupted tasks
are marked as such on restart. Files are not installed automatically from a
download task; **Install app** still requests explicit confirmation.

The **ArtCraft suite** uses the official **Ed25519-signed hosted catalog**
from `https://getartcraft.com/launcher-catalog.toml`, with signature at
`https://getartcraft.com/launcher-catalog.toml.sig`. The backend verifies
the exact upstream bytes against the official launcher's pinned public key.
The app checks on startup and on **Refresh ArtCraft**, and falls back to the
bundled entries offline. The signed catalog currently includes **SolidCraft**
(Tangency Labs) and **MailCraft** (UCS Care Group), which are bundled locally
with their original icons and credits.

New signed-catalog entries can appear in Discover without a Creative Hub
release. They are **listing-only** until a reviewed native installer adapter
is added; signed catalog data does not authorize execution of new programs.
No automatic software update check is claimed by the version-change counter.

See [Downloads activity](docs/DOWNLOADS.md) and
[Signed ArtCraft sync](docs/ARTCRAFT_SYNC.md).

## Creative Top 50 collection (2026)

The original **50 recommended free creative applications** are now in Discover,
with no duplicate listings for Blender or Krita. This adds **48** new
applications to the previous 21-entry catalog, for **69 bundled listings**.

Select **Creative Top 50** in Discover to show the selected 50. Other catalog
entries, including ArtCraft Launcher community apps, remain available in
**All software**.

The collection includes drawing, illustration, photography, publishing, UI,
3D, CAD, animation, video, audio, and creative coding. Web-only tools such as
Excalidraw, Penpot, Graphite, SVG-Edit and Wick Editor open in a browser
instead of pretending to install a native app. DaVinci Resolve Free is
proprietary freeware rather than open source; Fedora is not an officially
supported Linux host for its own installer.

On **Fedora Workstation**, an initial set of **23 reviewed Fedora RPM
packages** can be installed directly via DNF after user confirmation and
the normal PolicyKit authorization prompt. Other entries continue to open
official publisher distribution pages. No new manifest automatically
authorizes executing an installer.

See [Creative Top 50](docs/CREATIVE_TOP_50.md) and
[Native installation](docs/INSTALLATION.md).

### Try this branch

```sh
git fetch origin
git switch --track origin/feat/expand-50-creative-software-catalog
npm install
npm run tauri dev
```
