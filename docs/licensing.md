# Which licenses to use

Isaac asked: "We should analyze what licence to use after all of this work." This is that analysis, written before the repository opens to outside contributions, because that's the last point where changing the licenses is easy.

**Decided (2026-11-25):** Isaac chose the most open Creative Commons license that still requires credit: **CC BY 4.0** for the models, artwork, renders, photos and scans, commercial use allowed with attribution. Code stays **MIT**. Every file listed at the end has been changed; community models may still choose CC0. The analysis below is kept as it was written. This is a careful reading of how the licenses work, not legal advice; if money or a dispute ever comes into it, ask a lawyer.

## Where things stand

| What | License now | File |
|---|---|---|
| Code: `site/js`, `site/designer`, `site/css`, `workers`, `tools`, `test` | MIT | `LICENSE` |
| Models, artwork, renders, photos and scans: `models/`, `artwork/`, `site/img/`, `site/models/`, `site/downloads/`, `reference/photos/` | CC BY 4.0 (was CC BY-NC-SA 4.0) | `LICENSE-MODELS` |
| Third-party: qrcode-generator, three.js, Rubik | MIT, MIT, SIL OFL | beside each |

The README sums up the models license as "Print them, give them away and remix them with credit to Isaac Lloyd. Don't sell them." That's an accurate reading of BY-NC-SA.

## The original toy is in the public domain

Color Cubes were made by the Embossing Company of Albany, New York, and surviving sets date mostly to around 1930.

- **Copyright, in the US.** A work published in 1930 was protected for 95 years, which ran out at the end of 2025: it entered the public domain on 1 January 2026. A work published from 1931 to 1963 is in the public domain unless its copyright was registered with a notice and renewed in its 28th year; most weren't. Anything published before 1978 without a copyright notice lost protection on publication, and toy boxes of the period often had none. So the cube, the lid artwork and the twelve lid designs are almost certainly free for anyone to use, whatever the exact year.
- **Copyright, elsewhere.** In the UK and the EU, a company's work with no named author is generally protected for 70 years from publication, which for a 1930s toy ran out decades ago. The details differ by country, but nothing points to a live right.
- **Patents.** A design patent lasted at most 14 years and a utility patent 17. Any patent on the toy expired long ago. We don't know of one ever having existed.
- **The one thing worth checking.** If Isaac wants to be thorough, search the Catalog of Copyright Entries (scanned on archive.org) for renewals naming "Embossing Company" or "Color Cubes" in the late 1950s and early 1960s. Finding nothing confirms the above.

The site already says this plainly in the footer ("old enough to belong to everyone now"). That's the right tone.

## The name is a separate question

Copyright and patents expire; a trademark lasts as long as someone uses it to sell goods. "Color Cubes" is a different question from the toy's design.

- We don't know of a current trademark on "Color Cubes" for toys. The phrase is also fairly descriptive (cubes that are colored), which makes it a weak mark for anyone to hold.
- The project uses the name to say what the replica is a replica of, gives everything away, and says it isn't affiliated with the Embossing Company, Halsam, Playskool, Hasbro or any current maker. That's descriptive, non-commercial use, which trademark law generally allows.
- Sensible, low-effort steps: search the USPTO trademark database (class 28, toys and games) for "COLOR CUBES" once and note the result here; keep the "not affiliated" line on the site and in the READMEs; don't use any current maker's logo or packaging. If a trademark holder ever writes, the domain names would be the thing to talk about, not the models.

None of this needs to worry anyone. It's worth one search and a note.

## What Isaac's copyright actually covers

The public-domain original matters for the licenses, because a license can only control what's protected in the first place.

- **Strong:** photos and renders of the printed set (lighting, framing, choices), the hero corners and scenes, new pattern designs and lid layouts that are Isaac's own, the box designer's and pattern designer's code, the written guides, and the Fusion sources as design files.
- **Thin:** the cube model, the tray and the lid as faithful copies of the 1930s originals. In the US, *Meshwerks v. Toyota* (10th Cir. 2008) held that a digital model that faithfully copies a real object isn't original enough for copyright. The new parts (the split for multicolor printing, tolerances, the art layer under a white plate) carry some originality, but not much.
- **Probably none:** the 300 dpi scans of the original set and lid. A faithful reproduction of a public-domain flat work isn't a new work in the US (*Bridgeman v. Corel*, 1999) or in the EU (Article 14 of the 2019 copyright directive).
- **Not Isaac's:** the 1930s lettering and lid art (public domain) and Rubik (OFL; outlines of its letters inside a model are fine).

