"""Build the Files page (/downloads/): every download on its own, with a thumbnail.

    python tools/build_downloads.py             # thumbnails, site/data/downloads.json, the page's lists
    python tools/build_downloads.py --unpack    # first unpack the old picture zips into folders

Sources, all under site/:
  files/ (via data/files.json)   the print files (tools/build_print_files.mjs)
  downloads/patterns/            the pattern sheets and every design (tools/build_patterns.mjs)
  downloads/{kit}/               the picture kits, one folder each (tools/build_assets.py on Isaac's
                                 machine; --unpack made them from the zips once)
  downloads/scans/               scans of the original set (tools/build_scans.py)
  downloads/lid/                 the original 1930s lid redrawn as SVG, finished and first Inkscape version (added by hand)

Writes site/downloads/thumbs/*.webp (metadata stripped), site/data/downloads.json, and the lists
between the "files" markers in site/downloads/index.html. Open groups are plain HTML; folded
groups (<details>) keep theirs in a <template>, which files.js puts in place when the group is
first opened, so the page doesn't carry thousands of hidden elements.
Each section's Download all zips its files in the browser (site/downloads/files.js). Pinwheel
scenes stay out (a design that only turns can read as a swastika). Needs Pillow.
"""

import hashlib
import html
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
DL = SITE / "downloads"
THUMBS = DL / "thumbs"
PAGE = DL / "index.html"
THUMB_PX = 240

# The picture zips the site used to serve, and the folder each becomes.
KITS = {
    "color-cubes-printed-kit.zip": "printed-kit",
    "color-cubes-printed-scenes.zip": "printed-scenes",
    "color-cubes-renders.zip": "renders",
    "color-cubes-image-kit.zip": "image-kit",
    "color-cubes-scanned-scenes.zip": "scanned-scenes",
    "color-cubes-scans.zip": "scans",
}
SKIP_NAMES = {"LICENSE.txt", "README.md", "README.txt", "patterns.json"}


def skipped(name):
    return Path(name).name in SKIP_NAMES or "pinwheel" in name.lower()


def unpack():
    for zname, folder in KITS.items():
        zpath = DL / zname
        if not zpath.exists():
            continue
        out = DL / folder
        n = 0
        with zipfile.ZipFile(zpath) as z:
            for info in z.infolist():
                if info.is_dir() or skipped(info.filename):
                    continue
                dest = out / info.filename
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(z.read(info))
                n += 1
        zpath.unlink()
        print(f"{zname} -> site/downloads/{folder}/ ({n} files)")


# ---------------------------------------------------------------------------------------------
# Thumbnails

KIND_THUMBS = {  # files that aren't pictures show a rendered stand-in (tools/render_scenes.py)
    "cube": "/img/art/thumb-cube.webp",
    "cube-original": "/img/art/thumb-cube-original.webp",
    "plate": "/img/art/thumb-plate.webp",
    "tray": "/img/art/thumb-tray.webp",
    "lid": "/downloads/thumbs/lid.webp",
    "doc": None,
}


def thumb(src: Path):
    """A webp thumbnail of a picture, cached by path and size; returns its URL."""
    # Forward slashes, so the key (and the file name) is the same on Windows as elsewhere.
    key = hashlib.sha1(f"{src.relative_to(SITE).as_posix()}:{src.stat().st_size}".encode()).hexdigest()[:14]
    out = THUMBS / f"{key}.webp"
    if not out.exists():
        im = Image.open(src)
        im.seek(0)
        im = im.convert("RGBA")
        im.thumbnail((THUMB_PX, THUMB_PX), Image.LANCZOS)
        im.save(out, "WEBP", quality=78, method=6)
    return "/" + out.relative_to(SITE).as_posix()


