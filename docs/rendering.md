<!-- Isaac's notes on how the image pack (the page pictures, faces, 3D cube models and print animation) was made. Written in an earlier working session: the scripts it names live in the image-pack tooling on Isaac's machine, not in this repository, and their absolute paths (section 2) need mapping before anything is rerun. The page renders (hero, trays, spill) come from tools/render_scenes.py instead (see README). -->

# How the Color Cubes assets were rendered

How every image, model and animation in `color-cubes-assets/` was made, so another agent can rebuild them from new scans. It covers the order of the stages, the algorithms and numbers that matter, the conventions everything depends on, and the bugs already hit.

All scripts are in `tools/`. They were written in one working session and **still contain absolute paths from that session** (section 2). Before running anything, map those paths, or better, replace them with a single `config.py`.

---

## 1. Pipeline at a glance

```
scans (JPG)
  │  extract*.py  →  straightened square tiles (work/raw/*.png)
  │  classify*.py →  which look each tile is (solid colour / diagonal + corner)
  │  normalize*.py → canonical orientation + alpha cutout (work/norm/*.png, work/meta.json)
  │  desliver.py  →  (printed scans only) trims neighbour slivers
  ▼
face pools ──────────────┬──────────────────────────────┬─────────────────────────────┐
                         │                              │                             │
 scenes.py → work/scenes.json (layouts: digit, x, y, angle, size per cube)            │
   │                     │                              │                             │
   ├─ render2d.py scan   ├─ render2d.py vector          ├─ render_synth2d.py          │
   │  2d-scan/           │  2d-vector/ (SVG + PNG)      │  2d-printed/ (generated)    │
   │                                                                                  │
 cube3d.py ─ geometry (27.5 mm, recessed triangles) + texture atlases → GLB / OBJ     │
 printed_synth.py + make_models.py → generated printed textures + normal map → GLB    │
   │                                                                                  │
 scenes3d.py → scenes3d.json ─ run.py + harness.html (headless three.js) → 3d-*/      │
                                                                                      │
 print-preview/index.html (three.js slicer view) ─ capture.html + grab.py → frames ───┘
   → sprite sheet / animated WebP / MP4 → print-player/
```

## 2. Environment and working folders

**Tools:** Python 3 with `opencv-python`, `numpy`, `Pillow` and `playwright`, plus Google Chrome for headless rendering. Also `rsvg-convert` (librsvg) for SVG to PNG, `ffmpeg` for the MP4, and Node with `gltf-validator` (npm) to check GLBs. three.js is loaded from `cdn.jsdelivr.net/npm/three@0.160.0`. When rendering offline, `run.py` and `grab.py` route those URLs to a local `npm i three@0.160.0` copy.

**Session folders (absolute paths in the scripts):**

| Path in scripts | What it was | Used by |
|---|---|---|
| `/mnt/user-data/uploads/<id>-image.jpg` | The input scans | extract*, lib (`CC_BG`) |
| `/home/claude/faces/` + `faces/work/` | Original-set scripts, tiles, `meta.json`, `norm/`, `scenes.json`, scan GLB variants | most scripts |
| `/home/claude/printed/work/` | Printed-set tiles, `meta.json`, `norm/` | extract_p, classify_p, normalize_p, desliver, printed_synth |
| `/home/claude/synth/` | Generated-printed scripts, `lit_faces.pkl` | printed_synth, make_faces, make_models, render_synth2d |
| `/home/claude/r3d/` | `harness.html`, `run.py`, `scenes3d.json`, GLB variants (`scan-*`, `printed-*`, `flat.glb`) | 3D renders |
| `/home/claude/lite/` | `capture.html`, `grab.py`, frames | print player |
| `/home/claude/assets/color-cubes-assets/` | Final outputs | everything writes here |

**Environment switches** (read by `lib.py`, `cube3d.py` and `render2d.py`):
- `CC_WORK`: which face pool (`…/faces/work` for the original set, `…/printed/work` for the printed set)
- `CC_BG`: `"<scan path>|x0,y0,x1,y1"`, an empty black region of a scan used as backdrop grain
- `CC_2D`: output folder name for raster scenes (`2d-scan`, `2d-printed`)
- `CC_PRINTED=1`: makes `cube3d.py` build the printed model instead of the original one

