# Open in slicer links

`site/js/slicers.js` builds "Open in …" links for the print files under `/files/`, and for the files the print page makes (see "Files made in the page" below). Each desktop slicer registers a URL scheme; given `?file=<url>` it downloads the file itself (with libcurl, or Qt in Cura) and opens it. These notes come from reading each slicer's source in November 2026. None of it was tested against real installs.

## What works for files on this site

| Slicer | Link (`U` = absolute https URL, `encodeURIComponent` once) | Host check | Types | Since |
|---|---|---|---|---|
| OrcaSlicer | `orcaslicer://open?file=U` | none | 3MF, STL, OBJ, STEP | 2.1.0 |
| Snapmaker Orca | `snapmaker-orca://open?file=U` | none | as Orca | 2.3.1 |
| Elegoo Slicer | `elegooslicer://open?file=U` | none | 3MF, STL, OBJ, STEP | 1.2.0.17 or earlier |
| Creality Print | `crealityprintlink://open?file=U` | none | any | 6.0.4 |
| Bambu Studio | Windows, Linux: `bambustudio://open?file=U`; macOS: `bambustudioopen://U` | MakerWorld hosts; others get a "not from a trusted site, open anyway?" prompt | 3MF only | prompt since 2.01.00 |
| QIDI Studio | Windows, Linux: `qidistudio://open?file=U`; macOS: `qidistudioopen://U` | as Bambu | 3MF only | 2.02.00.60 |
| UltiMaker Cura | `cura://open?file=U` | none | STL; 3MF needs `Content-Disposition: attachment; filename="x.3mf"` | 5.7.0 |
| PrusaSlicer | `prusaslicer://open?file=U` | **https on printables.com, thingiverse.com (and cults3d.com in 2.9.x) only**, no prompt | — | 2.6.0 |

