"""Prepare Isaac's scans of the original set for the website and the designer resources.

Reads the scans from a folder you pass in (they are not kept in the repository at full size),
strips all metadata, and writes:

  site/img/original-lid.jpg           the original 1930s lid, web size
  site/img/printed-lid.jpg            the 3D-printed lid, web size
  site/img/original-cubes-N.jpg       loose original cubes on black, web size
  artwork/scans/*.jpg                 the same scans at full 300 dpi, metadata stripped
  artwork/scans/cubes/cube-NN.png     every loose cube cut out on a clear background
  site/img/spill.webp                 a wide strip of cut-out cubes, scattered, for page decoration
  site/img/spill-tall.webp            the same idea, tall, for the sides of sections

Scans 3-6 show hands and are never used.

Needs Python 3 with opencv-python, numpy and Pillow.
    python tools/build_scans.py "C:/Users/isaac/Downloads"
"""

import random
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "site" / "img"
SCANS = ROOT / "artwork" / "scans"

LIDS = {
    "Scan_20261123-2_a91eb5.jpg": "original-lid",
    "Scan_20261123_18212b.jpg": "printed-lid",
}
LOOSE = [  # scans of loose cubes on black card, in order
    "Scan_20261123-7_e784f5.jpg",
    "Scan_20261123-8_27b768.jpg",
    "Scan_20261123-9_762382.jpg",
    "Scan_20261123-10_c1ac78.jpg",
    "Scan_20261123-11_8f1822.jpg",
]
# Cubes are one inch; at 300 dpi a lone cube covers roughly 300 x 300 px.
LONE_CUBE = (55_000, 110_000)


def save_jpg(img, path, longest=None, quality=86):
    """img is a Pillow image. Saving through Pillow without exif= drops all metadata."""
    if longest:
        img = img.copy()
        img.thumbnail((longest, longest), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    return img.size


def crop_to_card(img):
    """The black card doesn't fill the scanner bed; trim the white margin around it."""
    a = np.asarray(img.convert("L")).astype(int)
    dark_rows = np.where((a < 90).mean(axis=1) > 0.5)[0]
    dark_cols = np.where((a < 90).mean(axis=0) > 0.5)[0]
    return img.crop((dark_cols[0], dark_rows[0], dark_cols[-1] + 1, dark_rows[-1] + 1))


def cube_mask(rgb):
    """Pixels that belong to a cube rather than the black card."""
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    v, s = hsv[..., 2].astype(int), hsv[..., 1].astype(int)
    m = ((v > 95) | ((s > 70) & (v > 55))).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    return m


def cut_cubes(rgb):
    """Every lone cube as an RGBA image cropped to its corners, plus how square it is."""
    mask = cube_mask(rgb)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    out = []
    h, w = mask.shape
    for i in range(1, count):
        x, y, bw, bh, area = stats[i]
        if not LONE_CUBE[0] <= area <= LONE_CUBE[1]:
            continue
        if x <= 2 or y <= 2 or x + bw >= w - 2 or y + bh >= h - 2:
            continue  # runs off the scan
        comp = (labels == i).astype(np.uint8) * 255
        contour = max(cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0], key=cv2.contourArea)
        (cx, cy), (rw, rh), _ = cv2.minAreaRect(contour)
        if min(rw, rh) / max(rw, rh) < 0.85 or area / (rw * rh) < 0.9:
            continue  # two cubes touching, or not a clean square
        # Soft 1.5 px edge so the cutout sits well on any background.
        alpha = cv2.GaussianBlur(cv2.erode(comp, np.ones((3, 3), np.uint8)), (0, 0), 1.2)
        pad = 6
        x0, y0, x1, y1 = max(x - pad, 0), max(y - pad, 0), min(x + bw + pad, w), min(y + bh + pad, h)
        rgba = np.dstack([rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]])
        out.append(Image.fromarray(np.ascontiguousarray(rgba)))
    return out