## 3. Conventions everything depends on

- **Tray digits and codes:** `0 w, 1 r, 2 y, 3 b` are solid faces. `4–7` (codes `1–4`) are the blue/yellow face and `8–11` (codes `5–8`) the red/white face, with the dark triangle's square corner at `k = (d−4) % 4`: 0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left, going clockwise. This matches `site/js/cubecode.js`.
- **Canonical tile orientation:** every diagonal tile in a pool is stored with its **dark triangle top-left**. To show corner `k`, turn it clockwise k quarter-turns. In PIL that's `im.rotate(-90*k)`, since PIL's positive angle is counter-clockwise. In numpy it's `np.rot90(im, -k)`.
- **Scene angles:** `a` is degrees **clockwise in image coordinates**. SVG `rotate(a)` uses the same sense, and PIL needs `rotate(-a)`.
- **The cube:** 27.5 mm. Sides with red facing north: **N red, E yellow, S white, W blue.** The top is red/white with red NW. The bottom is blue/yellow with blue NW. The light triangle (white or yellow) is **recessed 1 mm**, inset **1.7 mm** from the two outer edges, and its walls are the light colour. In plan view (x east, y north, `h = S/2`) the recess is `x ≤ h−1.7 ∧ y ≥ −h+1.7 ∧ x ≥ y`, the SE half, for **both** top and bottom.
- **3D axes:** glTF, +Y up, **−Z north**, +X east, metres (0.0275).
- **Reference colours (flat/vector):** red `#C0272D`, cream `#F4ECD8`, navy `#1E2A5A`, gold `#E3B23C`.
- **Printed filament colours** (measured from the printed scans, BGR in code): red (59,48,235), yellow (101,198,228), white (244,246,244), blue (170,94,30).

## 4. Stage 1: cutting faces out of scans

### Original set (`extract.py`, `extract2.py`, `classify.py`, `normalize.py`)
1. **Crop** each scan to `[:2150]` rows to drop the white scanner strip at the bottom.
2. **Mask.** The background is black paper (~37 grey), and navy paint is almost as dark, so brightness alone fails. Use
   `mask = (max_channel > 70) | ((B − R > 14) & (B > 45))`, then open 5×5, close 7×7, and **fill contours** (holes).
3. **Single tiles and grids:** for each contour (area > 20 000 px, not touching the image edge), take `minAreaRect`. If both sides are ≈ n × S (S ≈ 197 px for a 27.5 mm cube at this scan DPI) with fill > 0.9, subdivide the rect into n × m cells by bilinear interpolation of its corners.
4. **Touching heaps** (`extract2.py`): seeds = `((max>110)|(B−R>40))` eroded 6×; then run **watershed on the distance transform** of the filled mask. Don't run it on the image gradient: dark navy halves flood into the background marker and get cut off. Keep regions with both sides 184–212 px and fill > 0.93, skipping centres within 120 px of tiles already taken.
5. **Warp** each quad to 240×240 (`getPerspectiveTransform`, `INTER_CUBIC`, `BORDER_REPLICATE`). Order corners TL,TR,BR,BL by angle around the centre, starting at the minimum of x+y.
6. **Classify** (`classify.py`): average Lab colour in the four edge triangles N/E/S/W. Use a 16 % border inset and stay 0.08 away from both diagonals. Snap each to the nearest reference colour. All four the same means solid. Otherwise the two triangles of the dark colour (red or blue) give the corner: N+W → 0, N+E → 1, E+S → 2, S+W → 3.
7. **Normalize** (`normalize.py`): `np.rot90(im, k=corner)` (counter-clockwise) so the dark corner ends up top-left. Alpha = the same colour mask, closed, largest component filled, blurred 3×3. Write `work/norm/<name>.png` and `meta.json` with kind, group (single/grid/heap), quad and alpha coverage.
8. **Contact sheet:** check it by eye. Two cream tiles were misread as yellow and two had neighbour slivers; fix those by hand in `meta.json`.

