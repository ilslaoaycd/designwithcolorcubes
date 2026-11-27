"""Prepare the Color Cubes image and model pack for the website, the repo and the downloads.

The packs (renders, scanned faces, vector scenes and the 3D cube) are too big to keep in the
repository whole. There are two: the main pack (an original 1930s set, plus flat colors) and the
printed pack (Isaac's 3D-printed cubes, with newer copies of the model, README and tools). Unzip
each somewhere and pass the folders that hold their README.md:

    python tools/build_assets.py "C:/path/to/color-cubes-assets" --printed "C:/path/to/printed/color-cubes-assets"

It writes:

  site/img/art/*.webp          renders and scenes used on the pages, resized, metadata stripped
  site/img/faces/{code}.webp   one scanned face per tray code, for the landing page
  site/img/faces/atlas*.webp   all twelve scanned faces in one texture, for the designer's "Original" style
  site/img/faces/printed/      the same for the 3D-printed cubes: one face per code and the atlas
  site/models/*.glb            the 3D cube, original, printed and flat, for the 3D viewers
  artwork/assets/              the small sources: vector faces and scenes, the model, the tools
  site/downloads/renders/         every 3D render, full size
  site/downloads/image-kit/       scanned and vector faces, vector scenes, the 3D cube
  site/downloads/scanned-scenes/  patterns, scatters and spills made from scanned faces
  site/downloads/printed-kit/     3D-printed: renders, faces, the printed cube, the print animation
  site/downloads/printed-scenes/  patterns, scatters and spills made from printed faces
  (one file each, for the Files page: run tools/build_downloads.py afterwards)

Needs Python 3 with Pillow.
"""

import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "site" / "img" / "art"
FACES = ROOT / "site" / "img" / "faces"
MODELS = ROOT / "site" / "models"
KEEP = ROOT / "artwork" / "assets"
DL = ROOT / "site" / "downloads"

# (pack, source in the pack, name on the site, widths). The first width is the default src.
# "main" is the original-set pack, "printed" the 3D-printed one. Printed cubes lead on the pages;
# the original set appears where the page is about its history.
WEB = [
    ("printed", "3d-printed/spill-horizontal-3d.png", "spill-printed-low", [2600, 1300]),
    ("printed", "3d-printed/spill-horizontal-3d-high.png", "spill-printed", [2200, 1100]),
    ("printed", "3d-printed/dump-49-cubes-3d.png", "dump-printed", [1600, 900]),
    ("printed", "3d-printed/tray-quadrants-7x7-3d.png", "tray-printed", [1400, 760]),
    ("printed", "3d-printed/twelve-looks-row-3d.png", "twelve-looks", [2000, 1000]),
    ("printed", "3d-printed/tray-pinwheels-6x6-3d.png", "tray-pinwheels", [1000, 600]),
    ("printed", "3d-printed/diamond-blocks-3d.png", "blocks-printed", [1200, 700]),
    ("printed", "2d-printed/scatters/assembled-blocks-and-loose-cubes.png", "blocks-printed-scan", [1300, 700]),
    ("printed", "2d-printed/scatters/half-built-quadrants-7x7.png", "half-built-printed", [1600, 800]),
    ("main", "3d-scan/tray-concentric-diamond-9x9-3d.png", "tray-original", [1200, 700]),
    ("printed", "2d-printed/spills-horizontal/spill-horizontal-2400x320.png", "spill-printed-flat", [2400, 1200]),
]
MAX_ZIP = 25 * 1024 * 1024  # the largest static file Cloudflare Workers will serve
CODES = ["w", "r", "y", "b", "1", "2", "3", "4", "5", "6", "7", "8"]



def trim(img):
    """Crop the transparent margin, keeping a little room for soft shadows."""
    box = img.getchannel("A").point(lambda a: 255 if a > 6 else 0).getbbox()
    if not box:
        return img
    pad = 8
    l, t, r, b = box
    return img.crop((max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad)))


