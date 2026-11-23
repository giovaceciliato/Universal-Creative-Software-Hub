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