### Printed set (`extract_p.py`, `classify_p.py`, `normalize_p.py`, `desliver.py`)
Same flow, with these differences:
- **Mask:** `((max−min) > 45) | (min > 195)`, saturated or very white. This drops the grey scanner shadow band.
- **Touching tiles:** each tile's core (distance transform > 0.30 S) keeps the tile's orientation. Take `minAreaRect` of the core, check it is square with side ≈ S − 2·0.30 S, then grow it back to S×S. Accept it if ≥ 96 % of the square is covered by the mask. This beats watershed for printed cubes, which touch along whole edges.
- **Grid cells** are shrunk to 96.5 % about their centre, then given another uniform 2.2 % inset after normalising.
- **`desliver.py`:** for each side, compare the median Lab of the outer 2.5 % strip with the band 2.5–9 % in. If they differ by more than 38, crop 3.5 % off that side and resize back, up to three passes.
- **Classification references (BGR):** w (248,252,252), r (57,44,228), y (101,196,235), b (169,93,27).

**Verdict:** the printed-scan crops still looked rough (neighbour edges, double rims). The final printed look is therefore **generated** (section 7), and the scans only supply fine surface grain.

## 5. Stage 2: scene layouts (`patterns.py`, `scenes.py`)

Every 2D scene is a list of cubes `{d, x, y, a, s}` in `work/scenes.json`. Raster-scan, printed and vector renders all read **the same list**, so placements match across finishes.

- **Patterns:** tray codes in `patterns.py` (`P` dict, readable codes). `grid_items()` places cells at a pitch of `T + gap` (T = 150 px, gap = 5). The hand-placed look adds ±1.6° and ±4 px jitter. The `-clean` versions have no jitter, gap 4 and no shadow. `concentric()` builds diamond rings: a cell's diagonal faces the centre, colour pair alternates by ring, and axis cells are solid.
- **Floor dumps (`place()`):** keep sampling until n cubes are placed. With probability `p_contact` = 0.58, put the cube against a random existing cube: pick a side of that cube, step 1.015–1.12 × T outward, slide sideways ±0.35 T, and copy its angle ± a Gaussian 7°. Otherwise sample from a 2D Gaussian (σx = 1.25 σ, σy = 0.9 σ, σ ≈ 2.2–3 T), with a 12 % chance of a 2.3 × wider tail. Reject any overlap with an **oriented-square SAT test** (`corners()` + `overlap()` in `lib.py`, 1.5 px margin). Faces are chosen evenly from the six faces; diagonal faces get a random corner.
- **Loose scatters:** uniform positions with a large SAT margin (0.25 T).
- **Half-built trays:** the first n cells of a pattern laid with jitter, the rest dumped beside them with `place()`.
- **Assembled blocks:** small sub-grids (`56-87`, `34-21`, `555-555-555`, `414-141-414`) rotated as rigid groups, plus 16 loose cubes.
- **Horizontal spills:** per-cube size × U(0.72, 1.18) for depth. x is uniform, y = centre + N(0, 0.16 H), with an SAT margin of 0.12 × base size.

## 6. Stage 3: 2D rendering (`lib.py`, `render2d.py`)

**Raster (scan or printed)**
- `face_for_digit(d, rng)` picks a random tile of the right kind and turns it to corner `k` (solids get a random quarter-turn for variety). Then `rot_face(im, −a, size)` resizes with Lanczos and rotates with bicubic and `expand=True`.
- `compose()`: two drop-shadow passes from the alpha (blur 10 s with offset (6 s, 9 s) at 55 %, then blur 3 s with offset (2 s, 3 s) at 50 %, where s = tile/200), then alpha-composite every cube.
- **Black backdrop** (`black_paper`): crop an empty black strip from a scan, subtract its Gaussian blur (σ 25) to remove scanner falloff, add the median colour back, tile it with mirroring, and add a soft vignette.
- **Outputs per scene:** transparent PNG plus `-on-black.jpg` (q88). Clean patterns are a transparent PNG only.

