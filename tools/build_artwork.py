"""Build the lid artwork and the lid's 12 designs from Isaac's Inkscape source.

Reads   Replica Files/SVG/final_color_cubes_cover.svg   (200 mm square, pure print colors)
        Replica Files/SVG/pure hidden/*.cleaned.svg     (one file per filament color)
Writes  artwork/lid/lid-7x7-cover.svg                   full lid in the site palette
        artwork/lid/layers/lid-7x7-{color}.svg          per-color layers, as used for the 3D lid
        site/img/lid.svg                                same as the cover, for the website
        site/img/wordmark.svg                           lettering and stars only, cream on clear
        site/data/patterns.json  ("lid" section)        the 12 lid designs as tray codes

Needs Python 3, Pillow, and ImageMagick's `magick` on the PATH (used to rasterize the SVG so
each cube can be read by color).  Run from the repository root:  python tools/build_artwork.py
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "Replica Files" / "SVG"
COVER = SRC_DIR / "final_color_cubes_cover.svg"

SVG = "http://www.w3.org/2000/svg"
INK = "http://www.inkscape.org/namespaces/inkscape"
SODI = "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"

# Print colors in the source file -> site palette (site/js/cubecode.js COLORS).
PALETTE = {"#ff0000": "#C0272D", "#0000ff": "#1E2A5A", "#ffff00": "#E3B23C", "#ffffff": "#F4ECD8"}
PURE = {"r": (255, 0, 0), "b": (0, 0, 255), "y": (255, 255, 0), "w": (255, 255, 255)}

# Lid geometry in millimetres, measured from the cube rectangles in the source file.
TILE_ORIGINS = [7.7, 56.5, 105.2, 154.0]  # left/top edge of each of the 4 tile columns/rows
PITCH = 5.5                               # one cube to the next
CELL = 5.29                               # one cube
BLUE_PANEL = (48.91, 48.92, 102.19)       # x, y, size of the centre panel

LICENSE_NOTE = (
    "Design With Color Cubes lid artwork by Isaac Lloyd, after the 1930s Embossing Company box. "
    "CC BY 4.0. https://designwithcolorcubes.org"
)


def clean_tree(path):
    """Parse an Inkscape SVG and strip editor-only elements and attributes."""
    ET.register_namespace("", SVG)
    tree = ET.parse(path)
    root = tree.getroot()
    for parent in list(root.iter()):
        for child in list(parent):
            if child.tag.startswith("{" + SODI + "}") or child.tag == "{" + SVG + "}metadata":
                parent.remove(child)
    for el in root.iter():
        for key in list(el.attrib):
            if key.startswith("{" + INK + "}") or key.startswith("{" + SODI + "}"):
                del el.attrib[key]
    return tree


def recolor(text):
    for pure, shade in PALETTE.items():
        text = re.sub(re.escape(pure), shade, text, flags=re.IGNORECASE)
    return text


def write_svg(tree, path, title):
    path.parent.mkdir(parents=True, exist_ok=True)
    body = ET.tostring(tree.getroot(), encoding="unicode")
    body = re.sub(r">", "><title>" + title + "</title><desc>" + LICENSE_NOTE + "</desc>", body, count=1)
    path.write_text('<?xml version="1.0" encoding="UTF-8"?>\n' + recolor(body) + "\n", encoding="utf-8")
    print("wrote", path.relative_to(ROOT))


def build_cover():
    tree = clean_tree(COVER)
    write_svg(tree, ROOT / "artwork" / "lid" / "lid-7x7-cover.svg", "Design with Color Cubes lid, 7x7 set")
    shutil.copyfile(ROOT / "artwork" / "lid" / "lid-7x7-cover.svg", ROOT / "site" / "img" / "lid.svg")
    print("wrote site/img/lid.svg")


def build_layers():
    names = {"reds": "red", "blues": "blue", "yellows": "yellow", "whites": "white"}
    for stem, color in names.items():
        tree = clean_tree(SRC_DIR / "pure hidden" / (stem + ".cleaned.svg"))
        write_svg(tree, ROOT / "artwork" / "lid" / "layers" / ("lid-7x7-" + color + ".svg"),
                  "Design with Color Cubes lid, " + color + " layer")


def build_wordmark():
    """Keep only the 'White Text' group (lettering and two stars), cropped to the blue panel."""
    raw = ET.parse(COVER).getroot()
    chain = None

    def find(el, path):
        nonlocal chain
        for child in el:
            if child.tag != "{" + SVG + "}g":
                continue
            here = path + [child]
            if child.get("{" + INK + "}label") == "White Text":
                chain = here
                return
            find(child, here)

    find(raw, [])
    if chain is None:
        sys.exit("The 'White Text' layer was not found in " + str(COVER))

    ET.register_namespace("", SVG)
    x, y, size = BLUE_PANEL
    svg = ET.Element("{" + SVG + "}svg", {"viewBox": "%g %g %g %g" % (x, y, size, size), "role": "img"})
    node = svg
    for g in chain:  # rebuild the nested transforms, without the sibling artwork
        attrs = {"transform": g.get("transform")} if g.get("transform") else {}
        node = ET.SubElement(node, "{" + SVG + "}g", attrs)
    for path in chain[-1]:
        d = path.get("d")
        attrs = {"d": d, "fill": "#ffffff"}
        if path.get("transform"):
            attrs["transform"] = path.get("transform")
        ET.SubElement(node, "{" + SVG + "}path", attrs)
    write_svg(ET.ElementTree(svg), ROOT / "site" / "img" / "wordmark.svg",
              "Design with Color Cubes, America's Best Known Designing Set")


def nearest(rgb):
    return min(PURE, key=lambda k: sum((a - b) ** 2 for a, b in zip(rgb, PURE[k])))


def read_cell(img, scale, x0, y0):
    """Return the tray-code character for the cube whose top-left corner is (x0, y0) mm."""
    def at(fx, fy):
        return nearest(img.getpixel((round((x0 + fx * CELL) * scale), round((y0 + fy * CELL) * scale))))

    top, right, bottom, left = at(0.5, 0.2), at(0.8, 0.5), at(0.5, 0.8), at(0.2, 0.5)
    if top == right == bottom == left:
        return top
    # A split cube. Find which corner each triangle's square corner sits in: 0 TL, 1 TR, 2 BR, 3 BL.
    if top == right and bottom == left:
        corners = {top: 1, bottom: 3}
    elif top == left and right == bottom:
        corners = {top: 0, right: 2}
    else:
        return None
    colors = set(corners)
    if colors == {"b", "y"}:
        return "1234"[corners["b"]]
    if colors == {"r", "w"}:
        return "5678"[corners["r"]]
    return None  # a color pair no cube has


LID_NAMES = ["Gold cross", "Red and white nine-patch", "Sawtooth frame", "Blue X on a checkerboard", "Blue cross", "Striped window", "Blue cross and arrows", "Blue ring", "Red and gold cross on cream", "Four blue diamonds", "Striped quarters", "Blue octagon"]


def build_lid_patterns():
    scale = 10.0  # pixels per millimetre
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "cover.png"
        subprocess.run(["magick", "-density", "254", "-background", "white", str(COVER),
                        "-flatten", str(png)], check=True)
        img = Image.open(png).convert("RGB")

    # The 12 tiles, clockwise from the top-left corner of the lid, and their names.
    ring = [(0, 0), (0, 1), (0, 2), (0, 3), (1, 3), (2, 3), (3, 3), (3, 2), (3, 1), (3, 0), (2, 0), (1, 0)]
    designs, problems = [], []
    for n, (tr, tc) in enumerate(ring, start=1):
        rows = []
        for r in range(7):
            row = ""
            for c in range(7):
                ch = read_cell(img, scale, TILE_ORIGINS[tc] + c * PITCH, TILE_ORIGINS[tr] + r * PITCH)
                if ch is None:
                    problems.append("lid design %d, row %d, column %d" % (n, r + 1, c + 1))
                    ch = "w"
                row += ch
            rows.append(row)
        designs.append({"id": "lid-%02d" % n, "name": LID_NAMES[n - 1], "w": 7, "h": 7,
                        "code": "-".join(rows)})

    out = ROOT / "site" / "data" / "patterns.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    data = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {}
    data["lid"] = designs
    out.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print("wrote", out.relative_to(ROOT), "(%d lid designs)" % len(designs))
    if problems:
        print("\nCould not be read as a cube face (left white):")
        for p in problems:
            print("  ", p)
        sys.exit(1)


if __name__ == "__main__":
    (ROOT / "site" / "img").mkdir(parents=True, exist_ok=True)
    build_cover()
    build_layers()
    build_wordmark()
    build_lid_patterns()
