# Approved applications: downloads and separately reviewed installation

An approved Issue/PR adds catalog metadata, not execution privileges. Every catalog
entry has a Download action. The checked-in approved catalog is also bundled for
offline/browser use; the live main-branch feed still refreshes it. Existing bundled
entries keep precedence over a duplicate remote ID.

For an official GitHub Releases link, the desktop backend resolves the current
stable release using the actual host OS/CPU (not the WebView user agent). It selects
only a unique asset with an explicit platform/architecture suffix and GitHub
SHA-256 digest. Fedora prefers RPM, other Linux systems use AppImage; Windows uses
an explicitly named MSI/EXE and macOS a universal DMG. Unknown naming conventions,
unsupported CPUs, ambiguous/missing assets, missing checksums, API errors/rate
limits and browser-only use fall back to the official page. The history explicitly
labels this manual and does not invent an external download's version or progress.

Native downloads use the existing size-limited, HTTPS GitHub downloader: repository,
release tag, asset ID, filename, size and checksum are checked again when downloading;
partial files are cleaned on failure and existing files are never overwritten. A
release changing after selection fails rather than silently downloading another
version. Downloads do not execute files or mark applications installed.

Catalog transfers retain the catalog app ID and use Downloads for version/progress,
failure/retry and completion. They do not add or update watched GitHub projects or
private shortcuts. Only a separately maintained native installer policy can offer
Install, followed by a preview and explicit confirmation. Personal GitHub downloads
always stay manual even when their repository resembles a curated application.

## BIMCraft review, 2026-11-23

- Request [#12](https://github.com/giovaceciliato/Universal-Creative-Software-Hub/issues/12)
  was merged through [#13](https://github.com/giovaceciliato/Universal-Creative-Software-Hub/pull/13)
  as metadata only.
- [v0.12.0](https://github.com/IPedrax/BIMCraft/releases/tag/v0.12.0) exists with
  x86_64/aarch64 RPM, AppImage, DEB, Flatpak and tarball assets; Windows x64 MSI and
  portable ZIP; macOS universal DMG; and additional riscv64 packages.
- The [versioned README](https://github.com/IPedrax/BIMCraft/blob/v0.12.0/README.md#linux)
  documents Fedora 36+ / glibc 2.35+ for x86_64/aarch64 and `dnf install ./file.rpm`.
  The x86_64 RPM was downloaded for read-only inspection: package name `bimcraft`,
  version `0.12.0`, architecture `x86_64`. Its actual SHA-256 matches both GitHub's
  release digest and `SHA256SUMS`. RPM scriptlets only refresh desktop/MIME/icon caches.
- Guided installation is separately enabled for Fedora 36+ x86_64/aarch64 and
  Windows x64. Only the reviewed v0.12.0 RPM/MSI names and hard-coded hashes are
  accepted, including a check against the publisher checksum manifest. After user
  confirmation, the existing installer downloads to a temporary file, checks it,
  and calls Fedora `pkexec /usr/bin/dnf install` (PolicyKit) or Windows `msiexec /i`
  (normal Installer/UAC). No silent elevation or security bypass is added.
- Future releases remain downloadable but cannot be installed by this policy until
  separately reviewed. Reinstalling after a download may fetch the installer again;
  the preview states the exact version. Linux RPM discovery reports the installed
  version; Windows path discovery does not invent version/installation certainty.
- SHA-256 is an integrity check, not a publisher identity signature. Upstream says
  the Windows installer is not code-signed and macOS is not Developer ID notarized
  or manually tested. macOS therefore stays download/manual: open the DMG and drag
  the app into Applications, consulting upstream instructions and system prompts.
  No launcher automation bypasses Gatekeeper. Other distros/CPUs remain manual.

## Validation and remaining manual checks

`npm run validate:catalog`, existing moderation/approval tests, `npm run build`,
`cargo test --manifest-path src-tauri/Cargo.toml`, and `npm run test:downloads`.
Browser tests mock the native boundary and cover visible Download, offline catalog,
version/progress, no automatic execution, a second Install confirmation, fallback,
checksum failure, preserved built-ins and private-shortcut storage.
Rust tests cover OS/architecture selection, ambiguous/unverified assets, source
validation and the separate pinned installation policy. CI runs browser tests and
native tests/builds on Fedora, Windows and macOS.

Real elevated installations and interactive PolicyKit/UAC prompts have not been
executed as part of these tests. Verify those on clean test systems before shipping;
the tests do not establish that BIMCraft runs correctly on every supported device.