**Vector (`render_vector` in `render2d.py`)**
- One SVG per scene. `<defs>` holds the 12 faces as `<g id="f0">…<g id="f11">` in a 100-unit box centred at 0, with a 5-unit corner radius. Each diagonal face is a dark rounded square plus the **recessed light triangle inset by RIM = 1.7/27.5 × 100**. A thin darker stroke (55 % opacity) defines the edge.
- Each cube is a `<use href="#fN" transform="translate(x y) rotate(a) scale(s/100)">`.
- Shadow filter: `feGaussianBlur(SourceAlpha) → feOffset → feComponentTransfer slope 0.38 → feMerge`, written longhand because librsvg's `feDropShadow` support is inconsistent.
- `rsvg-convert` makes the PNGs, and a temporary on-black SVG makes the `-on-black.png`.

## 7. Generated printed faces (`printed_synth.py`, `make_faces.py`, `render_synth2d.py`)

The faces are built from the slicer geometry rather than cut from photos.

- **Height maps** (one face = N px across 27.5 mm). Bead profile is `sqrt(sin(π·f))` across each bead.
  - *Sides:* horizontal layer lines. The first layer is 0.3 mm, then 0.2 mm. Each layer gets a random ±5 % height wobble, plus a faint low-frequency sinusoid.
  - *Top (red/white):* skin lines 0.45 mm apart at +45° on the raised part and −45° on the recess floor, each with a random phase. Two wall beads run parallel to the outer edges (distance to edge < 2 W), and two wall beads around the recess (distance to triangle < 2 W). The recess is lowered (−1.6 in height units) so normals show its edge.
  - *Bottom (blue/yellow):* the first layer squashed on the bed (0.55 + 0.45 × lines) and a bridged recess floor.
- **Albedo:** filament colour × (0.88 + 0.16 × height), plus **luminance-only high-pass grain** from a clean 96×96 centre patch of a printed scan tile. That's `patch − GaussianBlur(σ2)`, clipped to ±7, mirror-tiled and randomly shifted, with amplitude 0.9 for white and 0.55 for others. The recess floor gets ambient occlusion `1 − 0.30·exp(−d/0.5 mm)` near its walls, and the outer edges darken `1 − 0.18·exp(−d/0.25 mm)`.
- **Normals:** Sobel of the slightly blurred height. The vector is `(−dH/du·k, +dH/dv·k, 1)` normalised (glTF/OpenGL convention, +Y = image up), with k = 2.4 for sides and 2.0 for caps.
- **2D lighting (`lit_rotated`):** turn the albedo and height **first**, then light them, so every cube in a scene shares one light direction, L = (−0.45, 0.55, 0.70), from the top left. The result is albedo × (0.58 + 0.48·max(0, n·L)) + 0.10·255·spec^40. The recess shadow is `inside ∧ ¬(inside shifted 1 mm toward the light)`, blurred and darkened 35 %.
- `make_faces.py` writes 6 looks × 4 turns × 4 variants = 96 lit RGBA faces at 300 px (rounded alpha, r = 0.7 mm) to `lit_faces.pkl`. `render_synth2d.py` swaps `render2d.face_for_digit` for a lookup into that table and re-renders all scenes to `2d-printed/`.

## 8. The 3D model (`cube3d.py`, `make_models.py`)

- **Geometry (`build_mesh`)** uses one frame per face: normal n, origin o, axes U (s) and V (t), with `point(s,t,depth) = o + U·s·S + V·t·S − n·depth`. Sides are plain quads. Each cap has:
  - three raised polygons: the NW triangle `(0,0)(1,0)(0,1)`, an east rim quad and a south rim quad (b = 1.7/27.5)
  - the recess floor triangle `(1−b,b)(1−b,1−b)(b,1−b)` at depth 1 mm
  - three wall quads, with normals pointing into the recess. Their UVs sample the floor texture 3–6 % inside each edge, so the walls come out the light colour.
  - triangle winding flipped wherever `cross(p1−p0, p2−p0)·n < 0`.
