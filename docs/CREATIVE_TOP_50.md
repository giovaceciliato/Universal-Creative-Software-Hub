# Creative Top 50

This selection preserves the 50 free creative software recommendations from the
original curated list, without duplicating Blender and Krita already in Creative Hub.
It is one **collection** alongside the ArtCraft Launcher applications, not an
automatically authorized installation list.

## Illustration, photography and painting (1–10)
1. `krita`
2. `gimp`
3. `darktable`
4. `rawtherapee`
5. `digikam`
6. `mypaint`
7. `pinta`
8. `lazpaint`
9. `photodemon`
10. `drawpile`

## Vector, publishing and interface design (11–18)
11. `inkscape`
12. `scribus`
13. `penpot`
14. `libreoffice-draw`
15. `fontforge`
16. `svg-edit`
17. `graphite`
18. `excalidraw`

## 3D, CAD, materials and interactive worlds (19–30)
19. `blender`
20. `bforartists`
21. `freecad`
22. `openscad`
23. `wings3d`
24. `meshlab`
25. `makehuman`
26. `material-maker`
27. `blockbench`
28. `meshroom`
29. `sweet-home-3d`
30. `godot-engine`

## Animation and motion graphics (31–36)
31. `opentoonz`
32. `tahoma2d`
33. `synfig-studio`
34. `pencil2d`
35. `glaxnimate`
36. `wick-editor`

## Video and compositing (37–43)
37. `kdenlive`
38. `shotcut`
39. `openshot`
40. `olive`
41. `natron`
42. `flowblade`
43. `davinci-resolve-free`

## Audio and music (44–50)
44. `audacity`
45. `lmms`
46. `hydrogen`
47. `musescore-studio`
48. `qtractor`
49. `mixxx`
50. `sonic-pi`

## Platform and license notes

- Penpot, SVG-Edit, Graphite, Excalidraw and Wick Editor are **web-only**
  entries. Blockbench is both desktop and web. These open their official
  web applications rather than running a fictitious local installer.
- PhotoDemon is Windows-only; Flowblade and Qtractor are Linux-only.
- DaVinci Resolve **Free** is freeware, not open source, and does not include
  Studio's paid features. Its Linux release targets Rocky Linux and is not
  a verified native Fedora installer.
- Olive and Graphite are experimental/alpha; Linux distribution support
  for OpenToonz may require community builds.
- Native DNF installation is initially available only for selected, reviewed
  packages in Fedora's repositories. The others link to official publisher
  pages until compatible installer channels have been independently verified.
- No new catalog record can run a shell command or select an untrusted
  installer URL. Native installer IDs are separately allowlisted in Rust.

The canonical membership list is
[`catalog/collections/creative-top-50.json`](../catalog/collections/creative-top-50.json),
validated as part of the catalog CI workflow.
