## What this changes

<!-- One or two sentences: what changed and why. Link the issue if there is one ("Fixes #12"). -->

## How I checked it

<!-- Tests, a browser (which one, phone or desktop), a slicer, a real print. -->

- [ ] `npm test` passes
- [ ] Screenshots or a photo, if it changes something you can see or print

## If it touches…

- [ ] **The tray code** (`site/js/cubecode.js`): existing codes and links still mean the same thing
- [ ] **Lids or trays** (`print3d.js`, `lidart.js`): every color layer is still a closed mesh, and a test covers the new case
- [ ] **Presets** (`tools/presets.mjs`): in rank order for their size, mirrored or repeated, no pinwheels; `node tools/build_patterns.mjs` re-run
- [ ] **Pages**: same favicon links and meta tags as the others; `site/sitemap.xml` and `site/agents.md` updated if pages, URLs, downloads or licenses changed
- [ ] **Photos**: metadata stripped (`magick in.jpg -strip out.jpg`)
- [ ] **Slicers or printers**: every brand treated the same
- [ ] **A model** (`community/models/<short-name>/`): README with author, license, print settings and a photo; parts named by color; closed meshes

## Sign-off

- [ ] Every commit is signed off (`git commit -s`), agreeing to the [Developer Certificate of Origin](https://developercertificate.org/). Code goes out under MIT, models, artwork and photos under CC BY 4.0 (or CC0 for a community model, as its README says).
