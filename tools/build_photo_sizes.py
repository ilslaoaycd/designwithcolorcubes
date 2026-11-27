"""build_photo_sizes.py — smaller WebP copies of the home page's photos, for its srcsets.

    python tools/build_photo_sizes.py

For each photo below, writes site/img/<name>-<width>.webp at each width (never wider than the
photo), with no metadata. The JPEGs stay as they are: the Files page links them. Run it after
changing one of the photos, and keep the srcsets in site/index.html in step. MIT licensed (see
LICENSE).
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "site" / "img"

PHOTOS = {
    "set-quadrants.jpg": [360, 700],
    "set-red-white-pattern.jpg": [360, 700],
    "set-blue-yellow-pattern.jpg": [360, 700],
    "set-red-blue-checkerboard.jpg": [360, 700],
    "set-red-white-stripes.jpg": [360, 700],
    "original-lid-and-tray.jpg": [700, 1400],
    "original-lid.jpg": [700, 1400],
    "printed-lid.jpg": [700, 1400],
}


def save(im, out, width, quality):
    w, h = im.size
    if width < w:
        im = im.resize((width, round(h * width / w)), Image.LANCZOS)
    im.save(out, "WEBP", quality=quality, method=6)  # Pillow writes no EXIF unless asked
    print("wrote", out.relative_to(ROOT).as_posix(), "%d KB" % round(out.stat().st_size / 1024))


for name, widths in PHOTOS.items():
    src = IMG / name
    im = Image.open(src)
    im.load()
    im = im.convert("RGB")
    for width in widths:
        save(im, IMG / ("%s-%d.webp" % (src.stem, min(width, im.width))), width, 80)