def entry(path: Path, name=None, kind=None):
    url = "/" + path.relative_to(SITE).as_posix()
    ext = path.suffix.lower()
    if ext in (".png", ".jpg", ".jpeg", ".webp"):
        th = thumb(path)
    elif ext == ".svg":
        th = url
    elif ext == ".mp4":
        th = thumb(path.with_suffix(".webp")) if path.with_suffix(".webp").exists() else None
    else:
        th = KIND_THUMBS.get(kind)
    return {"path": url, "name": name or path.name, "bytes": path.stat().st_size, "thumb": th}


def folder(rel, kind=None, pattern="*"):
    d = DL / rel
    return [entry(p, kind=kind) for p in sorted(d.glob(pattern)) if p.is_file() and not skipped(p.name)]


# ---------------------------------------------------------------------------------------------
# Sections

def print_section():
    files = json.loads((SITE / "data" / "files.json").read_text(encoding="utf-8"))["files"]
    by = {}
    for f in files:
        by.setdefault(f["kind"], []).append(f)

    def rows(kinds, thumb_kind=None):
        out = []
        for k in kinds:
            for f in by.get(k, []):
                p = SITE / f["path"].lstrip("/")
                th = thumb_kind or {"cube": "cube", "plate-original": "plate", "plate": "plate", "tray": "tray", "tray-n": "tray", "lid": "lid", "obj": "cube"}.get(k)
                if k == "obj" and "tray" in p.name: th = "tray"
                if k == "obj" and "lid" in p.name: th = "lid"
                if "/lid-7x7/" in f["path"]: th = "lid"
                if "/tray-7x7/" in f["path"]: th = "tray"
                out.append(entry(p, kind=th))
        return out

    return {
        "id": "print", "title": "Print files",
        "intro": "<p>For a set of your own size and box, start from <a href=\"/#print\">Print a set</a>: choose how many cubes, design the box, then pick your filament colors and download everything made for it. These are the ready-made files: the 7 × 7 set as it was first printed, a tray and a plate of cubes for every square size, and the sources.</p>",
        "groups": [
            {"title": "The 7 × 7 set, 3MF", "files": [e for e in rows(["cube", "plate-original", "tray", "lid"]) if e["path"].endswith(".3mf")]},
            {"title": "The 7 × 7 set, STL (one file per color)", "files": [e for e in rows(["cube", "tray", "lid"]) if e["path"].endswith(".stl")]},
            {"title": "The 7 × 7 set, OBJ", "files": rows(["obj"])},
            {"title": "Trays for every square size", "files": rows(["tray-n"])},
            {"title": "Plates of cubes for every square size", "files": rows(["plate"])},
            {"title": "Slicer project and Fusion 360 sources", "files": rows(["project"], "plate") + rows(["source"], "cube")},
            {"title": "Read me and license", "files": rows(["doc"], "doc")},
        ],
    }


def patterns_section():
    data = json.loads((SITE / "data" / "patterns.json").read_text(encoding="utf-8"))
    names = {d["id"]: d for d in data["lid"] + data["presets"]}
    designs = sorted((DL / "patterns" / "designs").glob("*.svg"))
    by_size = {}
    for p in designs:
        d = names.get(p.stem)
        size = f"{d['w']} × {d['h']}" if d else "Other"
        e = entry(p, name=(d["name"] if d else p.stem) + ".svg")
        by_size.setdefault((d["w"] * 100 + d["h"]) if d else 9999, (size, []))[1].append(e)
    # The finished lid (a copy of artwork/lid/lid-7x7-cover.svg) first, then the first version from Inkscape.
    lid = [entry(DL / "lid" / n) for n in ("original-lid.svg", "original-lid-first-inkscape-version.svg")]
    groups = [{"title": "The original lid, redrawn (SVG): finished, and the first version from Inkscape", "files": lid},
              {"title": "Pattern sheets to print (A4 or US Letter)", "files": folder("patterns", pattern="*.svg")}]
    for _, (size, files) in sorted(by_size.items()):
        groups.append({"title": f"Every {size} design", "files": files, "fold": True})
    return {"id": "patterns", "title": "Patterns", "groups": groups,
            "intro": "<p>The sheets have the twelve designs from the 1930s lid and then every design by tray size, each with its code underneath; type a code into the <a href=\"/designer/\">designer</a> to open it. Every design is here on its own too, drawn to the measurements of an original cube.</p>"}


