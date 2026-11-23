# Target platforms and delivery plan

**Status:** planning only. No native builds have been implemented or tested.

## Release priorities

| Platform | Target phase | Distribution | Core requirements |
| --- | --- | --- | --- |
| Windows 10/11 | Desktop v0.1 | Signed Windows installer when practical (.exe) | Browse, local library, launch |
| macOS (Apple Silicon; Intel when verified) | Desktop v0.1 | App bundle / .dmg | Browse, local library, launch |
| Fedora Linux (desktop) | Desktop v0.1 | .rpm; AppImage later if feasible | Browse, local library, launch |
| Android | Later | .apk / Android App Bundle | Mobile catalog, Android-specific library and launching |

Windows, macOS and Fedora are **first-class** targets, not "best effort" ports. We aim for feature parity in the Discover and My Library experience, but implementation details will vary.

## Architecture choices

Use Tauri 2 + Rust + React/TypeScript to maximize shared UI and domain logic. Isolate all OS capabilities behind adapters. Treat the app catalog as platform-neutral metadata, not executable instructions.

Shared components:
- Browse/search/filter catalog
- App metadata, categories, publisher details, favorites
- Local user preferences where practical
- Platform availability labels

Platform-specific components:
- Installed application detection and launching
- Selecting executables or desktop entries
- Package manager integration, permission handling and software updates
- Native installer distribution

## Linux implementation: Fedora first

- Develop and smoke-test on current supported Fedora desktop versions.
- Start with ordinary local application launch targets, including `.desktop` entries.
- Explore DNF/RPM and Flatpak adapters only after the base launcher works; do not shell out to arbitrary package commands from catalog data.
- Offer an RPM for native Fedora installation. Evaluate AppImage for portability and runtime compatibility.
- Other Linux distributions are possible later, but not guaranteed for v0.1.

## Windows and macOS

- Support local paths and installed software with user-selected launch targets.
- Provide an installer for Windows and an app bundle/DMG for macOS.
- Test architectures and release signing separately; a successful development build is not a signed public release.

## Android — future phase

Android is **not** a desktop compatibility layer. The future mobile version should:
- reuse the catalog data, favorites logic, and compatible UI components;
- show only Android-compatible software when filtering for installable apps;
- open officially available Android app listing pages or installed apps as permitted;
- offer mobile-specific library and navigation features.

Blender and other desktop-only tools may still appear as informational listings if clearly labeled, but should not show false Android install or launch affordances. Android distribution rules and permission restrictions need fresh review before implementation.

## v0.1 release checklist

- [ ] Native launch and library persistence verified on Windows
- [ ] Native launch and library persistence verified on macOS
- [ ] Native launch and library persistence verified on Fedora
- [ ] Catalog validated and filtered accurately on each desktop OS
- [ ] Windows installer builds and installs in a clean environment
- [ ] macOS bundle/DMG builds and launches in a clean environment
- [ ] Fedora RPM builds and installs in a clean environment
- [ ] Basic OS-specific CI smoke tests and release documentation
- [ ] Honest compatibility notes published for any feature gaps

Official references:
- https://v2.tauri.app/start/prerequisites/
- https://v2.tauri.app/distribute/
- https://v2.tauri.app/distribute/rpm/
- https://v2.tauri.app/distribute/google-play/
