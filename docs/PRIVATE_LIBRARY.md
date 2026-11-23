# Libreria privata and post-download install prompt

## Personal shortcuts

- An independent **Libreria privata** navigation area contains URL and
  local-path shortcuts. The main **My Library** retains favorites and
  GitHub projects without duplicating personal shortcuts.
- The **existing localStorage key** `ucsh:shortcuts:v1` is retained
  exactly, so shortcuts created before the update remain intact.
- The new-addition limit is **100 shortcuts per device profile**.
  The form and sidebar button are disabled at capacity; validation on
  submit enforces the limit. Existing collections above 100 entries are
  preserved rather than silently truncated or deleted.
- Entries never leave the device as part of private-library management.
  This is **not encrypted storage** and is not secured with an
  application password. For true secret material, use a supported
  password manager instead.

## After-download decision

- A user-requested native download completes with its original file
  remaining in the operating system's Downloads directory.
- The app displays a post-download dialog with name, version, and
  whether the publisher's SHA-256 checksum was verified.
- **Supported reviewed apps:** choose OS installation. The native
  installation preview remains a separate confirmation step; the
  package manager and PolicyKit/UAC prompts are never bypassed. The
  package-manager installation may download a new package rather
  than use the existing file.
- **GitHub projects / unsupported packages:** the launcher only
  opens Downloads for manual examination and installation. No arbitrary
  executables are launched from untrusted GitHub repositories.
- Users may dismiss the prompt or reopen it from the completed task
  in the Downloads section. Post-download prompts are held for the
  active session and are not re-shown automatically after restart.
- File downloads and OS installations remain distinct statuses. A
  completed download is **not** proof of installation.

## Implementation boundaries

The native `get_downloads_directory` command exposes only the
operating system's Downloads folder (not an arbitrary execution path).
Opening that folder uses the existing Tauri opener plugin.

No automatic scanning, updating or installing is triggered by private
library entries. General-purpose GitHub installer execution is
deliberately excluded from the native authorization allowlist.
