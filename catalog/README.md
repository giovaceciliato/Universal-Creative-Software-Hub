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

Optional `icon` records contain a **local**, checked-in SVG path plus source and license information. The UI uses a neutral fallback if the file is absent or cannot be displayed.

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