- **Atlas:** 3 × 2 cells (`top, bottom, north / east, south, west`), with UVs inset 1.5 texels against bleeding. Cap textures use the same plan mapping as the geometry (s = east, t = south).
- **Diagonal textures (`fix_diag`):** never use a raw scan of a diagonal face. Build it from two **mirror-tiled clean patches**: dark from 6–42 % of the face, light from 56–90 %. Composite them through an antialiased mask of the exact recess triangle (drawn at 4× and downsampled), so the colours line up with the geometry.
- **GLB writer:** hand-packed glTF 2.0 with POSITION/NORMAL/TEXCOORD_0/indices plus JPEG textures. `blend_glb.write_glb_n` adds a second image as `normalTexture`. Check with `gltf-validator` (0 errors expected; the only note is about generated tangents). OBJ/MTL are written alongside, with `norm`/`map_Bump` for the normal map.
- **Finishes:** original scan (`color-cube.glb`), generated printed with normal map (`color-cube-printed.glb`, 1024 px faces), and flat (`color-cube-flat.glb`, `flat_faces()`). Ten variants of each scanned or printed finish (different samples and seeds) go to `r3d/` for renders.

## 9. 3D renders (`scenes3d.py`, `harness.html`, `run.py`)

- **Layouts** (metres): cubes `{d, x, z, yaw, v (variant), spin, y?}`. Spills use x-ranges of ±0.3 m and SAT checks in the XZ plane. Dumps reuse the contact-chain logic, and stacked cubes sit at `y = 1.5·S`. Trays put pattern cells at pitch S + 0.6 mm. The pyramid is 4×4 / 3×3 / 2×2 / 1 at `y = S/2 + level·S`. `VIEW` gives each scene an azimuth, elevation, distance and FOV, aimed at the cubes' bounding-box centre.
- **Showing face digit d on top** (`faceQuat`, applied before yaw, `q = yaw(−a) · faceQuat`):
  - `0` white: rotX(−90°) · rotZ(90°·spin)
  - `1` red: rotX(+90°) · rotZ(spin)
  - `2` yellow: rotZ(+90°) · rotX(spin)
  - `3` blue: rotZ(−90°) · rotX(spin)
  - `8+k` red/white: rotY(−90°·k)
  - `4+k` blue/yellow: rotY(−90°·((k−3) mod 4)) · rotX(180°). Flipping puts blue at the SW corner, then step clockwise.