Two consequences:

1. Anyone can model a Color Cube from scratch, or from an original set, and sell it. No license on these files can stop that.
2. The box designer, under MIT, can produce the 7×7 lid and tray that `models/` offers under BY-NC-SA. So the "non-commercial" condition on those files is closer to a request than a fence.

That isn't an argument against having a license. It's an argument for picking one whose terms match what's actually protected.

On AI help: much of the code was written with Claude. The US Copyright Office's view (its 2025 report) is that material produced by AI without enough human control isn't protected, while human choices, selection and arrangement are. That doesn't change any recommendation here: the MIT license still applies to whatever is protected, and the rest is free anyway.

## Code: keep MIT

MIT suits code that's meant to be reused: the tray code format, the STL and 3MF writers, the PDF writer, the face geometry. It's short, everyone understands it, and every platform accepts it. A copyleft license (GPL) would only matter if someone took the code into a closed product, and the code's main value is to this project. No change needed.

## Models, artwork and photos: the options

All four options below are offered by MakerWorld, Printables and Thingiverse, so none of them blocks a listing.

### CC BY-NC-SA 4.0 (now)

Credit required; no commercial use; remixes under the same license.

- **For:** it says what Isaac said he wants ("don't sell them"). It's the most common license on 3D printing sites, so remixers know it.
- **Against:**
  - "Non-commercial" is fuzzy. Creative Commons defines it as "not primarily intended for or directed towards commercial advantage or monetary compensation." Unclear cases come up all the time with a toy like this: selling a printed set at a craft fair to cover filament; printing sets for a school that pays for materials; a makerspace that charges for machine time; a YouTube video about printing it, with ads; a remix on a site that pays designers points or cash for downloads. People who want to do the right thing don't know whether they're allowed.
  - Print-on-demand services, print farms and Etsy sellers can't touch it, so someone without a printer can't easily get a set made. For a family toy that's meant to spread, that's the biggest cost.
  - It's not a free-culture license. Wikipedia and Wikimedia Commons won't take NC material, and the Open Source Hardware Association won't certify an NC design.
  - Share-alike remixes under BY-NC-SA can't be combined with BY-SA material, and vice versa.
  - As above, the NC condition is weak for the faithful-copy files.

### CC BY-SA 4.0

Credit required; commercial use allowed; remixes under the same license.

- **For:** no grey zone; anyone can print and sell sets, as long as they credit Isaac and keep the license with any changed files. Remixes stay open. It's the license Wikipedia uses, so the photos and drawings could illustrate an article about the toy. OSHWA-compatible. It matches what's actually protectable.
- **Against:** someone can sell sets printed from these files on Etsy or Amazon, with credit. Isaac may not like that. They could do it without his files, though.

### CC BY 4.0

Credit required; anything else allowed, including closed remixes.

- **For:** the simplest license that still keeps Isaac's name on the work. Remixes can be relicensed, which suits a project that wants the most reuse.
- **Against:** a company could improve the models and keep the improvements closed. For a hobby project that's a small risk, but share-alike costs nothing to add.

### CC0 (public domain dedication)

No conditions at all.

- **For:** matches the public-domain original. The cleanest choice for the scans.
- **Against:** no requirement to credit Isaac. Most of the point of a family project like this is the story behind it, and credit carries the story.

### Comparison

| | Sell printed sets | Remix | Remix stays open | Credit required | Wikipedia / OSHWA |
|---|---|---|---|---|---|
| BY-NC-SA 4.0 | No | Yes | Yes | Yes | No |
| BY-SA 4.0 | Yes | Yes | Yes | Yes | Yes |
| BY 4.0 | Yes | Yes | No | Yes | Yes |
| CC0 | Yes | Yes | No | No | Yes |

## Contributions

The project should take contributions under the same license it gives them out under ("inbound = outbound"), confirmed by the Developer Certificate of Origin: a `Signed-off-by:` line on each commit (`git commit -s`), and a checkbox on the issue forms for people who don't use Git. This is what `CONTRIBUTING.md` and the forms now say. It's light, it's what most open projects do, and it asks contributors for nothing they don't already understand.

The catch: once outside models are merged under a license, Isaac can't change that license for those files without asking each contributor. So:

