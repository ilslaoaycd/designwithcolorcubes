"""Link-preview pictures (1200 x 630) as JPEGs, with no type on them.

  site/img/og.jpg           photograph of an original 1930s lid and tray on a wooden table
                            (home, history, contribute)
  site/img/og-patterns.jpg  render of five printed trays of designs (patterns)
  site/img/og-print.jpg     render of a printed tray being filled, loose cubes round it (print, downloads)

The renders come from tools/render-scenes.html (python tools/render_scenes.py og-patterns og-print),
which saves them with transparent backgrounds as site/img/art/og-*.webp; here they are laid on the
site's paper. The designer and box designer pages keep the drawn previews from tools/build_og.mjs.

Needs Python 3 with Pillow. Run from anywhere:  python tools/build_og_previews.py
MIT licensed (see LICENSE).
"""

from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "site" / "img"
W, H = 1200, 630


def save(img, name):
    out = IMG / name
    # Full-resolution color (no chroma subsampling) so the red and white edges stay crisp.
    img.convert("RGB").save(out, quality=86, subsampling=0, optimize=True, progressive=True)
    print("site/img/%s %d KB" % (name, out.stat().st_size // 1024))


def photo():
    # The photo is 2000 x 1042, nearly the preview's shape: trim a few pixels from the sides.
    img = ImageOps.exif_transpose(Image.open(IMG / "original-lid-and-tray.jpg")).convert("RGB")
    save(ImageOps.fit(img, (W, H), Image.LANCZOS), "og.jpg")


def on_paper(render, name):
    """A transparent render laid on the pages' background: the paper grain, tiled."""
    tile = Image.open(IMG / "paper.jpg").convert("RGBA")
    og = Image.new("RGBA", (W, H))
    for y in range(0, H, tile.height):
        for x in range(0, W, tile.width):
            og.paste(tile, (x, y))
    art = Image.open(IMG / "art" / render).convert("RGBA")
    if art.size != (W, H):
        art = art.resize((W, H), Image.LANCZOS)
    og.alpha_composite(art)
    save(og, name)


if __name__ == "__main__":
    photo()
    on_paper("og-patterns.webp", "og-patterns.jpg")
    on_paper("og-print.webp", "og-print.jpg")
