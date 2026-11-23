# Direct downloads: sources, security and limitations

**Status:** early implementation. These are fixed, vendor-hosted release files, not an always-latest feed. The update mechanism is separate and not implemented.

## Supported direct-download releases (x86-64 Windows/Fedora, Apple Silicon macOS)

| App | OS | Version | Publisher download file | SHA-256 verification |
| --- | --- | --- | --- | --- |
| Blender | Fedora/Linux x86-64 | 5.3.0 | `blender-5.3.0-linux-x64.tar.xz` | Yes, pinned |
| Blender | Windows x86-64 | 5.3.0 | `blender-5.3.0-windows-x64.msi` | Yes, pinned |
| Blender | macOS arm64 | 5.3.0 | `blender-5.3.0-macos-arm64.dmg` | Yes, pinned |
| Krita | Fedora/Linux x86-64 | 5.3.4.1 | `krita-5.3.4.1-x86_64.AppImage` | **No**, upstream detached signature requires manual verification |
| Krita | Windows x86-64 | 5.3.4.1 | `krita-x64-5.3.4.1-setup.exe` | Yes, pinned |
| Krita | macOS arm64 | 5.3.4.1 | `krita-5.3.4.1-signed.dmg` | Yes, pinned |

**Important:** The Linux Blender file is an archive (`.tar.xz`), not an RPM or a self-installing package. The Linux Krita file is an AppImage, not an RPM. Users must follow each publisher's installation instructions.

For other architectures, the UI falls back to the official publisher download page; do not download an incompatible package and pretend it can run.

## Official source paths

Blender: `https://download.blender.org/release/Blender5.3/`

Krita: `https://download.kde.org/stable/krita/5.3.4.1/`

Official release directories:
- https://download.blender.org/release/Blender5.3/
- https://download.kde.org/stable/krita/5.3.4.1/
- https://krita.org/en/download/

The native Rust backend contains an **explicit allowlist** of app IDs, versions, filenames, sizes and official URLs. Frontend code cannot provide an arbitrary download URL or output path.

## Download workflow

1. User clicks Download for Blender or Krita in the native desktop app.
2. The backend selects a release for the actual OS and CPU architecture.
3. The app downloads via HTTPS, rejecting insecure or local/IP redirects; known publisher files may redirect to HTTPS mirrors.
4. The app writes a `.part` file to the OS Downloads directory, with a fixed maximum size and progress updates.
5. It verifies the expected byte count and, for releases with a pinned SHA-256, the digest.
6. Only after successful checks is the file finalized in Downloads. No archive is unpacked, installed or executed.
7. Existing files are never deliberately overwritten. An existing filename causes an explicit error.

**Krita Linux limitation:** The upstream detached signature is available on the release site, but this implementation does not validate GPG signatures; the app explicitly reports the checksum as unverified. Users should verify the signature with the publisher's instructions before executing the AppImage.

**HTTPS redirects:** KDE may use geographically distributed mirrors. The program accepts HTTPS DNS-name redirects, but hashes guard content integrity wherever pinned. An inaccessible or non-HTTPS mirror produces an error instead of silently falling back to an insecure endpoint.

### Updating versions

The version pin must be reviewed whenever Blender or Krita publishes a new release. The `download_app` API downloads a **specified fixed release**, it does not claim to check which version is the newest. A future update adapter will use actual package-manager channels and provider-confirmed versions.

## Security TODOs

- [ ] Integrate publisher GPG signature verification for Krita AppImage
- [ ] Handle interrupted download resume and stale `.part` files
- [ ] Add release monitoring / freshness metadata with publisher verification
- [ ] Verify publisher signatures on Windows and notarization on macOS before initiating installation
- [ ] Support more CPU architectures and installer formats after testing

## Activity dashboard (new)

The **Downloads** tab tracks requested file downloads and installer tasks:
active progress, queue position, selected release version, previously
detected installed version, success/error, and the resulting file path where
available. Download requests are queued **one at a time** in the running UI.

The "Different-version tasks" count includes tasks with **known unequal**
installed/selected version strings. This is not an update-availability claim:
the hub does not yet compare package-manager feeds or report all upgrades.

History is stored in localStorage on this machine and can be cleared. A
transfer still active when the app closes is marked interrupted on restart.
True background transfer, cancellation, resume and delta updates are future
features.
