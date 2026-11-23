# Application icon assets

Blender and Krita monochrome SVG marks are included in `public/icons/`.

- Source: [Simple Icons](https://github.com/simple-icons/simple-icons), accessed from the upstream `develop` branch.
- Simple Icons icon source repository: CC0 1.0 Universal.
- Blender and Krita names and brand marks remain subject to any applicable trademark policies of their respective owners.
- These are third-party marks and do not indicate affiliation or endorsement.

The app never loads third-party icons from an untrusted runtime URL. App manifest icon paths must point to a checked-in `/icons/<slug>.svg` file. If the asset fails to load, the UI shows a neutral fallback icon. Contributors should verify provenance and permissions for each newly proposed mark.


ArtCraft app image credits: see [ArtCraft icon notice](../third_party/ARTCRAFT-ICONS.md).

SolidCraft and MailCraft icons are also copied unmodified from the
ArtCraft Launcher's official icon directory. They retain their distinct
upstream MIT licenses in `third_party/LICENSE-MIT-SolidCraft.txt`
and `third_party/LICENSE-MIT-MailCraft.txt`.

## Creative Top 50 icon sources

Checked-in monochrome SVGs are included for a subset of the new entries
(GIMP, Inkscape, LibreOffice, FontForge, Penpot, Excalidraw, FreeCAD,
OpenSCAD, Blockbench, Godot Engine, DaVinci Resolve, Audacity, LMMS
and Kdenlive). They are imported from
[Simple Icons](https://github.com/simple-icons/simple-icons) (CC0-1.0).
They remain third-party project marks; Creative Hub does not claim
affiliation or endorsement.

Apps without a vetted, locally licensed brand mark use the existing
neutral fallback symbol. Do not scrape arbitrary favicons or hotlink icons
in the runtime catalog.