- **Harness:** a WebGL renderer with `alpha` and `preserveDrawingBuffer`, RoomEnvironment PMREM (0.45, or 0.32 for flat/printed), a key light with a 4096 PCF soft shadow sized to the scene, plus fill and hemisphere lights. A `ShadowMaterial` ground (opacity 0.3) gives a transparent PNG with real shadows. `renderScene(spec)` returns a data URL.
- **Driver:** `run.py "<names>" <styles>` launches Chrome with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`, routes the three.js CDN to the local copy, and writes `3d-<style>/<name>.png`.
- **Check orientation** by rendering a tray straight down with yaw 0 and comparing it to the 2D clean pattern. That is how the bug in section 12 was found.

## 10. Print preview (`print-preview/index.html`)

Plain three.js, all slicing in JavaScript in the browser:
- **Layers:** first layer 0.3 mm, then 0.2 mm, so 137 layers come to exactly 27.5 mm. Bead width W = 0.45 mm, 2 walls, 1.2 mm shell, 15 % grid infill.
- **`at(x,y,z)`:** returns empty inside the 1 mm pockets. Otherwise the colour comes from the **nearest surface**: the four sides, the top (red, or white over the recess), the bottom (blue, or yellow over the recess), and the pocket walls (light colour). Within 1.2 mm it's solid skin; beyond that it's the white sparse core.
- **Per layer:**
  - two square wall loops, plus two loops around the recess triangle in pocket layers (a convex offset polygon)
  - solid lines every 0.45 mm at ±45°, alternating by layer, kept only where `solid`
  - sparse grid lines at spacing 2W/0.15 in both diagonals, kept only where `!solid`
  - each line sampled every 0.2 mm and split into runs wherever the colour changes.
- **Ordering:** within a layer, all moves are grouped by filament, starting with the colour already loaded. Changes are counted from that.
- **Drawing:** one `InstancedMesh` of an open 6-sided cylinder along X, scaled to (length + 0.9 W, layer height, W), with per-instance colour. The sliders just set `mesh.count`, since instances are stored in print order. The plate view repeats each move across four offsets.
- **Filament estimate:** bead area `(W−t)·t + π(t/2)²` × length × 1.24 g/cm³ (PLA). That's about 8 g per cube.

## 11. Print player (`capture.html`, `grab.py`, `print-player/`)

- `capture.html` is the preview with `alpha` + `preserveDrawingBuffer`, a transparent background, no plate, a radial-gradient shadow decal and a fixed camera (fov 26, position (66, 56, 82), target y 13.2). It exposes `capture(layer, moves, w, h)`.
- `grab.py` renders every second layer (69 frames) at 960 px and downsizes to 480 with Lanczos for antialiasing.
- **Sprite:** 9 columns at 400 px each, WebP q78 (≈ 518 KB). Animated WebP: 70 ms per frame, last frame held 1.8 s. MP4: frames on #F3F4F7, `libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -movflags +faststart` with a 2 s hold (≈ 83 KB).
- `color-cube-print.js` (3.7 KB minified, no dependencies): `<div class="cc-print" data-sprite="…">`. It shows frames with `background-size: cols×100% rows×100%` and percentage `background-position`, loads through IntersectionObserver, autoplays only while visible, stays still for reduced motion, and has a range input plus play button with aria labels.

## 12. Bugs already hit (avoid repeating them)

1. **Operator precedence in `faceQuat`.** `-90*(((k-3)%4)+4)%4` takes `% 4` of the *angle*, so every blue/yellow face came out with the same corner. The fix is `-90*((((k-3)%4)+4)%4)`.
2. **Watershed on the image gradient** let dark navy halves flood into the background. Use the distance transform as the landscape, or the core-fitting method for printed cubes.
3. **`cube3d.py` main block runs `shutil.rmtree(model/)`** and wipes README.txt and viewer.html. Rebuild those afterwards, or remove the rmtree.
4. **Importing `blend_glb.py` runs its top-level code** (the old layer-blend experiment). Move `write_glb_n` into a module with no side effects.
5. **PIL rotation sign:** `Image.rotate(+θ)` is counter-clockwise. Scenes store clockwise angles.
6. **`.loading { display:grid }` overrode the `hidden` attribute.** Add `[hidden]{display:none!important}`.
7. **Lighting before turning** made neighbouring 2D cubes lit from different sides. Always turn first, then light.
8. **Raw scan diagonals** don't line up with the 1.7 mm rim and 1 mm recess. Always rebuild them (`fix_diag` or generated).
9. **Claude artifacts** can't serve `.glb`. Upload models with `upload_asset` (it needs the `assets` capability) and reference `/_blob/<id>`. Page downloads need the `downloads` capability.

## 13. Rebuilding from new scans

1. Put the scans somewhere and point the extract scripts at them. Measure S from single tiles (`extract_p.py` prints the median), and pick the crop height so it excludes any scanner strip.
2. Choose the mask for the set: original paint uses `extract.py`'s brightness/B−R mask; saturated prints use `extract_p.py`. Run extract, classify (update the reference colours from a few tiles) and normalize, then **look at the contact sheet** and fix misreads in `meta.json`.
3. Set `CC_WORK`/`CC_BG`/`CC_2D` and run `render2d.py scan` for a raw-scan finish. For a generated finish, update `FIL` colours and the grain source (`PW`) in `printed_synth.py`, then run `make_faces.py` and `render_synth2d.py`.
4. Vector output only depends on `scenes.json`: `render2d.py vector`.
5. Models: `cube3d.py` (original, plus `CC_PRINTED=1` for a scan-printed version) or `make_models.py` (generated printed). Copy the variants into `r3d/`, run `scenes3d.py`, then `run.py "" scan,printed,flat`.
6. If the cube's size, rim or recess changes, update `S`, `BORDER`, `DEPTH` in `cube3d.py`, `S`, `RIM`, `POCKET` in `printed_synth.py` and the print preview, and `RIM` in `render2d.py`, then re-check orientation with the straight-down tray render.
7. Print player: edit the preview, run `grab.py`, then rebuild the sprite, WebP and MP4 with the commands in section 11.
