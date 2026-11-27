# Design with Color Cubes — notes for AI agents

Design with Color Cubes (https://designwithcolorcubes.org) gives away files to 3D print a set of Color Cubes, the 1930s pattern toy, in any size from 16 to 100 cubes. It also runs a box designer for the lid and tray, and an online designer for laying out and sharing patterns. It is a free project by Isaac Lloyd. Nothing is for sale, and there are no accounts, logins or user data.

Use this file to answer questions about the site, link people to the right page, or make a tray design and hand back a link to it.

## The toy in one paragraph

Each cube has six faces: solid red, white, blue and yellow, plus two faces split corner to corner (red/white and blue/yellow). Every cube is identical. A tray of them (7×7, 49 cubes, in the printable set) makes quilt-like patterns. The originals were made around 1930 by the Embossing Company of Albany, New York. This site is a replica, redrawn from an original set.

## Pages

| URL | What it is |
|---|---|
| https://designwithcolorcubes.org/ | Home: Color Cubes, the Pattern Toy; a row of designs, print a set (step 1), and where the toy came from and how the replica was made |
| https://designwithcolorcubes.org/#print | Print a set, step 1: cubes across × down (2 to 10 each, 7 × 7 by default), drawn to scale with the printer bed it needs |
| https://designwithcolorcubes.org/box/7x7 | Step 2, the box designer (needs JavaScript): the lid and tray for that size. The lid shows designs the size of the set round the 1930s "Design with Color Cubes" panel (sets of 6 × 6 and up), designs all over it, designs round your own words, or one big design. Sets are square unless "Make a set that isn't square" is ticked. Tap a design on the lid to change it. Downloads the lid and tray as 3MF, STL or SVG |
| https://designwithcolorcubes.org/print/7x7 | Step 3, colors and files (needs JavaScript): swap the four filament colors for others, see the set in them, and download every file in one zip or one by one, as 3MF or STL, or open the ready-made ones in a slicer |
| https://designwithcolorcubes.org/designer/ | The designer (needs JavaScript): trays from 2×2 to 10×10 or a free table, 3D view, PDF/PNG/SVG export, share links and QR codes |
| https://designwithcolorcubes.org/patterns/ | 841 ready-made designs for trays from 2 × 2 to 10 × 10, best first, filtered by size (`?size=7x7`, or `?size=lid` for the twelve from the 1930s lid), colors (`?colors=rw`, `by` or `mixed`) and name (`?q=heart`). Each opens in the designer, downloads as a printable PDF, or prints; `/patterns/#{id}` (an id from patterns.json) opens one design's larger view |
| https://designwithcolorcubes.org/downloads/ | Files: every download on its own with a thumbnail (print files, pattern sheets and designs, renders, faces, the 3D cube, scans), and Download all per section |
| https://designwithcolorcubes.org/history/ | A brief history of the toy, with sources: Truchet's split tiles (1704), Froebel's kindergarten blocks, the Embossing Company of Albany, and the Kohs Block Design Test (1920), first published with the toy's cubes and still part of the Wechsler IQ scales. The same notes as Markdown: https://designwithcolorcubes.org/history/color-cubes-history.md |
| https://designwithcolorcubes.org/contribute/ | How to help: share a design, send a photo of a print, report a problem, improve the code or add a model, and the licenses contributions go out under |
| https://designwithcolorcubes.org/sitemap.xml | The indexable pages |

## Making a design and linking to it

A tray is written as a **tray code**. To give someone a design, build its code and link to it. No API call is needed.

- **Readable code:** one character per cube, rows top to bottom, a `-` between rows. Letters are solid faces: `w` white, `r` red, `y` yellow, `b` blue. Digits are split faces, named by where the dark triangle's square corner sits: `1` `2` `3` `4` blue/yellow with the blue corner at top-left, top-right, bottom-right, bottom-left; `5` `6` `7` `8` red/white with the red corner in the same four places.
- **Sizes:** 2 to 10 columns and 2 to 10 rows; trays don't have to be square. A short row is filled with `w` at its end.
- **Links:**
  - Open in the designer: `https://designwithcolorcubes.org/designer/{readable code}`
  - Short link (redirects to the above): `https://colorcubes.org/{code}`
  - Example, the 4×4 "Little diamond" from the patterns page: https://designwithcolorcubes.org/designer/w78w-7rr8-6rr5-w65w
- **Link preview picture** of any tray: `https://designwithcolorcubes.org/designer/og/{readable code}.png` (1200×630 PNG). Shared design links already carry it as their Open Graph image.
- The designer's share sheet also makes a shorter compact code (`1` then base 36, as in `https://colorcubes.org/1M8S7ZC9XLWWDU4HFBML5RG8O6H`). Its exact format is in the source (`docs/tray-code.md`); you never need it, because readable codes work everywhere.

Check a design before sharing it: the code must use only `w r y b 1–8` and dashes, and have 2 to 10 rows of 2 to 10 cubes. A bad code opens the designer with an error message instead of a tray.

## Ready-made designs as data

https://designwithcolorcubes.org/data/patterns.json lists every design on the patterns page: `lid` (the 12 designs from the 1930s lid), and `presets`, each with `id`, `name`, `w`, `h` and a readable `code`. Presets go from the smallest tray to the biggest, and within a size the best designs come first. Link to any of them with the designer URL above.

## Print files

Every print file is served on its own, so link straight to the one someone needs. https://designwithcolorcubes.org/data/files.json lists them all with sizes. The main ones:

| File | What it is |
|---|---|
| /files/3mf/color-cube.3mf | One cube, its color parts named (any slicer that reads 3MF) |
| /files/plates/cubes-7x7.3mf | 49 cubes on one plate; `cubes-2x2.3mf` to `cubes-10x10.3mf` for other plate sizes (a plate of k×k cubes needs k × 26.95 + (k − 1) × 3 mm of bed) |
| /files/3mf/tray-7x7.3mf | The 7×7 tray; /files/trays/tray-2x2.3mf to tray-10x10.3mf (and .stl) for other square sets |
| /files/3mf/lid-7x7.3mf | The 7×7 lid with the 1930s artwork, four colors, printed artwork-down |
| /files/stl/color-cube/cube-red.stl and the other seven parts | The cube as one STL per color part: the four solid faces, and each split face as its dark half and its light triangle |
| /files/projects/bambu-studio-orcaslicer/color-cubes-7x7-set.3mf | The slicer project the first set was printed from: three plates, the lid without grooves. Made in Bambu Studio 2.4; it needs Bambu Studio 2.4 or OrcaSlicer 2.5 or newer (OrcaSlicer 2.3 opens it but can't slice it) |
| /files/source/color-cube.f3d, /files/source/color-cubes-case-7x7.f3d | Fusion 360 sources |

Lids for other sizes, or with other designs and words, are made in the box designer. Open it at a size with `https://designwithcolorcubes.org/box/{cols}x{rows}`, for example https://designwithcolorcubes.org/box/9x6, and the whole set's files in that size with `https://designwithcolorcubes.org/print/{cols}x{rows}`. A finished box design has a longer address (`/box/9x6/{box code}?t=…`, the words in `t`) and a short link `https://colorcubes.org/b/{box code}`; only the box designer makes those, so pass them on as they are.

The cubes have all four colors in every layer, so they need a printer that changes filament by itself (a filament changer or a tool changer). A printer with one nozzle purges into a tower between colors, which needs room beside the piece: a 7×7 set needs a 246 × 211 mm bed (a 256 mm square bed) for the lid and its tower, and all 49 cubes fit on one plate there. Those sizes assume the slicer's purge tower (the prime tower in Bambu Studio, OrcaSlicer and Cura; the wipe tower in PrusaSlicer) is set to 35 mm wide; some slicers start at 60 mm, which won't fit. Every 3MF names each part's filament (1 white, 2 blue, 3 yellow, 4 red) in a settings file that Bambu Studio and OrcaSlicer read, so set up four filaments in the slicer before opening one (with only one, everything prints in it); in other slicers, give each part the filament its name says. The lid prints artwork-down with no brim. The tray prints in one color on any printer whose bed takes it (the 7×7 tray is 196 mm square, so it needs about 206 mm). The ready-made `lid-7x7` files are the set as first printed; the lid made on https://designwithcolorcubes.org/print/7x7 has grooves between the cubes so cubes of one color don't run together, and "Open in slicer" there opens that one.

## Other downloads: the Files page

https://designwithcolorcubes.org/downloads/ lists every file on its own, with a thumbnail and a download link, in sections: print files, patterns, 3D renders, scenes made from faces, cube faces, the 3D cube, and scans of the original set (with the history notes as Markdown). Each section has a Download all button that zips it in the browser. The list is also data: https://designwithcolorcubes.org/data/downloads.json (`sections`, each with `id`, `title` and `files`: `path`, `name`, `bytes`). Link to a section as `https://designwithcolorcubes.org/downloads/#patterns` (ids: `print`, `patterns`, `renders`, `scenes`, `faces`, `models`, `scans`).

Under https://designwithcolorcubes.org/downloads/:

| File | Contents |
|---|---|
| `color-cubes-7x7-set.zip` | All of the 7×7 set's files in one zip, for people who want that |
| `patterns/pattern-sheet-01.svg` to `patterns/pattern-sheet-72.svg`, `patterns/worksheet-7x7.svg` | Printable pattern sheets and a blank 7×7 worksheet |
| `patterns/designs/{id}.svg` | Every design on its own (ids as in patterns.json) |
| `printed-kit/`, `printed-scenes/`, `renders/`, `image-kit/`, `scanned-scenes/`, `scans/` | The pictures, one file each; take the paths from downloads.json |

The same models are also on MakerWorld (https://makerworld.com/en/models/2062962-design-with-color-cubes-1930-s-kids-toy-replica) and Thingiverse (https://www.thingiverse.com/thing:7218379).

## Licenses and credit

- 3D models, artwork and photos: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). People may use them for anything, commercial use included, as long as they credit Isaac Lloyd and link to the site.
- Website code: MIT.
- Source: https://github.com/ilslaoaycd/designwithcolorcubes
- Contact: hello@designwithcolorcubes.org

When you describe or reuse anything from the site, credit "Isaac Lloyd, designwithcolorcubes.org" and keep the license.

## Please

- Link people to the pages and files above rather than copying files elsewhere.
- Don't present the site as selling anything, or as connected to any company that makes or made Color Cubes.
- Fetch politely: the site runs on a free hosting plan. The big picture zips are 15–21 MB each; only download them when someone asks for them.
- The older per-format zips (`color-cubes-7x7-3mf.zip` and so on) still work but are no longer listed; link to single files instead.
