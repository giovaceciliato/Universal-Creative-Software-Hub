# Native installation (alpha)

Click **Install app**, review the install plan, then choose **Confirm & install**.
No system changes occur during preview. The OS remains responsible for
authorization.

| OS | Blender and Krita | ArtCraft suite |
| --- | --- | --- |
| Fedora | DNF using curated package IDs via PolicyKit (`pkexec`) | Download release RPM from `storytold`, check SHA-256, then DNF through PolicyKit |
| Windows | WinGet with exact curated IDs | Check GitHub release MSI checksum, run Windows Installer; UAC can prompt |
| macOS | Homebrew cask if installed | Check universal DMG, open it in Finder. **User finishes the copy to Applications.** |

## Safety
- Hardcoded backend allowlist (Blender, Krita and 17 ArtCraft repository IDs).
- The backend independently selects the matching OS/architecture release.
- ArtCraft downloads are restricted to the publisher's GitHub release URLs
  and verified against `SHA256SUMS.txt` from that release.
- Checksums confirm **publisher release integrity**, not independent
  protection if the publisher's GitHub account itself is compromised.
  Pinned signing-key verification is a planned security enhancement.
- No shell expansion or arbitrary catalog commands. No silent installations.
- Installations are serialized and performed only after explicit user approval.
- The scanner remains read-only and does not start installations.
- No universal update manager exists yet.

Fedora desktop installations require DNF, polkit / `pkexec`, and an active
system authentication agent. For macOS ArtCraft DMGs, the user must complete
the final installation in Finder; that is intentionally labeled as manual.

The launcher uses the official ArtCraft stable GitHub Releases endpoint, so
an application with no compatible RPM, MSI or universal DMG will not claim
to support direct installation.

References:
- https://getartcraft.com/apps
- https://github.com/storytold/craft-launcher

## Downloads activity

Installer jobs now appear in **Downloads** with expected package version,
previously scanned installed version (if available), file-transfer progress
for ArtCraft releases, and the result of the native installer command.

The downloaded package reaching 100% is **not** an installation success.
Fedora may still request your password; Windows may still require an UAC
or MSI interaction; macOS DMG installation finishes manually in Finder.
Only the installer command result is marked completed.

Official ArtCraft Launcher **community apps** SolidCraft and MailCraft
are available for discovery and through publisher download pages, but
are **not** added to the native installation allowlist by the signed
catalog. Additional installer support requires review.

## Creative Top 50: Fedora package installs

A subset of **23** new catalog entries has a reviewed Fedora repository
package, installed using the existing system-authorized DNF/PolicyKit flow:
GIMP, darktable, RawTherapee, digiKam, MyPaint, Pinta, Inkscape, Scribus,
LibreOffice Draw, FontForge, FreeCAD, OpenSCAD, MeshLab, Godot Engine,
Kdenlive, Shotcut, OpenShot, Flowblade, Audacity, LMMS, Hydrogen, Qtractor,
and Mixxx.

These exact package IDs are maintained in `FEDORA_PACKAGES` inside
`src-tauri/src/installations.rs`, separately from the JSON manifests.
An `installable_app_ids` native command reports current OS capabilities
to the UI, so unsupported systems are not offered Fedora DNF actions.

This phase does not add unchecked Windows installers or Homebrew commands;
for nonconfigured apps the hub links to their official publishers instead.
A successful OS package command should still be followed by **Scan computer**
to verify actual installation. Third-party update checks remain unimplemented.

Fedora reference: https://packages.fedoraproject.org/

## Explicit post-download choice

Completed native downloads now show a confirmation dialog. Reviewed
apps offer an installation via the official OS package manager after
the user explicitly confirms the plan. The OS authentication agent can
request a password or show UAC.

Downloaded packages from arbitrary user-supplied GitHub URLs are never
installed or executed by the launcher. Users can open the Downloads
folder and continue manually. This prevents a GitHub repository's
release metadata from becoming an executable-command allowlist.
