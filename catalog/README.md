# Curated application catalog

The catalog consists of one JSON file per app in `catalog/apps/`. Entries are **metadata only**.

## Fields

| Key | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | Stable lowercase slug |
| `name` | Yes | Display name |
| `publisher` | Yes | Original project or publisher |
| `description` | Yes | Short factual description |
| `categories` | Yes | Category slugs |
| `platforms` | Yes | `windows`, `linux`, `macos` |
| `pricingModel` | Yes | `free-open-source` or `freeware` |
| `links.website` | Yes | Official product site |
| `links.download` | Yes | Official download page |
| `links.sourceCode` | No | Source repository, when available |

Each file should conform to [`schema/app.schema.json`](schema/app.schema.json).

## Important

- A link is **not** an installation instruction.
- Do not add arbitrary shell commands, executable URLs from untrusted mirrors, or hidden post-install scripts.
- The schema is intentionally minimal. OS-specific package identifiers and signed update sources will require a separately reviewed design.
- A listing does not imply an endorsement, partnership, or affiliation with the listed publisher.

## Icons and native integration hints

Optional `icon` records contain a **local**, checked-in SVG or PNG path plus source and license information. The UI uses a neutral fallback if the file is absent or cannot be displayed.

The optional `integrations` object holds platform-scoped **read-only identifiers** for matching a potential local installation:

```json
{
  "integrations": {
    "windows": { "executableNames": ["example.exe"], "wingetIds": ["Publisher.Example"] },
    "macos": { "bundleNames": ["Example.app"], "homebrewCasks": ["example"] },
    "linux": { "flatpakIds": ["org.example.Example"], "rpmNames": ["example"] }
  }
}
```

These identifiers are **not installation commands**. They require validation against an actual package manager or OS inventory before any installed or update status is shown. Review package IDs before submitting them; do not guess.

See [detection and update design](../docs/DETECTION_AND_UPDATES.md).

## Native installation

Manifests remain metadata only. Native installation plans and commands are
defined in a separate allowlisted Rust module, independent of catalog JSON
fields. The ArtCraft packages are resolved only from the publisher's curated
GitHub repositories. See [INSTALLATION.md](../docs/INSTALLATION.md).

## Curated collection and web-app entries

`catalog/collections/creative-top-50.json` stores the canonical **50**
recommended applications in ranked order. Blender and Krita are reused
from their original manifests, not duplicated.

The platform list now accepts `web` in addition to `windows`, `macos`
and `linux`. A web-only entry has no pretend native installation
package. Browser support on a multiplatform app such as Blockbench is
represented alongside its actual desktop platforms.

Detection hints remain untrusted, read-only *candidate identifiers*.
Installation package names for verified Fedora applications live
**separately** in the backend allowlist; catalog editors cannot add
arbitrary OS commands or gain executable install permissions.

## Community-approved applications

`catalog/approved-community.json` is a separate, maintainer-reviewed
metadata-only feed. User-proposed apps enter this file through a review
PR, **not** through arbitrary GitHub issue content.

The desktop app reads the version from the trusted default branch
`main`, after verifying each entry's fields. The initial file is empty.
Community apps appear in Discover only after PR merge and refresh.
No `integrations`, executable paths or installation commands are allowed
in the feed, and entry publication does not modify Rust's installation
allowlist. See [APP_REQUESTS.md](../docs/APP_REQUESTS.md).
