# Design with Color Cubes

Free files to 3D print Color Cubes, the 1930s designing toy, for sets of 16 to 100 cubes, plus a box designer for the lid and tray and an online designer for laying out and sharing patterns.

**[designwithcolorcubes.org](https://designwithcolorcubes.org)**

Color Cubes were made by the Embossing Company of Albany, New York. Each cube has four solid faces (red, cream, blue, yellow) and two faces split corner to corner (red/cream and blue/yellow). A tray of 49 identical cubes makes quilt-like patterns. This project is Isaac Lloyd's replica, redrawn from an original set.

## What's here

| Folder | What it is |
|---|---|
| `models/` | The printable 7×7 set in 3MF, STL and OBJ for any slicer, a ready-made slicer project, and the Fusion sources |
| `artwork/` | The lid artwork as SVG, the pattern sheets and every design as SVG, 300 dpi scans of the original set with every loose cube cut out, and (in `assets/`) the vector faces and scenes, the 3D cube model and the scripts that rendered the pictures |
| `site/` | The website, served as plain static files (no framework, no build step) |
| `site/js/cubecode.js` | The tray code format: turns a tray of cubes into a short code and back |
| `site/agents.md`, `site/llms.txt` | Public notes for AI agents: the pages, how to link to a design, the downloads and licenses |
| `site/js/cubeface.js` | The cube face geometry (measured from an original), drawn as SVG and shared with the designer's canvas |
| `site/designer/` | The designer: an app-style canvas (`board.js`), its controls and keyboard shortcuts (`designer.js`), the 3D tray view (`view3d.js`), the printable PDF (`pdf.js`) and Your designs, every design kept in the browser (`saved.js`) |
| `site/box/` | The box designer (step 2 of printing a set): a lid and tray for any size of set; the lid holds designs round the 1930s panel or your own words, or one big design |
| `site/print/` | Colors and files (step 3): swap the four filament colors, see the set in them in 3D, and download everything in one zip or file by file, as 3MF or STL |
| `site/js/boxcode.js` | A box design as a short code for links (`/box/7x7/{code}`, `colorcubes.org/b/{code}`), shared with the redirect Worker |
| `site/js/designs.js`, `site/js/box3d.js` | Designs made up on the spot for any tray size (mirrored or repeated, never pinwheels), and the lid, tray and cubes in 3D |
| `site/js/print3d.js` | 3D files made in the browser (or Node): trays for any size, plates of cubes, lids with four-color art (grooves between the cubes, a ledge for the tray), the beds a set needs, and the STL, 3MF and zip writers (each 3MF names every part's filament for the slicers that read it) |
| `site/js/lidbuild.js`, `site/js/lid-worker.js` | A lid's parts made in a module worker, off the page's main thread, for the print page and the box designer's 3D view |
| `site/js/paper.js` | Letter or A4 for the printable PDFs: a guess from the browser's languages, or the one picked in the designer's Export |
| `site/js/lidart.js` | The lid's layout and artwork (frame, design spots, title panel, lettering, stars) as shapes in the four filament colors; `site/data/lid-type.json` holds the lettering |
| `site/js/set-picker.js`, `site/js/slicers.js` | "Print a set" on the home page (cubes across × down, drawn to scale with the bed it needs, purge tower included), and the "Open in slicer" links on the files page (see `docs/slicer-links.md`) |
| `site/files/` | Every print file on its own (copied from `models/`), plus trays and cube plates for every size; listed in `site/data/files.json` |
| `site/js/cube3d.js` | The 3D cube on the home page, loaded only when someone asks for it |
| `site/img/art/`, `site/img/faces/`, `site/models/` | Renders and scenes used on the pages, the realistic renders (the hero's original-and-printed picture, the home page's row of trays in `site/img/trays/`, the patterns page's pile of trays (`site/img/trays-pile/`), the original-set renders and the spill strip, rendered from the two 3D cubes by `tools/render_scenes.py`) and the paper grain, the faces of the 3D-printed and the original cubes (one per code, plus a texture atlas of each for the designer), and the 3D cube in its three finishes (the printed one with its textures halved for the web) |
| `workers/site/` | Cloudflare Worker that serves `site/` at designwithcolorcubes.org, and gives each shared tray its own title and link-preview picture (`og.js`, drawn by `og.c` compiled to `og.wasm`) |
| `workers/redirects/` | Cloudflare Worker for colorcubes.org short links and the other hostnames |
| `tools/` | Scripts that build `models/`, `artwork/` and `site/downloads/` from the working files |
| `community/models/` | Models from other people, one folder each with its own README (see [CONTRIBUTING.md](CONTRIBUTING.md)) |
| `site/downloads/` | The Files page: every download on its own (print files listed from `site/files/`, pattern sheets and designs, the picture kits in one folder each, scans), with thumbnails; `tools/build_downloads.py` builds its lists and `site/data/downloads.json` |
| `site/contribute/` | The Contribute page: how to help, for people who don't write code |
| `site/history/` | The History page (not in the header; linked from the home page and the footer), and its notes as a downloadable `color-cubes-history.md` |
| `docs/tray-code.md` | The tray code format |
| `docs/slicer-links.md` | Which slicers open files from a link, and how |
| `docs/rendering.md` | Isaac's notes on how the image pack (pictures, faces, 3D cube, print animation) was made |
| `docs/licensing.md` | Which licenses to use, and why (a recommendation waiting for Isaac) |
| `docs/public-resources.md` | Opening this repository and publishing the working files in a resources repository |
| `docs/TODO.md` | Work asked for but not started |

## Using the tray code library

`site/js/cubecode.js` has no dependencies and runs in a browser, Node or a Worker.

```js
import { parseCode, toReadable, toCompact } from "./site/js/cubecode.js";

const tray = parseCode("wbwb-bwbw");          // { grid, w: 4, h: 2, kind: "readable" }
toCompact(tray.grid, tray.w, tray.h);         // short form for QR codes
toReadable(tray.grid, tray.w, tray.h);        // "wbwb-bwbw"
```

A tray's short link is `https://colorcubes.org/{code}`; a box design's is `https://colorcubes.org/b/{box code}`. The format is described in [docs/tray-code.md](docs/tray-code.md).

## Commands

Needs Node 18 or later. Wrangler runs through `npx`; there is nothing to install for the tests.

```sh
npm test                  # tray codes, redirects, patterns, print files and lids
npm run dev:site          # the site at http://localhost:8787
npm run dev:redirects     # the redirect Worker
npm run deploy:site
npm run deploy:redirects
```

Rebuilding the models and artwork needs Python 3 with `trimesh`, `numpy`, `Pillow` and `opencv-python`, ImageMagick, and the working files in `Replica Files/` and the original scans (neither is in this repository):

```sh
python tools/build_models.py               # models/ and the model zips
node tools/build_print_files.mjs           # site/files/ (each model file on its own), trays and plates for every size, files.json; run after build_models.py
python tools/build_lid_data.py [cover.svg] # site/data/lid-type.json: Rubik outlines and, from the cover's "White Text" layer, the 1930s lettering
python tools/build_artwork.py              # lid artwork and the 12 lid designs
node tools/build_patterns.mjs              # presets, pattern sheets and their zip
python tools/build_scans.py <scans folder> # scans, cube cutouts and the scans zip
python tools/build_assets.py <main pack> --printed <printed pack>  # page pictures, faces and atlases, 3D cubes and the picture zips (add --web to skip the zips)
python tools/render_scenes.py [scene ...]        # the realistic renders (hero, trays, spill, link previews), from the 3D cubes in a browser (--paper for the paper grain)
node tools/build_logo.mjs [--png]                # the mark, favicon and page-header mark (--png: favicon.ico, touch and app icons)
node tools/build_og.mjs                          # link-preview pictures for the designer and box designer pages
python tools/build_og_previews.py                # the other link previews: the home photo, and the patterns and print renders on paper
python tools/build_downloads.py                  # the Files page: thumbnails, data/downloads.json and its lists (after any tool that changes the downloads)
python tools/build_photo_sizes.py                # WebP sizes of the home page's photos for its srcsets (after changing one)
node tools/build_seo.mjs                         # design counts and the opening list on the patterns page, sitemap.xml; checks every JSON-LD block (after changing pages or patterns.json)
npm run build:og                                 # workers/site/src/og.wasm from og.c (needs clang with the wasm32 target)
```

The preset designs are listed as tray codes in `tools/presets.mjs`, best first within each size; `tools/patterns-src.mjs` has helpers for building a tray by mirroring or repeating. A design that only turns around its center (a pinwheel) can read as a swastika, and `npm test` fails it, as it does two designs of one size that are the same design turned or mirrored.

## Contributing

Designs, photos of prints, fixes and models are all welcome. See [CONTRIBUTING.md](CONTRIBUTING.md), or the plain-language guide at [designwithcolorcubes.org/contribute/](https://designwithcolorcubes.org/contribute/).

## Licenses

- **Code** (everything under `site/js`, `site/designer`, `site/css`, `workers`, `tools`, `test`): MIT. See [LICENSE](LICENSE).
- **3D models, artwork and photos** (`models/`, `artwork/`, `site/img/`, `site/models/`, `site/downloads/`, `reference/photos/`): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [LICENSE-MODELS](LICENSE-MODELS). Print them, sell them, give them away and remix them, with credit to Isaac Lloyd.
- **Third-party**: `site/js/vendor/qrcode.js` is qrcode-generator by Kazuhiko Arase (MIT). `site/js/vendor/three/` is three.js 0.160 (MIT), loaded only by the 3D cube on the home page and the designer's 3D view. The font in `site/fonts/` is Rubik (SIL Open Font License); its license file is beside it.

Color Cubes were made around 1930 by the Embossing Company of Albany, New York; this replica is redrawn from an original set.
