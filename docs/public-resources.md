# Putting the project and its resources on GitHub

Isaac wants people to contribute code (the generators: `site/js/print3d.js`, `site/js/lidart.js`, `tools/build_models.py`, `tools/build_print_files.mjs`, the preset designs in `tools/presets.mjs`), 3D models (remixes, other cubes, trays, storage, lids) and pattern designs. Two things stand in the way:

1. The repository `ilslaoaycd/designwithcolorcubes` is private, so nobody else can see it, fork it or open an issue.
2. The working originals aren't in it: `Replica Files/`, the Fusion working files, the two image packs (the original set and the 3D-printed set) and the full-size scans, well over 100 MB in all. People who want to remix a model properly need the sources, not just the STLs.

GitHub can't make part of a repository private. Whatever is in a public repository, including its whole history, is public.

## The options

**(a) Make this repository public**, after checking its history (below).

- Contributors get the code, the tests, the built models and the issue forms in one place, and pull requests work as normal.
- It's already set up for it: code is MIT, models CC BY, and the deploy credentials come from the environment, not from files.
- It doesn't solve the working files. They'd still be on Isaac's machine only.

**(b) A separate public repository for the resources**, such as `ilslaoaycd/color-cubes-resources`, with the big files as release downloads.

- Keeps the big, rarely changing files out of the site repository, so cloning it stays quick.
- Its own license file and README, written for people who model rather than code.
- On its own, it leaves the code and generators private, which is most of what people asked to contribute to.

**Git LFS or Releases for the big files?** Use GitHub Releases. A file attached to a release can be up to 2 GiB, and GitHub sets no limit on a release's total size or its downloads. Git LFS counts storage and download bandwidth against the owner's allowance (small on a free account), every clone and fork of a public repository uses it up, and when it runs out, downloads stop until the next month or a payment. LFS is worth it only for big files that change often, and these don't.

## Recommendation: both

1. **Make `designwithcolorcubes` public** once the checklist below passes. It's where the code, the tests and the built models already live, and where contributions will land.
2. **Create `ilslaoaycd/color-cubes-resources`, public**, for the working files: Fusion sources and STEP exports, the cover artwork, the full-size scans, and the two image packs as release downloads.
3. Link each from the other's README, and from the Contribute page.

The site keeps deploying from this repository exactly as now; neither change touches Cloudflare.

## Before making the site repository public

**Done 2026-11-26.** On a fresh clone: gitleaks 8.30 found nothing in the history or the files; none of the ignored files were ever committed; no image, PDF, zip or 3MF in the history carries a location, camera or owner; the biggest file is 20.8 MB. The repository is public with secret scanning, push protection and private vulnerability reporting on, the `design` and `model` labels, and a ruleset ("Protect main") that blocks force pushes to and deletion of `main`. The same day the history was rewritten with `git filter-repo`: `CLAUDE.md` and `.claude/` removed (now git-ignored), Claude Code session links dropped from commit messages, and an early home-page letter about Isaac's family taken out of old versions of the home page, drafts, README, scan notes and two old scan zips. The steps below are kept for the resources repository.

Run these on Isaac's machine, in a fresh clone so nothing local is missed or picked up by accident:

```sh
git clone https://github.com/ilslaoaycd/designwithcolorcubes.git dwcc-check
cd dwcc-check
```

1. **Scan the whole history for secrets.** Either tool is fine:

   ```sh
   brew install gitleaks                     # or see github.com/gitleaks/gitleaks
   gitleaks git . --verbose                  # older versions: gitleaks detect --source . --log-opts="--all"

   brew install trufflehog
   trufflehog git file://. --results=verified,unknown
   ```

   A quick search of the history on 2026-11-24 found no tokens, keys or passwords. The Cloudflare account ID is in both `wrangler.jsonc` files; an account ID isn't a secret (it's in every dashboard address), and the API token never was in the repository. If anything does turn up, revoke the token first, then clean the history with `git filter-repo`.

2. **Check the ignored files never got in.** These must print nothing:

   ```sh
   git log --all --oneline -- "Replica Files" docs/HANDOFF.md reference/Color_Cubes_Reference.pdf tools/.kit-stage .dev.vars
   ```

   They printed nothing on 2026-11-24. `reference/Color_Cubes_Reference.pdf` and `docs/HANDOFF.md` hold other people's pictures and must stay out of both repositories.

