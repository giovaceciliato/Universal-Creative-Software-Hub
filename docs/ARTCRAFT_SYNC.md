# Read-only ArtCraft catalog synchronization

Upstream source: https://github.com/storytold/craft-launcher

This follows the **ArtCraft Launcher's own signed hosted catalog**, not
GitHub organization searches, speculative app names or unchecked JSON.

## Flow
1. Bundle **19** known entries and icons in the application.
2. On startup and user request, the Rust `refresh_artcraft_catalog`
   command downloads the official TOML and base64 signature over HTTPS,
   without accepting redirects.
3. Verify the signature over the exact TOML bytes using the pinned
   Ed25519 public key copied from
   `storytold/craft-launcher/crates/core/assets/launcher-catalog-public-key.pem`.
4. Enforce 1 MiB catalog / 128 B signature limits and a maximum of 64 entries.
   Reject invalid IDs, publishers and repositories; enforce
   `storytold/<id>` identity for `kind = "official"`.
5. Merge safe signed metadata into the UI. Existing local app identity,
   direct-download allowlists and native install policies remain unchanged.
6. If the remote check fails, retain the bundled list and show a warning.
   Neither scanner nor installation starts during refresh.

## Security/limitations

- The publisher's signed catalog is **authenticated but not freshness
  guaranteed**; upstream public key rotation requires a software update.
- New publisher entries are **discovery listings only**: they do not gain
  download-file privileges or OS installation permissions.
- The catalog comes from the publisher only. A compromised publisher
  signing key is not covered by the signature alone.
- Newly discovered apps may use a generic icon until an independently
  credited local asset is added. Bundled entries use original PNGs.
- Currently this feature does **not** cache signed network responses to
  disk: it uses the bundled catalog when offline. It does not claim
  to reflect upstream changes while offline.
- The native installed-app scanner presently supports the **bundled**
  catalog. Newly discovered apps require detection-adapter review.
