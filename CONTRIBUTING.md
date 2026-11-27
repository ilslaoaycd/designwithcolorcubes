# Contributing

Thanks for helping. This is a free, 3D-printable replica of Color Cubes, the 1930s designing toy, with a box designer and a pattern designer at [designwithcolorcubes.org](https://designwithcolorcubes.org).

There's a plain-language version of this guide, for people who don't write code, at [designwithcolorcubes.org/contribute/](https://designwithcolorcubes.org/contribute/). This file is for people changing the code or sending in models through pull requests.

## Ways in

- **A problem or a question**: open an [issue](https://github.com/ilslaoaycd/designwithcolorcubes/issues/new/choose) with the bug report form.
- **A design**: make it in the [designer](https://designwithcolorcubes.org/designer/), press Share, and send the link with the design idea form.
- **A model**: send it with the model form, or as a pull request into `community/models/` (below).
- **Code**: a pull request. For anything bigger than a fix, open an issue first so we can agree on the approach before you spend the time.

## Setup

You need Node 18 or later and Git. There's nothing to install for the tests.

```sh
git clone https://github.com/<you>/designwithcolorcubes.git
cd designwithcolorcubes
npm test                      # tray codes, redirects, patterns, print files, lids, the site
npx wrangler dev -c workers/site/wrangler.jsonc --port 8799   # the site at http://localhost:8799
```

`npm test` must pass before a pull request is merged. If you change behaviour, add or change a test in `test/` in the same pull request.

Some things can't be rebuilt from this repository: the models in `models/`, the artwork, the page pictures and the picture zips are built from Isaac's working files and image packs, which aren't in it (see the README's Commands section). If your change needs one of those rebuilt, say so in the pull request and Isaac will run it.

## How the code is laid out

The [README](README.md) has the full map. The parts people most often want to change:

| File | What it does |
|---|---|
| `site/js/print3d.js` | Trays, cube plates and lids as closed meshes, plus the STL, 3MF and zip writers. Runs in the browser and in Node. |
| `site/js/lidart.js` | The lid's layout and artwork as flat shapes, one set per filament color |
| `site/js/cubecode.js` | The tray code format ([docs/tray-code.md](docs/tray-code.md)), shared with the redirect Worker |
| `site/js/cubeface.js` | The cube face geometry, measured from an original cube. All cube drawing goes through it. |
| `site/js/slicers.js` | "Open in slicer" links ([docs/slicer-links.md](docs/slicer-links.md)) |
| `tools/presets.mjs` | The preset designs as tray codes, best first within each size (helpers for making trays are in `tools/patterns-src.mjs`) |
| `tools/build_models.py`, `tools/build_print_files.mjs` | Build `models/` and `site/files/` |
| `workers/site/`, `workers/redirects/` | The two Cloudflare Workers |

## Conventions

- **No framework, no build step.** The site is plain static HTML, CSS and ES modules, served as they are. Don't add a bundler, a CSS framework or npm dependencies for the site. three.js is vendored in `site/js/vendor/three/` and loads only when someone opens a 3D view.
- **Free hosting.** The site runs on Cloudflare's free Workers plan: 10 ms of CPU a request and no paid features. The Worker only routes and draws link previews; anything heavy belongs in the browser or in WebAssembly.
- **The tray code is shared.** `site/js/cubecode.js` is used by the site and by the redirect Worker, and links already in the wild depend on it. Don't change what an existing code means. Keep `npm test` passing.
- **One cube geometry.** Draw cubes with `site/js/cubeface.js`, not with shapes of your own, so the pages, the designer and the artwork match.
- **Lids must be closed.** `print3d.js` turns the lid art into one 0.6 mm layer per color. Shapes of one color must share edge points exactly (no T-junctions) so each color's layer is a single closed solid. `npm test` checks every layer is closed and that the layers tile the top; add a case if you add a new kind of shape.
- **No pinwheel presets.** A design that only turns around its center (pinwheels, windmills) can read as a swastika. Build presets by mirroring or repeating; `npm test` fails a preset whose only symmetry is a turn. Be careful with star shapes too.
- **The one swastika-motif original stays out.** The 1930s pattern sheet has one design with a swastika motif. It appears only in the history section, with a footnote. Don't add it to presets, galleries, examples or tests' sample data.
- **Strip photo metadata.** Every photo in `site/img/` (and anywhere else in the repository) goes in with its metadata removed: `magick in.jpg -strip out.jpg`. Phones store where a picture was taken.
- **Brand-neutral.** Every printer and slicer gets the same treatment: the same kind of button, the same prominence. No brand gets a special place, even if the site partners with one.
- **The look.** Rubik is the only typeface. Pictures are renders and scans of real cubes, not stock art or icons. The site is a modern revival, not a copy of the 1930s box lettering.
- **Pages stay in step.** Every page has the same favicon links, a canonical URL, Open Graph and Twitter tags and JSON-LD. A new page goes in `site/sitemap.xml`. When pages, URLs, the tray code, downloads or licenses change, update `site/agents.md` in the same change.
- **Writing.** Short sentences, plain words, no marketing language and no emoji, on the pages and in commit messages.

## Adding a preset design

Presets live in `tools/presets.mjs`, one line each with a name and a tray code, best first within each size. The easiest way to get a code is to lay the design out in the designer and copy it from Share. A face is written with the tray-code letters: `w r y b` for solid faces, `1`–`4` for the blue/yellow face with its blue corner at top-left, top-right, bottom-right, bottom-left, and `5`–`8` for the red/white face with its red corner in the same four places.

```js
["Red diamond", "www7www-ww7r8ww-w7rrr8w-7rrbrr8-w6rrr5w-ww6r5ww-www6www"],
```

Put it where it ranks among the designs of its size, not at the end: the box designer fills a lid with the first designs of the set's size. Build designs by mirroring or repeating. A design that only turns around its center (a pinwheel) can read as a swastika, so `npm test` fails it, and it fails two designs of one size that are the same design turned or mirrored. `tools/patterns-src.mjs` has helpers for making a tray from a rule, such as mirroring a quarter or repeating a tile. Then:

```sh
node tools/build_patterns.mjs   # rewrites site/data/patterns.json and the pattern sheets
npm test
```

Check it in the designer at `/designer/{code}` before you send it. If the design is someone else's, put their name in the pull request and the commit message.

## Sending in a model

Models from outside the project go in their own folder under `community/models/`. `models/` is Isaac's set and is built by a script, so don't put files there by hand.

```
community/models/<short-name>/
  README.md            who made it, the license, print settings, what it's for
  <short-name>.3mf     preferred: one object, parts named by color
  stl/                 one STL per part, named by color: drawer-red.stl, drawer-white.stl
  source/              optional: the file you made it in (.f3d, .FCStd, .scad, .blend, .step)
  photo.jpg            a photo of a real print, metadata stripped
```

`<short-name>` is lowercase words joined by hyphens, saying what it is: `drawer-7x7`, `rounded-cube`, `tray-8x8-stacking`. See [community/README.md](community/README.md) for the README template.

The quality bar:

- Every part is a closed mesh (watertight, no holes or flipped normals).
- Millimetres, at the size it prints. A cube is 26.95 mm; the 7×7 tray is 196 × 196 × 18 mm.
- 3MF first, plus STL of each part.
- Prints without supports or a raft, or the README says why not.
- Multicolor models are split into one part per filament, named by color (`cube-red.stl`, `lid-art-blue.stl`), with the same names inside the 3MF.
- A photo of a real print from these exact files.
- Files under about 25 MB each. Cloudflare won't serve a bigger file from the site; if yours is bigger, say so in the issue and we'll find another way.

## Licenses and sign-off

Contributions go out under the same licenses as the rest of the project (inbound = outbound):

- **Code**: MIT ([LICENSE](LICENSE)).
- **Models, artwork and photos**: CC BY 4.0 ([LICENSE-MODELS](LICENSE-MODELS)). A model in `community/models/` may instead use CC0; say so in its README. Other licenses can't be accepted.

You keep the copyright in what you send. Remixes of other people's models are welcome when their license allows it; link to the original and credit its author in the README.

Sign off every commit with the [Developer Certificate of Origin](https://developercertificate.org/):

```sh
git commit -s -m "Add a 7×7 drawer"
```

That adds `Signed-off-by: Your Name <you@example.com>` to the commit, which says you wrote the change, or otherwise have the right to send it under the project's licenses. Use the noreply address GitHub gives you if you'd rather keep your email private. If you forget, `git commit --amend -s` fixes the last commit and `git rebase --signoff main` fixes a branch.

The issue forms ask for the same promise with a checkbox, for people who send files without a pull request.

## Pull requests

- One change per pull request, on its own branch.
- Say what you changed, why, and how you checked it (tests, a browser, a print).
- Screenshots for anything you can see; a photo for anything you printed.
- Keep `npm test` passing.

Thanks again.
