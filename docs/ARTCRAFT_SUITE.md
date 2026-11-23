# ArtCraft Launcher apps — signed catalog

The bundled list now mirrors **19 entries** from the official
ArtCraft Launcher catalog, not only the 17 original Crafting Apps.
The current signed catalog has 17 official apps and 2 community apps.

## Official (17)
PhotoCraft, VectorCraft, FilmCraft, LightCraft, PdfCraft, EffectCraft,
AniCraft, DesignCraft, FigCraft, TextureCraft, MaterialCraft, WordCraft,
SoundCraft, DeckCraft, CADCraft, GridCraft, Craft Anything.

## Community (2)
- **SolidCraft** — Tangency Labs, `tangency-labs/solidcraft`,
  parametric CAD.
- **MailCraft** — UCS Care Group, `UCS-Care-Group/mailcraft`,
  mail/calendar/contacts.

App icons are sourced from the official `storytold/craft-launcher`
repository. The two community icons retain their respective MIT license
notices under `third_party/`; they are not represented as official
ArtCraft products.

## Keeping the list current
The official launcher publishes a signed list:
- `https://getartcraft.com/launcher-catalog.toml`
- `https://getartcraft.com/launcher-catalog.toml.sig`

Creative Hub verifies the signature against the official launcher's
checked-in Ed25519 public key. On success, the UI incorporates metadata
for verified new entries. On failure/offline it keeps its bundled 19 entries.
**A new catalog listing is never itself permission to install software**.
Community apps and future unknown apps open their publisher download
pages until native trust/install adapters are explicitly reviewed.

See [ARTCRAFT_SYNC.md](ARTCRAFT_SYNC.md) for threat model and limitations.

## Creative Hub category

The **ArtCraft Suite** tab under Discover includes all 19 bundled official
and community entries plus newly verified entries from the official
signed ArtCraft Launcher catalog. This category is distinct from the
**Creative Top 50** featured collection and the individual software
discipline filters.

ArtCraft's signed catalog and user-supplied GitHub repository URLs have
separate trust policies. A user-added project is a tracked metadata entry,
not an automatic ArtCraft membership or approved native installer.
