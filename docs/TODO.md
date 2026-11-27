# To do

Work that has been asked for but not started, or that needs Isaac's machine or eyes. Take the top item unless Isaac says otherwise.

## Try the "Open in slicer" buttons on real installs

`site/js/slicers.js` follows each slicer's source code (`docs/slicer-links.md`), but none of it has been clicked through on a real computer. Check at least OrcaSlicer, Bambu Studio (it asks "not from a trusted site"), Cura (3MF relies on the Content-Disposition header in `site/_headers`), Creality Print and QIDI Studio on Windows (their Windows registration is unverified), and Snapmaker Orca. Also try a file made in the page (a lid, or any color but the defaults), which goes through `/print/f/` and the edge cache, and Recessed against Flat cubes in a slicer: each split face should come in as two parts, ready for two filaments. Drop any button that doesn't work.

## A Printables listing

PrusaSlicer only opens links from Printables, Thingiverse and Cults3D. A Printables copy of the model would give Prusa users a one-click button too. The site should stay brand-neutral whatever partnerships come later: every printer and slicer gets the same treatment.

## Print a lid from the box designer

The box designer's lids follow the 7×7 lid's sizes (0.6 mm art layer under a 2.4 mm white plate, 1.75 mm walls, 0.4 mm clearance), but no generated lid has been printed yet. Print one small one (4×4) and check the fit over the tray, the smallest letters (the designer warns under 3 mm) and the design cells.

## Lid designer extras

Ideas not built: more lettering styles (only Rubik and the 1930s lines now), moving and resizing the title panel by hand, and a 3MF with the lid, tray and cubes on separate plates in one project file.

## Search the "COLOR CUBES" name (Isaac)

The licenses are decided (CC BY 4.0 for models, artwork and photos; MIT for code; see `docs/licensing.md`). One thing from that note is left: the one USPTO search for "COLOR CUBES" it suggests; note the result there. Also update the MakerWorld and Thingiverse listings to CC BY 4.0.

## Publish the working files (Isaac)

The site repository went public on 2026-11-26 (see `docs/public-resources.md`). Still to do: create `ilslaoaycd/color-cubes-resources` with `Replica Files/` and the image packs as release downloads, as that note describes, after reading through what's in them, then link it from the README and the Contribute page.

## Print a lid with the new tile gaps

Generated lids now set each cube in a design 0.25 mm (or 4.5% of a cube) inside its square, on a backing in the frame's color (blue if the frame isn't red or blue), so white tiles read against a white lid as on the printed one. The lines between tiles come out about 0.5 mm wide on a 7 × 7 lid. Print one and check the lines come through cleanly; widen `groutWidth` in `site/js/lidart.js` if they don't.
