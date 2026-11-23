# UI direction — monochrome revision

The design is intentionally minimal. One palette: black, white and neutral grayscale.

- No gradients, accent colors, hero illustrations, decorative badges, shadows, or remotely loaded fonts.
- Navigation: **Discover**, **My Library**, **Installed**, **Updates**.
- Discover: simple search, system selector, category filters, compact horizontal listings with actual recognizable app marks.
- My Library: user favorites and manually added shortcuts. These are separate from verified native installations.
- Installed and Updates: honest placeholders until the native scanner and updater integrations are completed.
- Layout: clean sans-serif system font, clear focus indicators, visible separators, keyboard-accessible controls.
- Icons: checked-in monochrome SVGs from Simple Icons when available, generic package fallback otherwise.

Icon source and trademark notes: [ICONS.md](ICONS.md).

Design changes should preserve existing localStorage keys `ucsh:favorites:v1` and `ucsh:shortcuts:v1` to avoid losing existing user favorites and shortcuts. The desktop palette stays monochrome; third-party marks may be displayed in grayscale.