3. **Review `.gitignore`.** It should keep ignoring `Replica Files/`, `docs/HANDOFF.md`, `reference/Color_Cubes_Reference.pdf`, `tools/.kit-stage/`, `.dev.vars`, `.wrangler/`, `node_modules/`, `__pycache__/` and `.DS_Store`. Add anything else on Isaac's machine that's personal before the next commit: `git status --ignored` shows what's being ignored now.

4. **Photo metadata.** Every photo should be stripped. This lists any that still carry a location:

   ```sh
   brew install exiftool
   exiftool -r -if '$GPSLatitude' -p '$Directory/$FileName' -ext jpg -ext jpeg -ext png -ext webp -ext heic .
   ```

   The photos in `reference/photos/` were clean on 2026-11-24.

5. **Big files.** GitHub warns at 50 MB and refuses 100 MB. Nothing in the history is over 21 MB, and the whole history packs to about 220 MB, well within GitHub's guidance (under 1 GB). To check:

   ```sh
   git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectsize) %(rest)' \
     | awk '$1=="blob" && $2>20000000' | sort -k2 -n
   ```

6. **Read what will be public.** Things in the history that are fine but worth knowing:
   - Agent instructions (`CLAUDE.md`, `.claude/`) are git-ignored and were taken out of the history, and commit messages carry no Claude Code session links. Keep it that way: `site/agents.md` and `site/llms.txt` are the only agent files in the repository.
   - Pinwheel designs that were removed from the presets are still in old commits. Rewriting the history to remove them isn't worth the risk; they're not on the site.
   - Author emails are GitHub noreply addresses.

7. **Licenses.** Read [licensing.md](licensing.md) and settle the models license first. It's easy to change before outside models arrive and hard after.

8. **Make it public, and turn on the free protections:**

   ```sh
   gh repo edit ilslaoaycd/designwithcolorcubes --visibility public --accept-visibility-change-consequences
   gh repo edit ilslaoaycd/designwithcolorcubes \
     --description "Free 3D-printable Color Cubes, the 1930s designing toy: models, box designer and pattern designer" \
     --homepage https://designwithcolorcubes.org \
     --add-topic 3d-printing --add-topic toy --add-topic 3mf --add-topic pattern-design
   gh label create design --color F6CF4B --description "A pattern design or idea" --repo ilslaoaycd/designwithcolorcubes
   gh label create model --color 2563B8 --description "A model to add" --repo ilslaoaycd/designwithcolorcubes
   ```

   Then in the repository's Settings, under Security ("Advanced Security" on newer accounts): turn on secret scanning and push protection, and private vulnerability reporting. Under Branches, a rule for `main` that blocks force pushes is enough. Optionally install the DCO app (github.com/apps/dco) so pull requests without a sign-off are flagged.

9. **Afterwards:** remove the "The repository is opening up" paragraph (`<p class="opening">`) from `site/contribute/index.html` and its rule from `site/contribute/contribute.css`, and deploy.

## The resources repository

### What goes where

| Folder or release | What | From |
|---|---|---|
| `Replica Files/` | Isaac's working files, under the same name the build scripts read: the cube and case OBJs (`3d Models/`), the Bambu Studio project, the Fusion sources (`*.f3d`) and the cover artwork with its layers (`SVG/`). Each file under 50 MB. | a copy of `Replica Files/` |
| `step/` | A STEP export of each Fusion design, for people without Fusion | Fusion, File > Export |
| `scans/` | Full-size scans of the original set, if each file is under 50 MB; otherwise a release | the scans folder `tools/build_scans.py` reads |
| Release `image-packs-YYYY-MM` | The two image packs as zips: the original set and the 3D-printed set (see `docs/rendering.md`) | the folders `tools/build_assets.py` reads |
| Release `scans-YYYY-MM` | Full-size scans, if too big for the repository | |

What stays out: anything that is someone else's (the reference PDF, pictures from auctions or collectors, `docs/HANDOFF.md`), Fusion's cache and backup files, and anything with family members' faces or names unless Isaac means to share it.

Never strip, rename or tidy files inside `Replica Files/` itself. Copy first, then work on the copy.

### Commands