def webp(img, path, width, quality=84):
    img = img.copy()
    if img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Saving through Pillow without exif= or icc_profile= writes no metadata.
    img.save(path, "WEBP", quality=quality, method=6)
    return img.size


# The kits are served one file each on the Files page (tools/build_downloads.py lists them and
# its Download all zips a section in the browser). The zip names are kept as the kits' names.
KIT_FOLDERS = {
    "color-cubes-printed-kit.zip": "printed-kit", "color-cubes-printed-scenes.zip": "printed-scenes",
    "color-cubes-renders.zip": "renders", "color-cubes-image-kit.zip": "image-kit",
    "color-cubes-scanned-scenes.zip": "scanned-scenes",
}


def zip_dir(zpath, entries):
    """entries: list of (path on disk, name in the kit). Copies them into site/downloads/{kit}/,
    leaving out read-mes, patterns.json (the site has its own) and pinwheel scenes."""
    out = DL / KIT_FOLDERS[zpath.name]
    if out.exists():
        shutil.rmtree(out)
    n = 0
    for src, name in entries:
        if Path(name).name in ("README.md", "README.txt", "LICENSE.txt", "patterns.json") or "pinwheel" in name.lower():
            continue
        d = out / name
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, d)
        n += 1
    print("%s/ (%d files)" % (out.relative_to(ROOT), n))
    big = [p for p in out.rglob("*") if p.is_file() and p.stat().st_size > MAX_ZIP]
    if big:
        sys.exit("%s is over 25 MiB, too big to serve" % big[0])