def scatter(cubes, width, height, size, n, seed, keep_middle=None):
    """Lay cutouts on a clear canvas at random turns without overlaps."""
    rnd = random.Random(seed)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    placed = []
    tries = 0
    while len(placed) < n and tries < 4000:
        tries += 1
        cube = rnd.choice(cubes)
        scale = size * rnd.uniform(0.85, 1.1) / max(cube.size)
        img = cube.resize((round(cube.size[0] * scale), round(cube.size[1] * scale)), Image.LANCZOS)
        img = img.rotate(rnd.uniform(-180, 180), resample=Image.BICUBIC, expand=True)
        if img.size[0] >= width or img.size[1] >= height:
            continue
        x = rnd.randint(0, width - img.size[0])
        y = rnd.randint(0, height - img.size[1])
        cx, cy, r = x + img.size[0] / 2, y + img.size[1] / 2, img.size[0] / 2 * 0.92
        if keep_middle and keep_middle(cx / width, cy / height):
            continue
        if any((cx - px) ** 2 + (cy - py) ** 2 < (r + pr) ** 2 for px, py, pr in placed):
            continue
        placed.append((cx, cy, r))
        canvas.alpha_composite(img, (x, y))
    return canvas


def main(src):
    src = Path(src)
    for name, slug in LIDS.items():
        # The scanner reads the lids on their side; turn them a quarter clockwise so the title reads.
        img = Image.open(src / name).convert("RGB").transpose(Image.Transpose.ROTATE_270)
        save_jpg(img, SCANS / (slug + ".jpg"), quality=90)
        print("site/img/%s.jpg" % slug, save_jpg(img, IMG / (slug + ".jpg"), longest=1400))

    cubes = []
    for n, name in enumerate(LOOSE, start=1):
        img = crop_to_card(Image.open(src / name).convert("RGB"))
        save_jpg(img, SCANS / ("original-cubes-%d.jpg" % n), quality=90)
        save_jpg(img, IMG / ("original-cubes-%d.jpg" % n), longest=1200)
        found = cut_cubes(np.asarray(img))
        print("scan %d: %d lone cubes" % (n, len(found)))
        cubes += found

    out = SCANS / "cubes"
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.png"):
        old.unlink()
    for i, cube in enumerate(cubes, start=1):
        cube.save(out / ("cube-%02d.png" % i), optimize=True)
    print("artwork/scans/cubes: %d cutouts" % len(cubes))

    # Cubes at the scale the page shows them (about 64 px, doubled for sharp screens).
    small = [c.copy() for c in cubes]
    for c in small:
        c.thumbnail((160, 160), Image.LANCZOS)
    wide = scatter(small, 2400, 300, 120, 26, seed=1930)
    wide.save(IMG / "spill.webp", "WEBP", quality=82, method=6)
    (IMG / "spill-tall.webp").unlink(missing_ok=True)
    print("site/img/spill.webp")

    # Everything in artwork/scans, one file each, for the Files page (tools/build_downloads.py
    # lists them; its Download all zips them in the browser with the license).
    dl = ROOT / "site" / "downloads" / "scans"
    shutil.rmtree(dl, ignore_errors=True)
    for f in sorted(SCANS.rglob("*")):
        if f.is_file():
            (dl / f.relative_to(SCANS)).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, dl / f.relative_to(SCANS))
    print("site/downloads/scans/ (run tools/build_downloads.py next)")


SCANS_README = """DESIGN WITH COLOR CUBES - scans of the original set
https://designwithcolorcubes.org

Scanned at 300 dpi by Isaac Lloyd from an original 1930s set.

  original-lid.jpg        the lid of the original box, still in its cellophane
  printed-lid.jpg         the 3D-printed replica lid, for comparison
  original-cubes-N.jpg    loose original cubes on black card
  cubes/cube-NN.png       every loose cube cut out on a clear background, at full size,
                          for collages, backgrounds and mock-ups

Free for any use, commercial too, under CC BY 4.0: credit Isaac Lloyd.
"""


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