def pictures_sections():
    return [
        {"id": "renders", "title": "3D renders",
         "intro": "<p>Trays, heaps, stacks and rows of cubes rendered from the two 3D models, on transparent backgrounds.</p>",
         "groups": [
             {"title": "3D-printed cubes", "files": folder("printed-kit/3d-printed")},
             {"title": "Original cubes", "files": folder("renders/renders/scanned")},
             {"title": "Flat colors", "files": folder("renders/renders/flat")},
         ]},
        {"id": "scenes", "title": "Scenes made from faces",
         "intro": "<p>Patterns, scatters and banner strips laid out from photographed faces, flat and seen from above, on clear and on black. The same scenes come in the printed cubes, the original cubes and flat vector colors.</p>",
         "groups": [
             {"title": "Printed: patterns", "files": folder("printed-scenes/2d-printed/patterns"), "fold": True},
             {"title": "Printed: scatters", "files": folder("printed-scenes/2d-printed/scatters"), "fold": True},
             {"title": "Printed: banner strips", "files": folder("printed-scenes/2d-printed/spills-horizontal"), "fold": True},
             {"title": "Original: patterns", "files": folder("scanned-scenes/2d-scan/patterns"), "fold": True},
             {"title": "Original: scatters", "files": folder("scanned-scenes/2d-scan/scatters"), "fold": True},
             {"title": "Original: banner strips", "files": folder("scanned-scenes/2d-scan/spills-horizontal"), "fold": True},
             {"title": "Vector: patterns", "files": folder("image-kit/2d-vector/patterns"), "fold": True},
             {"title": "Vector: scatters", "files": folder("image-kit/2d-vector/scatters"), "fold": True},
             {"title": "Vector: banner strips", "files": folder("image-kit/2d-vector/spills-horizontal"), "fold": True},
         ]},
        {"id": "faces", "title": "Cube faces",
         "intro": "<p>Single faces to build your own pictures: one for each of the twelve looks a cube can show, in the printed and the original finish and as flat vectors, plus every face cut from the scans.</p>",
         "groups": [
             {"title": "Printed, one per look", "files": folder("printed-kit/faces-printed/by-code")},
             {"title": "Original, one per look", "files": folder("image-kit/faces/scan-by-code")},
             {"title": "Vector, one per look (SVG and PNG)", "files": folder("image-kit/faces/vector")},
             {"title": "Printed, every look in all four turns", "files": folder("printed-scenes/faces-printed/generated"), "fold": True},
             {"title": "Printed, cut from scans", "files": folder("printed-scenes/faces-printed/scan-cuts"), "fold": True},
             {"title": "Original, every face cut from the scans", "files": folder("image-kit/faces/all"), "fold": True},
             {"title": "Contact sheets and crop data", "files": folder("image-kit/faces") + folder("printed-kit/faces-printed")},
         ]},
        {"id": "models", "title": "The 3D cube",
         "intro": "<p>The cube as GLB and OBJ in three finishes, with its textures, and the printing animation.</p>",
         "groups": [
             {"title": "3D-printed finish", "files": folder("printed-kit/model", "cube") + folder("printed-kit/model/textures-printed")},
             {"title": "Original and flat finishes", "files": folder("image-kit/model", "cube-original") + folder("image-kit/model/textures-scan") + folder("image-kit/model/textures-flat")},
             {"title": "Printing animation", "files": folder("printed-kit/print-player")},
         ]},
        {"id": "scans", "title": "Scans of the original set",
         "intro": "<p>The lids and loose cubes at 300 dpi, every loose cube cut out of them, and the toy’s <a href=\"/history/\">history</a> as notes in Markdown.</p>",
         "groups": [
             {"title": "Lids and cubes", "files": folder("scans", pattern="*.jpg")},
             {"title": "Every loose cube", "files": folder("scans/cubes"), "fold": True},
             {"title": "History", "files": [entry(SITE / "history" / "color-cubes-history.md")]},
         ]},
    ]