def make_atlas(faces_dir, out_dir):
    """All twelve scanned faces in one texture for the designer, 4 across and 3 down in code order.
    Each face keeps a little transparent padding so neighbours never bleed in when drawn small."""
    for name, face, cell in (("atlas.webp", 240, 244), ("atlas-96.webp", 96, 100)):
        atlas = Image.new("RGBA", (4 * cell, 3 * cell), (0, 0, 0, 0))
        pad = (cell - face) // 2
        for i, c in enumerate(CODES):
            img = Image.open(faces_dir / (c + ".png")).convert("RGBA")
            if img.size != (face, face):
                img = img.resize((face, face), Image.LANCZOS)
            atlas.alpha_composite(img, ((i % 4) * cell + pad, (i // 4) * cell + pad))
        out_dir.mkdir(parents=True, exist_ok=True)
        atlas.save(out_dir / name, "WEBP", quality=84, method=6)
        print("%s %s" % ((out_dir / name).relative_to(ROOT).as_posix(), atlas.size))


# The hero corners and the other rounded renders come from the 3D cube models by tools/render_scenes.py.


def slim_glb(src, dst, max_width=1536):
    """Copy a GLB, shrinking its JPEG/PNG textures to at most max_width wide (the printed cube's
    3072 x 2048 atlases are 1024 px a face; 512 is plenty on a web page). Geometry is untouched."""
    import io
    import json
    import struct
    data = src.read_bytes()
    jlen = struct.unpack("<I", data[12:16])[0]
    gltf = json.loads(data[20:20 + jlen])
    blen = struct.unpack("<I", data[20 + jlen:24 + jlen])[0]
    binary = data[28 + jlen:28 + jlen + blen]
    views = gltf["bufferViews"]
    image_views = {im["bufferView"]: im for im in gltf.get("images", []) if "bufferView" in im}
    out = bytearray()
    for i, v in enumerate(views):
        chunk = binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
        if i in image_views:
            img = Image.open(io.BytesIO(chunk))
            if img.width > max_width:
                img = img.resize((max_width, round(img.height * max_width / img.width)), Image.LANCZOS)
            buf = io.BytesIO()
            if image_views[i].get("mimeType") == "image/png":
                img.save(buf, "PNG", optimize=True)
            else:
                img.convert("RGB").save(buf, "JPEG", quality=88, optimize=True)
            chunk = buf.getvalue()
        while len(out) % 4:
            out.append(0)
        v["byteOffset"] = len(out)
        v["byteLength"] = len(chunk)
        out += chunk
    while len(out) % 4:
        out.append(0)
    gltf["buffers"][0]["byteLength"] = len(out)
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(out)
    dst.write_bytes(struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<I", len(js)) + b"JSON" + js
                    + struct.pack("<I", len(out)) + b"BIN\x00" + bytes(out))
    print("%s %d KB (from %d KB)" % (dst.relative_to(ROOT).as_posix(), dst.stat().st_size // 1024, len(data) // 1024))


def make_og():
    """The link preview: the heap of printed cubes beside the name, on navy."""
    from PIL import ImageDraw, ImageFont
    W, H = 1200, 630
    og = Image.new("RGBA", (W, H), "#1E2A5A")
    art = Image.open(ART / "dump-printed.webp").convert("RGBA")
    art = art.resize((700, round(art.height * 700 / art.width)), Image.LANCZOS)
    og.alpha_composite(art, (630, (H - art.height) // 2))
    draw = ImageDraw.Draw(og)
    font = ImageFont.truetype(str(ROOT / "site" / "fonts" / "rubik-latin.woff2"), 92)
    font.set_variation_by_axes([800])
    small = ImageFont.truetype(str(ROOT / "site" / "fonts" / "rubik-latin.woff2"), 34)
    small.set_variation_by_axes([400])
    for i, (text, color) in enumerate([("Design with", "#F4ECD8"), ("Color", "#E3B23C"), ("Cubes", "#E3B23C")]):
        draw.text((60, 110 + i * 94), text, font=font, fill=color)
    draw.text((62, 432), "The 1930s pattern toy,", font=small, fill="#F4ECD8")
    draw.text((62, 474), "remade for 3D printers", font=small, fill="#F4ECD8")
    og.convert("RGB").save(ROOT / "site" / "img" / "og.png", optimize=True)
    print("site/img/og.png")


def scenes_zip(zpath, src, folders):
    """2D scenes: the on-black JPEGs as they are, the transparent PNGs as WebP to fit the size limit."""
    stage = ROOT / "tools" / ".kit-stage"
    if stage.exists():
        shutil.rmtree(stage)
    scenes = []
    folders = (folders,) if isinstance(folders, str) else folders
    for p in sorted(q for f in folders for q in (src / f).rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(src)
        if p.suffix.lower() == ".jpg":
            scenes.append((p, rel.as_posix()))
        elif p.suffix.lower() == ".png":
            out = stage / rel.with_suffix(".webp")
            img = Image.open(p).convert("RGBA")
            out.parent.mkdir(parents=True, exist_ok=True)
            img.save(out, "WEBP", quality=90, method=6)
            scenes.append((out, rel.with_suffix(".webp").as_posix()))
    zip_dir(zpath, scenes)
    shutil.rmtree(stage)


def main(src, printed, web_only=False):
    src, printed = Path(src), Path(printed)
    for folder in (src, printed):
        if not (folder / "README.md").exists():
            sys.exit("Pass the folders that hold each pack's README.md: %s has none" % folder)
    packs = {"main": src, "printed": printed}

    # Pictures for the pages. (The hero corners and other rounded renders come from tools/render_scenes.py, so the folder
    # isn't cleared first.)
    for pack, rel, name, widths in WEB:
        img = trim(Image.open(packs[pack] / rel).convert("RGBA"))
        for i, w in enumerate(widths):
            out = ART / (name + ".webp" if i == 0 else "%s-%d.webp" % (name, w))
            print("site/img/art/%s" % out.name, webp(img, out, w))

    # One scanned face per code, original and printed, and an atlas of each for the designer.
    for faces_dir, out_dir in ((src / "faces" / "scan-by-code", FACES),
                               (printed / "faces-printed" / "by-code", FACES / "printed")):
        for c in CODES:
            img = Image.open(faces_dir / (c + ".png")).convert("RGBA")
            webp(img, out_dir / (c + ".webp"), 160, quality=80)
        print("%s: %d faces" % (out_dir.relative_to(ROOT).as_posix(), len(CODES)))
        make_atlas(faces_dir, out_dir)

    # The 3D cube in its three finishes, for the viewers.
    MODELS.mkdir(parents=True, exist_ok=True)
    for name in ("color-cube.glb", "color-cube-flat.glb"):
        shutil.copyfile(printed / "model" / name, MODELS / name)
    slim_glb(printed / "model" / "color-cube-printed.glb", MODELS / "color-cube-printed.glb")
    print("site/models: 3 models")

    make_og()
    if web_only:
        return

    # Small sources kept in the repository. The printed pack has the newer README, model and tools.
    if KEEP.exists():
        shutil.rmtree(KEEP)
    for base, rel in ((printed, "README.md"), (src, "patterns.json"), (src, "faces/vector"),
                      (src, "faces/manifest.json"), (printed, "faces-printed/manifest.json"),
                      (printed, "model"), (printed, "tools")):
        s, d = base / rel, KEEP / rel
        if s.is_dir():
            shutil.copytree(s, d, ignore=shutil.ignore_patterns("*.png" if rel == "faces/vector" else "viewer.html"))
        else:
            d.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(s, d)
    for svg in (src / "2d-vector").rglob("*.svg"):
        d = KEEP / svg.relative_to(src)
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(svg, d)
    print("artwork/assets")

    # Downloads, each under the 25 MB a static file may be.
    renders = sorted((src / "3d-scan").glob("*.png")) + sorted((src / "3d-flat").glob("*.png"))
    zip_dir(DL / "color-cubes-renders.zip",
            [(p, "renders/%s/%s" % ("scanned" if p.parent.name == "3d-scan" else "flat", p.name)) for p in renders])

    kit = [(printed / "README.md", "README.md"), (src / "patterns.json", "patterns.json")]
    kit += [(p, p.relative_to(src).as_posix()) for p in sorted((src / "faces").rglob("*")) if p.is_file()]
    kit += [(p, p.relative_to(printed).as_posix()) for p in sorted((printed / "model").rglob("*"))
            if p.is_file() and p.name != "viewer.html" and "printed" not in p.relative_to(printed).as_posix()]
    # Vector scenes as SVG only; any size of PNG can be made from them.
    kit += [(p, p.relative_to(src).as_posix()) for p in sorted((src / "2d-vector").rglob("*.svg"))]
    zip_dir(DL / "color-cubes-image-kit.zip", kit)

    scenes_zip(DL / "color-cubes-scanned-scenes.zip", src, "2d-scan")

    # The 3D-printed finish, in two zips to stay under the size limit. The kit: renders, the twelve
    # looks, the printed cube at full resolution (GLB, and OBJ with its atlas and normal map) and the
    # print animation. The scenes: 2D scenes, every look in all four turns, the raw scan cuts.
    pkit = [(printed / "README.md", "README.md")]
    pkit += [(p, p.relative_to(printed).as_posix()) for p in sorted((printed / "3d-printed").glob("*.png"))]
    pkit += [(p, p.relative_to(printed).as_posix()) for p in sorted((printed / "faces-printed" / "by-code").glob("*.png"))]
    for rel in ("faces-printed/contact-sheet.jpg", "faces-printed/manifest.json", "model/color-cube-printed.glb",
                "model/color-cube-printed.obj", "model/color-cube-printed.mtl", "model/textures-printed/atlas.png",
                "model/textures-printed/atlas-normal.png", "print-player/color-cube-print.mp4",
                "print-player/color-cube-print.webp"):
        if (printed / rel).exists():
            pkit.append((printed / rel, rel))
    zip_dir(DL / "color-cubes-printed-kit.zip", pkit)
    scenes_zip(DL / "color-cubes-printed-scenes.zip", printed, ("2d-printed", "faces-printed/generated", "faces-printed/scan-cuts"))

if __name__ == "__main__":
    # --web rebuilds only the page images, faces and models, skipping the slow zips.
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--printed" not in sys.argv or len(args) < 2:
        sys.exit("Usage: python tools/build_assets.py <main pack> --printed <printed pack> [--web]")
    main(args[0], sys.argv[sys.argv.index("--printed") + 1], web_only="--web" in sys.argv)