Left out: PrusaSlicer and SuperSlicer (allow-listed hosts only; Prusa says it has no plans to change this, [issue 13752](https://github.com/prusa3d/PrusaSlicer/issues/13752)), Anycubic Slicer Next (its source registers `orcaslicer://` itself, so the Orca button may open it), Snapmaker Luban, FlashPrint, Simplify3D and ideaMaker (no scheme found).

## Rules for the file URLs

- Absolute https, ending in `.3mf` or `.stl`, with no query string: Orca and Elegoo name the saved file after the last `/`, Bambu and QIDI insist on a `.3mf` filename, and Creality looks for the text `name=` anywhere in the URL.
- Zips don't work (only Elegoo takes them).
- Cura reads the type from `Content-Disposition`, so `tools/build_print_files.mjs` writes one header rule per file into `site/_headers` (between the "print files" markers). Workers static assets allow 100 rules in `_headers`; keep an eye on that if many more files are added.
- The slicer fetches the file without a browser, so Cloudflare challenges (Bot Fight Mode, "Just a moment" pages) must stay off `/files/*`. CORS doesn't matter.
- If the slicer isn't installed the link does nothing, so a plain download always sits beside the buttons. The buttons are hidden on phones and tablets.

## Files made in the page

The print page makes every file in the browser, in the chosen colors and face style, so most of them exist nowhere a slicer could download from. Its Open button builds the 3MF, POSTs it to `/print/f/{SHA-256 of the bytes}/{name}.3mf`, and then sends the slicer that address:

- The site Worker (`workers/site/src/index.js`, `slicerFile`) accepts the POST only if the bytes hash to the name, start like a zip and name `3D/3dmodel.model`, and are at most 8 MB. It puts them in the edge cache (`caches.default`) for a day with `Content-Type: model/3mf` and the `Content-Disposition` Cura needs, and answers 204.
- The slicer's GET is served from that cache. The cache belongs to one Cloudflare data center, which is the one the same computer reaches a moment later; a miss (or a file over a day old) gets a 404 that points back to the print page.
- A browser behind a VPN or a relay (iCloud Private Relay) can reach a different data center from the slicer, which then misses; the page says to download the file if the slicer can't open it. A computer on its own network reaches one data center, though requests can still alternate between two (seen from a cloud container), so a miss is possible but rare.
- Nothing is built on the server (a lid takes 100–250 ms of CPU in JavaScript, far over the free plan's 10 ms) and nothing is stored beyond the cache. Always the 3MF, which carries the colors, whatever file type the page is set to.

## Sources

Read at these commits:
- PrusaSlicer [Downloader.cpp#L171](https://github.com/prusa3d/PrusaSlicer/blob/e6c85c50dcc56f9968a61dfdd7a3b695e1004037/src/slic3r/GUI/Downloader.cpp#L171) and the [help page](https://help.prusa3d.com/article/opening-models-in-prusaslicer-from-supported-websites_399198)
- OrcaSlicer [Downloader.cpp#L161](https://github.com/SoftFever/OrcaSlicer/blob/5c671c7995aab8365856a468d63f43fc2975e7ad/src/slic3r/GUI/Downloader.cpp#L161)
- Bambu Studio [GUI_App.cpp#L1116](https://github.com/bambulab/BambuStudio/blob/8e524a39d4c4cd0541801c1c46d2f77debb0bf1d/src/slic3r/GUI/GUI_App.cpp#L1116), [#L1226](https://github.com/bambulab/BambuStudio/blob/8e524a39d4c4cd0541801c1c46d2f77debb0bf1d/src/slic3r/GUI/GUI_App.cpp#L1226), [Info.plist.in#L37](https://github.com/bambulab/BambuStudio/blob/8e524a39d4c4cd0541801c1c46d2f77debb0bf1d/src/platform/osx/Info.plist.in#L37)
- QIDI Studio [GUI_App.cpp#L1135](https://github.com/QIDITECH/QIDIStudio/blob/21d47457919212b8af3f97705716c261b97be559/src/slic3r/GUI/GUI_App.cpp#L1135)
- Snapmaker Orca [Downloader.cpp#L208](https://github.com/Snapmaker/OrcaSlicer/blob/6f9d9da5ce3bb404647000df75a8a744c02693f9/src/slic3r/GUI/Downloader.cpp#L208)
- Elegoo Slicer [Downloader.cpp#L92](https://github.com/ELEGOO-3D/ElegooSlicer/blob/2d507e39a96ab9562b35d06b23ef5df8fe613297/src/slic3r/GUI/Downloader.cpp#L92)
- Creality Print [Downloader.cpp#L148](https://github.com/CrealityOfficial/CrealityPrint/blob/6262848e302b8c0d593f2b341cd01310aa2f58a1/src/slic3r/GUI/Downloader.cpp#L148)
- Cura [CuraApplication.py#L1855](https://github.com/Ultimaker/Cura/blob/1a221ec29a86960d16a412940becc1f63534c41f/cura/CuraApplication.py#L1855)
- Anycubic Slicer Next [GUI_App.cpp#L2472](https://github.com/ANYCUBIC-3D/AnycubicSlicerNext/blob/6103ed8b511609658d00d0538cc7f0609cdb57da/src/slic3r/GUI/GUI_App.cpp#L2472)
- Manyfold, a self-hosted model library that offers the same buttons for its own files: [slic3r_family.rb](https://github.com/manyfold3d/manyfold/blob/5274a6d5cbbd82f7e5b0df9427129c63df841426/app/lib/file_handlers/slic3r_family.rb), [bambu_studio.rb](https://github.com/manyfold3d/manyfold/blob/5274a6d5cbbd82f7e5b0df9427129c63df841426/app/lib/file_handlers/bambu_studio.rb)

Not verified: how Creality Print and QIDI Studio register their schemes on Windows; whether Bambu Studio needs its network plug-in installed to open links; Snapmaker Orca on Linux.