# ---------------------------------------------------------------------------------------------
# The page

def size(n):
    return f"{n / 1e6:.1f} MB" if n >= 1e6 else f"{max(1, round(n / 1e3))} KB"


def count(n):
    return f"{n} file" if n == 1 else f"{n} files"


def render(sections):
    esc = html.escape
    out = []
    for s in sections:
        files = [f for g in s["groups"] for f in g["files"]]
        total = sum(f["bytes"] for f in files)
        out.append(f'  <section class="files-section" id="{s["id"]}" aria-labelledby="{s["id"]}-h">')
        out.append(f'    <div class="files-head"><h2 id="{s["id"]}-h">{esc(s["title"])}</h2>'
                   f'<button class="btn" type="button" data-all="{s["id"]}">Download all <span>{count(len(files))}, {size(total)}</span></button></div>')
        out.append("    " + s["intro"])
        for g in s["groups"]:
            if not g["files"]:
                continue
            gs = sum(f["bytes"] for f in g["files"])
            head = f'{esc(g["title"])} <span>{count(len(g["files"]))}, {size(gs)}</span>'
            items = []
            for f in g["files"]:
                img = (f'<img src="{esc(f["thumb"])}" alt="" loading="lazy" decoding="async" width="56" height="56">'
                       if f["thumb"] else '<span class="ph" aria-hidden="true"></span>')
                items.append(f'<li><a href="{esc(f["path"])}" download>{img}<span class="fname" title="{esc(f["name"])}">{esc(f["name"])}</span>'
                             # Spaces between the spans (the grid ignores them) keep the link's text from running together.
                             f' <span class="fsize">{size(f["bytes"])}</span> <span class="get">Download</span></a></li>')
            body = '<ul class="file-grid">' + "".join(items) + "</ul>"
            if g.get("fold"):
                out.append(f'    <details><summary>{head}</summary><noscript><p class="note">This list needs JavaScript.</p></noscript><template>{body}</template></details>')
            else:
                out.append(f"    <h3>{head}</h3>{body}")
        out.append("  </section>")
    return "\n".join(out)


def main():
    if "--unpack" in sys.argv:
        unpack()
    THUMBS.mkdir(parents=True, exist_ok=True)
    lid = THUMBS / "lid.webp"
    if not lid.exists():
        im = Image.open(SITE / "img" / "printed-lid.jpg").convert("RGB")
        im.thumbnail((THUMB_PX, THUMB_PX), Image.LANCZOS)
        im.save(lid, "WEBP", quality=80, method=6)
    sections = [print_section(), patterns_section(), *pictures_sections()]
    used = {Path(f["thumb"]).name for s in sections for g in s["groups"] for f in g["files"] if f["thumb"] and f["thumb"].startswith("/downloads/thumbs/")}
    for old in THUMBS.glob("*.webp"):
        if old.name not in used:
            old.unlink()
    (SITE / "data" / "downloads.json").write_text(json.dumps({"sections": [
        {"id": s["id"], "title": s["title"], "files": [{k: f[k] for k in ("path", "name", "bytes")} for g in s["groups"] for f in g["files"]]}
        for s in sections]}, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    page = PAGE.read_text(encoding="utf-8")
    a, b = "<!-- files: built by tools/build_downloads.py -->", "<!-- /files -->"
    i, j = page.index(a) + len(a), page.index(b)
    PAGE.write_text(page[:i] + "\n" + render(sections) + "\n  " + page[j:], encoding="utf-8", newline="\n")
    n = sum(len(g["files"]) for s in sections for g in s["groups"])
    print(f"site/downloads/index.html: {len(sections)} sections, {n} files; {len(used)} thumbnails")


if __name__ == "__main__":
    main()
