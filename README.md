# Universal Creative Software Hub

**A customizable desktop launcher and curated store for free creative software.**

Universal Creative Software Hub aims to make creative tools easier to discover, organize, launch, and keep up to date — from established applications like **Blender** and **Krita** to tools built by independent developers.

> **Status:** Early project planning. The desktop application, automatic installation, and update management are **not implemented yet**.

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
- Local preferences and library: **SQLite**
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

The first code prototype is being developed in `feat/desktop-mvp-shell`. It includes Discover, catalog search and filtering, locally saved favorites and shortcuts, and the native Tauri desktop shell. Updates and package installation are **not implemented**.

```sh
npm install
npm run validate:catalog
npm run dev           # browser preview (cannot launch local files)
npm run tauri dev     # native Windows/macOS/Fedora development shell
```

The native command generates temporary platform icons from an SVG source before starting Tauri. Install Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) first.

See [Development](docs/DEVELOPMENT.md) for requirements and current limitations. Cross-platform installers are targets and must pass real build/testing checks before release.