- **Decide before merging the first outside model.** Changing Isaac's own files later is easy (he owns them; earlier copies stay under the old license, which is fine). Changing everyone's is not.
- **If Isaac wants room to change his mind later**, ask contributors for CC BY 4.0 as the inbound license whatever the outbound one is. BY lets the project relicense the contribution under BY-SA or BY-NC-SA later, with credit. The model form already offers CC BY 4.0 and CC0 as choices.
- A contributor license agreement (assigning rights to Isaac) isn't worth it for a project this size; it puts people off.

Pattern designs sent as tray codes are mostly too simple to be protected at all. Treat them as ideas: credit the person in the commit and, if they like, by name. The form's checkbox covers the rest.

## Recommendation

1. **Code: keep MIT.** No change.
2. **Models, artwork, renders and photos: move to CC BY-SA 4.0.** It keeps Isaac's name on everything and keeps remixes open, and it drops the one condition that's both fuzzy and weak here. It lets people without printers get a set made, and it lets the pictures go on Wikipedia. Do it before the repository opens and before any outside model is merged.
3. **Scans of the original set and lid: mark them with the Public Domain Mark 1.0** rather than a CC license. They're faithful copies of a public-domain work, so there's nothing to license, and saying so is honest. Keep asking for credit as a courtesy ("scanned by Isaac Lloyd").
4. **Community models: inbound = outbound with DCO sign-off**, and accept CC BY 4.0 or CC0 as alternatives.
5. **The name: one USPTO search, noted here**, and keep the "not affiliated" line.

If keeping sets from being sold matters more to Isaac than all of the above, keeping CC BY-NC-SA 4.0 is a legitimate choice. In that case, add a short note to `LICENSE-MODELS` and the site giving an explicit extra permission, so the grey cases stop being grey. Something like: "As an extra permission, you may sell sets you printed yourself, in small numbers, to cover your costs, with credit." Creative Commons licenses allow a licensor to add permissions like this. Still do 3, 4 and 5.

## Files to change if Isaac agrees

Moving models, artwork and photos to CC BY-SA 4.0 (`https://creativecommons.org/licenses/by-sa/4.0/`):

- **License texts:** `LICENSE-MODELS` (replace with the CC BY-SA 4.0 legal code), `models/LICENSE.txt` and `site/files/LICENSE.txt`.
- **Build scripts that write the license** into files, zips and metadata: `tools/build_models.py`, `tools/build_print_files.mjs` (copies `models/`), `tools/build_artwork.py`, `tools/build_patterns.mjs`, `tools/build_scans.py`, `tools/build_assets.py`. Then rebuild on Isaac's machine so `models/`, `artwork/`, `site/files/`, `site/downloads/` (every zip's `LICENSE.txt` and README), the OBJ/MTL headers and the pattern sheet SVGs pick it up.
- **Code that writes the license into what people download:** `site/js/print3d.js` (3MF metadata) and `site/designer/pdf.js` (the PDF).
- **SVGs with a license line:** `site/img/lid.svg`, `site/img/wordmark.svg`, and the `artwork/lid/` and `artwork/patterns/sheets/` SVGs (rebuilt by the scripts above).
- **Read-me text:** `README.md` (Licenses section: also drop "Don't sell them"), `models/README.txt` and `site/files/README.txt` (LICENSE section), `CONTRIBUTING.md`, `community/README.md`.
- **Pages:** the footer line, the JSON-LD `license` field and any license text in the page body of `site/index.html` (including the line under the print photos), `site/patterns/index.html`, `site/box/index.html` and `site/contribute/index.html`, and of any other page that has the shared footer by then. `site/agents.md` (Licenses and credit; it currently says "not sell them or things made from them").
- **GitHub forms:** `.github/ISSUE_TEMPLATE/design_idea.yml`, `.github/ISSUE_TEMPLATE/model_submission.yml`, `.github/pull_request_template.md`.
- **Elsewhere:** the license setting on the MakerWorld and Thingiverse listings.

For the scans (Public Domain Mark): only the scans of the original set and lid (`artwork/scans/original-*.jpg`, `artwork/scans/cubes/` and the original faces in `site/img/faces/`), not photos of the printed set such as `printed-lid.jpg`. Change the scans zip's `LICENSE.txt` and README (written by `tools/build_scans.py`), the line about scans in `README.md`, and any credit line for the scans on the home page.

Find any that were missed with:

```sh
grep -rlI --exclude-dir=node_modules --exclude-dir=.git -i "by-nc-sa" .
```
