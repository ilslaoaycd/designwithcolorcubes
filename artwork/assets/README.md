# Color Cubes image and model assets

Extra assets for the Design with Color Cubes site (see `HANDOFF.md` in the main repo zip). There are three finishes:

- **Original:** scans of an original Embossing Company set (`faces/`, `2d-scan/`, `3d-scan/`)
- **3D printed:** generated from the sliced cube (0.2 mm layer lines, 0.45 mm skin lines, walls and the 1 mm recess), using only fine surface grain from the scans of Isaac's printed cubes (`faces-printed/`, `2d-printed/`, `3d-printed/`)
- **Vector / flat:** the reference colors (`faces/vector/`, `2d-vector/`, `3d-flat/`)

All three use the same scene layouts, so every scene exists in every finish with identical cube placements.

## What's here

| Folder | Contents |
|---|---|
| `faces/all/` | 80 individual faces cut from the scans, straightened, transparent PNG (240 px). Named `solid-red-01.png`, `diag-red-white-07.png`, … Diagonal faces are all turned so the dark triangle is **top-left**. |
| `faces/scan-by-code/` | One scanned face per tray code: `w r y b 1–8` (see "Tray codes"). |
| `faces/vector/` | The same 12 faces as SVG and PNG, flat colors, with the 1.7 mm rim around the light triangle. |
| `faces/manifest.json` | For every cut face: its kind, the source scan, and the crop corners in scan pixels. |
| `faces/contact-sheet.jpg` | All 80 cuts on one sheet. |
| `faces-printed/` | `by-code/`: the 12 looks, generated and lit from the top left. `generated/`: every look in all four turns, 4 variants each (96 files). `scan-cuts/` and `scan-cuts-by-code/`: the raw cuts from the printed-cube scans, kept for reference. |
| `2d-printed/` | Every 2D scene built from the generated printed faces, lit from a fixed direction, on transparent and on the printed scans' black backdrop. |
| `3d-printed/` | The nine 3D renders with generated printed cubes (layer lines in the texture and a normal map). |
| `2d-scan/` | Every scene built from the real scanned faces. |
| `2d-vector/` | The **same scenes with identical placements** in flat vector cubes: `.svg` plus `.png`. |
| `3d-scan/`, `3d-flat/` | 3D renders with scanned and flat-color cubes (transparent PNG with soft shadows). |
| `model/` | The 3D cube as GLB and OBJ in three finishes (original scan, 3D printed, flat), plus textures and a three.js `viewer.html`. |
| `print-preview/` | A self-contained slicer-style page (`index.html`, three.js from a CDN): one cube sliced into 0.2 mm layers with every bead colored by its filament, a layer slider and a moves slider, Play, a plate of 4, and filament use per cube. Drop it into the site's print section. |
| `print-player/` | Lightweight print animation for the site, no three.js: `color-cube-print.js` (3.7 KB minified) + `color-cube-print-sprite.webp` (518 KB, 69 frames) for a scrubbable player; `color-cube-print.mp4` (83 KB) and `color-cube-print.webp` (536 KB, transparent) as plain loops. `index.html` shows all three with copy-paste snippets. |
| `source-scans/` | The five scans of the original set and the three scans of the printed set (`*-printed.jpg`). |
| `patterns.json` | Tray codes for every pattern. |
| `tools/` | The Python and three.js scripts that made all of this. Paths are hard-coded to the original working folders, so edit them before rerunning. |

## Scenes (2D, in both `2d-scan` and `2d-vector`)

- **`patterns/`**: 12 tray designs. Quadrants 7×7 (from a photo of a printed set), checkerboard, red/white stripes, blue/yellow zigzag, white and blue diamonds 4×4, pinwheels 6×6 (two colorways), concentric diamonds 7×7 and 9×9, sawtooth border 9×9, star 6×6. Each comes in three versions:
  - `name.png`: hand-placed look (slight jitter), transparent background with shadows
  - `name-on-black.jpg/png`: the same on black (real scan paper for the scanned set)
  - `name-clean.png`: perfectly aligned, no shadow
- **`scatters/`**:
  - `dump-16/36/49/81-cubes`: cubes dumped on the floor, with clumps of touching cubes and a few strays
  - `loose-30-cubes`, `loose-wide-24-cubes`: spread out like a scan
  - `half-built-quadrants-7x7`, `half-built-concentric-9x9`: a tray partly laid out with the rest dumped beside it
  - `assembled-blocks-and-loose-cubes`: small 2×2 and 3×3 blocks among loose cubes
- **`spills-horizontal/`**: banner strips (2400×320, 3000×400, 1600×260) with mixed cube sizes for depth. Transparent, plus on-black versions.

Dumps and spills show a random face on each cube, chosen evenly from the six faces, just as a real dump would.

## 3D renders (`3d-scan/`, `3d-printed/` and `3d-flat/`)

`spill-horizontal-3d` (low angle banner), `spill-horizontal-3d-high`, `dump-49-cubes-3d` (some cubes resting on others), `tray-quadrants-7x7-3d`, `tray-concentric-diamond-9x9-3d`, `tray-pinwheels-6x6-3d`, `pyramid-stack-3d`, `twelve-looks-row-3d` (all 12 looks on top: w r y b 1–8), `diamond-blocks-3d`.

The scanned and printed renders each use 10 cube variants with different scan samples, so neighboring cubes don't look identical.

## The cube (from an original)

- 27.5 mm cube. Sides, red facing north: **N red, E yellow, S white (cream), W blue.**
- Top: red/white. The red triangle is NW, and the white triangle is SE.
- Bottom: blue/yellow. The blue triangle is NW, and the yellow triangle is SE.
- The light triangles (white and yellow) are **recessed 1 mm**, inside a **1.7 mm** rim of the dark color along the two outer edges. The recess walls are the light color.
- Each raised dark triangle borders the red and blue sides.

## Tray codes

`w r y b` are solid faces. `1–4` are the blue/yellow face and `5–8` the red/white face, numbered by where the dark triangle's square corner sits, clockwise from top-left (1/5 TL, 2/6 TR, 3/7 BR, 4/8 BL). This matches the designer and `site/js/cubecode.js` in the main repo.

## Colors

| | Hex |
|---|---|
| Red | `#C0272D` |
| White (cream) | `#F4ECD8` |
| Blue (navy) | `#1E2A5A` |
| Yellow | `#E3B23C` |
