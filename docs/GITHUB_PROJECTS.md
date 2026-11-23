# GitHub project tracking

## User workflow

1. Open **My Library** or **Updates** and select **Add GitHub project**.
2. Paste a public repository URL such as
   `https://github.com/owner/repository` or its `/releases/latest` page.
3. The Tauri/Rust backend queries GitHub's official REST API, reading
   public repository metadata and the **latest non-prerelease stable
   GitHub release** if one exists.
4. The repository is saved locally in the launcher. It remains tracked
   across app restarts, and can be removed by the user.
5. On opening **Updates** for the first time in a session or pressing
   **Check releases**, the native backend checks GitHub's latest release.
6. If the latest release differs from the last package the user downloaded
   or the installed version explicitly entered by the user, the UI shows
   that **release difference**, not an unverified operating-system upgrade.
7. A user may select a particular asset and download it to Downloads.
   This is **not installation**.

A repository with no published stable release can still be tracked.
Private repositories and sign-in are not supported. GitHub API's public
rate limits apply, so the launcher limits tracking to 25 repositories and
does not continuously poll in the background.

## Safety boundary

- GitHub input is parsed into a validated `owner/repository` pair. The
  backend constructs the GitHub REST URL; arbitrary hosts, URL paths,
  ports, and credentials are rejected.
- Only release assets returned by GitHub's official API for the
  **latest release** are eligible for download; the backend re-queries
  that latest release and revalidates the asset ID and tag before
  downloading. If the release has changed, the user must review it again.
- The download origin must be `https://github.com`. Redirects are
  limited to HTTPS GitHub asset-storage endpoints.
- Asset names are restricted to safe ASCII characters and known package
  or archive extensions; individual files are capped at **2 GiB**.
- Files are staged in the platform's Downloads directory; a finished file
  is finalized **without overwriting existing files**.
- A SHA-256 hash is always calculated. Where GitHub provides a
  `sha256:<digest>` asset field, it is verified before finalization.
  Otherwise the UI explicitly states that the publisher's digest was
  not available. This does not establish third-party publisher identity.
- **No shell scripts are run, nothing is extracted, and no GitHub
  release asset is automatically installed.** Native installation remains
  limited to reviewed and hard-coded application/package IDs.
- The watched list and download history are stored in localStorage on
  this device only. The launcher contacts GitHub for metadata when
  explicitly checking releases or adding a project.

## What's not included yet

- Automatic upgrade of arbitrary installed software from GitHub.
- Reliable detection of installation versions for user-supplied
  repositories across Windows/macOS/Fedora.
- GitHub account integration, private repositories, release channels
  other than the latest stable release, and automatic background polling.
- Resumable downloads or cancel-in-progress controls.

See `src-tauri/src/github_projects.rs` for URL validation, release
metadata and hardened file download implementation.
