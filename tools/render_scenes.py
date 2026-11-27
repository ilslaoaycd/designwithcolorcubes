"""Render the site's realistic cube pictures from the two 3D cube models.

    python tools/render_scenes.py            # then open http://localhost:8797/render in Chrome

Serves site/ (for three.js, print3d.js and the cube models) plus tools/render-scenes.html, which
lays cubes (3D-printed, original, or both) on a table with rounded edges, renders each scene with
soft shadows on a transparent background and posts it back here. Each is saved under
site/img/art/ at the widths in SCENES. The server stops when the page says it has finished:
add ?only=then-and-now,spill-round to the page address for some of them (python tools/render_scenes.py
then-and-now spill-round prints that address), or ?set=row (--set=row; also original, pile and mixed, see
TRAY_SETS in the page) for one set of trays, saved as site/img/{set dir}/{code}.webp and a
half-size copy. Needs Pillow and a browser with WebGL; headless
Chromium works too (SwiftShader), only slower.

Also writes site/img/paper.jpg, the hero's paper grain, when run with --paper (no browser).
"""

import io
import re
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
ART = SITE / "img" / "art"
PAGE = ROOT / "tools" / "render-scenes.html"
PORT = 8797
# Each scene's widths: the first is saved as <name>.webp, the others as <name>-<width>.webp.
SCENES = {
    "tray-original-round": [1200, 700],
    "blocks-original": [1400, 760],
    "spill-round": [2400, 1300],
    "then-and-now": [2000, 1100],
    # link previews, laid on the paper by tools/build_og_photos.py
    "og-patterns": [1200], "og-print": [1200],
    # stand-ins on the Files page (tools/build_downloads.py)
    "thumb-cube": [240], "thumb-cube-original": [240], "thumb-plate": [240], "thumb-tray": [240],
}
saved = set()
finished = False


def save_tray(file, widths, data):
    """One tray of a set: site/img/{set dir}/{code}.webp and -{width}.webp."""
    img = Image.open(io.BytesIO(data)).convert("RGBA")
    folder, code = file.split("/", 1)
    TRAYS = SITE / "img" / folder
    TRAYS.mkdir(parents=True, exist_ok=True)
    for i, w in enumerate(widths):
        path = TRAYS / (f"{code}.webp" if i == 0 else f"{code}-{w}.webp")
        h = round(img.height * w / img.width)
        img.resize((w, h), Image.LANCZOS).save(path, "WEBP", quality=78, method=6)
        print(f"site/img/{folder}/{path.name}  {w} x {h}  {path.stat().st_size // 1024} KB", flush=True)


def save_scene(name, data):
    img = Image.open(io.BytesIO(data)).convert("RGBA")
    for i, w in enumerate(SCENES[name]):
        path = ART / (f"{name}.webp" if i == 0 else f"{name}-{w}.webp")
        h = round(img.height * w / img.width)
        img.resize((w, h), Image.LANCZOS).save(path, "WEBP", quality=84, method=6)
        print(f"site/img/art/{path.name}  {w} x {h}  {path.stat().st_size // 1024} KB", flush=True)


def make_paper(size=512, seed=7):
    """A tileable light paper grain on the hero grey: fine speckle plus faint soft mottling.
    Blurred in the frequency domain, so the tile wraps without a seam. Saved as JPEG, which keeps
    low-contrast grain far better than lossy WebP at the same size."""
    import numpy as np
    rng = np.random.default_rng(seed)

    def soft(scale):
        f = np.fft.fft2(rng.standard_normal((size, size)))
        ky = np.fft.fftfreq(size)[:, None]
        kx = np.fft.fftfreq(size)[None, :]
        out = np.real(np.fft.ifft2(f * np.exp(-(kx ** 2 + ky ** 2) * (scale ** 2) * 2 * np.pi ** 2)))
        return out / out.std()

    grain = soft(0.5) * 1.8 + soft(2.5) * 1.2 + soft(40) * 1.1
    base = np.array([0xEC, 0xEA, 0xE4], dtype=float)
    rgb = np.clip(base + grain[:, :, None] * np.array([1.0, 0.98, 0.92]), 0, 255).round().astype("uint8")
    path = SITE / "img" / "paper.jpg"
    Image.fromarray(rgb).save(path, "JPEG", quality=88, optimize=True)
    print(f"site/img/paper.jpg  {path.stat().st_size // 1024} KB")


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".glb": "model/gltf-binary",
        ".webp": "image/webp", ".json": "application/json", ".html": "text/html",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def do_GET(self):
        if urlparse(self.path).path == "/render":
            body = PAGE.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
        global finished
        url = urlparse(self.path)
        query = parse_qs(url.query)
        name = query.get("name", [""])[0]
        file = query.get("file", [""])[0]
        if url.path == "/done":
            finished = True
            self.send_response(204)
            self.end_headers()
            return
        row = re.fullmatch(r"trays(-[a-z]+)?/[a-z0-9-]{3,120}", file) and name == file
        if url.path != "/save" or not (name in SCENES or row):
            self.send_error(404)
            return
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if row:
            widths = [int(w) for w in query.get("widths", ["0"])[0].split(",") if w.isdigit() and 0 < int(w) < 4000]
            save_tray(file, widths, data)
        else:
            save_scene(name, data)
        saved.add(name)
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


def main():
    if "--paper" in sys.argv:
        make_paper()
        return
    wanted = {a for a in sys.argv[1:] if not a.startswith("-")} or set(SCENES)
    unknown = wanted - set(SCENES)
    if unknown:
        sys.exit("Unknown scenes: " + ", ".join(sorted(unknown)))
    server = HTTPServer(("127.0.0.1", PORT), Handler)  # one request at a time, so the loop sees each save
    sets = [a[6:] for a in sys.argv if a.startswith("--set=")]
    only = "?set=" + sets[0] if sets else "?row" if "--row" in sys.argv else "" if wanted == set(SCENES) else "?only=" + ",".join(sorted(wanted))
    print(f"Open http://localhost:{PORT}/render{only} (add dry to preview without saving)", flush=True)
    while not finished:  # the page posts /done when it has rendered everything it was asked for
        server.handle_request()
    print("Saved: " + ", ".join(sorted(saved)))


if __name__ == "__main__":
    main()