```sh
# 1. Create the repository and clone it next to the site
cd ~/code                                  # wherever designwithcolorcubes lives
gh repo create ilslaoaycd/color-cubes-resources --public \
  --description "Working files for Design with Color Cubes: Fusion sources, cover art, scans and image packs" \
  --homepage https://designwithcolorcubes.org --clone
cd color-cubes-resources

# 2. Copy the working files in (copies, never moves)
mkdir -p "Replica Files" step scans
cp -R "../designwithcolorcubes/Replica Files/." "Replica Files/"
# ... STEP exports into step/, the scans into scans/

# 3. Find what's too big for the repository: these go in a release instead
find . -path ./.git -prune -o -type f -size +50M -print

# 4. Strip photo metadata from the copies, and check
exiftool -all= -overwrite_original -r -ext jpg -ext jpeg -ext png -ext tif -ext tiff -ext heic .
exiftool -r -if '$GPSLatitude' -p '$Directory/$FileName' .     # should print nothing

# 5. Ignore the usual clutter
printf '.DS_Store\n*.f3d.bak\n__pycache__/\n*.tmp\n' > .gitignore

# 6. License files, the README (skeleton below), and the first commit
cp ../designwithcolorcubes/LICENSE-MODELS LICENSE      # or the license chosen in licensing.md
git add -A
git status                                  # read the list before committing
git commit -s -m "Working files for Design with Color Cubes"
git push -u origin main

# 7. The image packs as a release (zips made outside the repository)
cd ..
zip -r -X color-cubes-image-pack-original.zip "<original pack folder>" -x '*.DS_Store'
zip -r -X color-cubes-image-pack-printed.zip "<printed pack folder>" -x '*.DS_Store'
gh release create image-packs-2026-12 \
  color-cubes-image-pack-original.zip color-cubes-image-pack-printed.zip \
  --repo ilslaoaycd/color-cubes-resources \
  --title "Image packs, December 2026" \
  --notes "The two image packs the site's pictures are built from. Unzip each and pass the folders to tools/build_assets.py in designwithcolorcubes."
```

Run the metadata step on the zips' source folders too, or on copies of them, before zipping.

Then add a line to this repository's `README.md` (under "What's here" or "Commands") pointing at the resources repository, saying which release the build scripts expect.

### License files in the resources repository

- `LICENSE`: the models license chosen in [licensing.md](licensing.md), covering Isaac's own files.
- If the scans are marked public domain as that document recommends, a `scans/README.md` saying so, with the Public Domain Mark link (`https://creativecommons.org/publicdomain/mark/1.0/`).
- If any font or other third-party file is included, its own license beside it, as in this repository.

### README skeleton for the resources repository

````markdown
# Color Cubes resources

The working files behind [Design with Color Cubes](https://designwithcolorcubes.org), a free 3D-printable replica of Color Cubes, the 1930s designing toy. The website, the generators and the ready-to-print files are in [designwithcolorcubes](https://github.com/ilslaoaycd/designwithcolorcubes).

Use these if you want to change the models at the source, render your own pictures, or rebuild the site's files.

## What's here

| Folder | What it is |
|---|---|
| `Replica Files/` | The working files the build scripts in designwithcolorcubes read: the cube and case models, the slicer project, the Fusion sources and the lid cover artwork with its layers |
| `step/` | STEP exports of the Fusion designs, for other CAD programs |
| `scans/` | Scans of an original 1930s set |

The image packs (the original set and the 3D-printed set) are too big for the repository. Download them from [Releases](https://github.com/ilslaoaycd/color-cubes-resources/releases).

## Rebuilding the site's files

Clone both repositories side by side, then from `designwithcolorcubes`:

```sh
ln -s "../color-cubes-resources/Replica Files" "Replica Files"   # the scripts read it from here
python tools/build_models.py
node tools/build_print_files.mjs
python tools/build_assets.py <original pack> --printed <printed pack>
```

The README in designwithcolorcubes lists every build script and what it needs.

## Contributing

Remixes and new models are welcome. They go in `community/models/` in designwithcolorcubes, not here; see its [Contribute page](https://designwithcolorcubes.org/contribute/) and CONTRIBUTING.md. Open an issue here for problems with these files.

## License

Isaac Lloyd's models, artwork and photos are under <the chosen license>; see LICENSE. The scans of the original set are faithful copies of a public-domain work and carry no new rights. Credit "Isaac Lloyd, designwithcolorcubes.org" when you use them.

Color Cubes were made around 1930 by the Embossing Company of Albany, New York. This project isn't affiliated with the Embossing Company, Halsam, Playskool, Hasbro or any current maker of Color Cubes.
````
