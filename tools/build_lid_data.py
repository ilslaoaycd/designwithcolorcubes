"""Build site/data/lid-type.json: the lettering the lid designer can print, as clean polygons.

    python tools/build_lid_data.py ["Replica Files/SVG/final_color_cubes_cover.svg"]

Two kinds of lettering go in:

- "rubik": Rubik at weight 800, every character the site's Latin font covers, turned into
  outlines with overlaps removed (a printed letter has to be one clean shape). Units are ems,
  y up, baseline at 0, each glyph with its advance.
- "classic": the three lines of title lettering from Isaac's cover ("Design with", "COLOR CUBES",
  and the two-line tag), read from the cover's "White Text" layer. They are fixed artwork: the
  designer can place and scale them but not change the words. Units are millimetres, y down, each
  line from its own top-left corner. Left out if the cover isn't given.

Polygons are [outer ring, hole ring, ...] with rings as flat [x0, y0, x1, y1, ...] lists, outer
rings counter-clockwise and holes clockwise in a y-up frame.

Needs fontTools, brotli, skia-pathops and shapely; the cover also needs svgelements.
"""

import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from shapely.geometry import Polygon, MultiPolygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "lid-type.json"
WEIGHT = 800


def flatten(commands, steps=6):
    """Pen commands to closed polylines (quadratic and cubic curves as short lines)."""
    rings, ring, cur = [], [], (0, 0)
    for op, pts in commands:
        if op == "moveTo":
            if len(ring) > 2:
                rings.append(ring)
            ring = [pts[0]]
            cur = pts[0]
        elif op == "lineTo":
            ring.append(pts[0])
            cur = pts[0]
        elif op == "qCurveTo":
            # TrueType: implied on-curve points between consecutive off-curve points.
            offs = list(pts[:-1])
            end = pts[-1]
            segs = []
            p0 = cur
            for i, c in enumerate(offs):
                p2 = end if i == len(offs) - 1 else ((c[0] + offs[i + 1][0]) / 2, (c[1] + offs[i + 1][1]) / 2)
                segs.append((p0, c, p2))
                p0 = p2
            for a, c, b in segs:
                for k in range(1, steps + 1):
                    t = k / steps
                    ring.append(((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
                                 (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]))
            cur = end
        elif op == "curveTo":
            a, c1, c2, b = cur, pts[0], pts[1], pts[2]
            for k in range(1, steps + 1):
                t = k / steps
                mt = 1 - t
                ring.append((mt ** 3 * a[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t ** 3 * b[0],
                             mt ** 3 * a[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t ** 3 * b[1]))
            cur = b
        elif op in ("closePath", "endPath"):
            if len(ring) > 2:
                rings.append(ring)
            ring = []
    if len(ring) > 2:
        rings.append(ring)
    return rings


def even_odd(rings):
    """Closed rings to one shape by the even-odd rule (works for clean, non-overlapping outlines)."""
    shape = None
    for r in rings:
        p = Polygon(r).buffer(0)
        if p.is_empty:
            continue
        shape = p if shape is None else shape.symmetric_difference(p)
    return shape


def polys(shape, scale, ndigits, flip=1, tol=0):
    if shape is None or shape.is_empty:
        return []
    if tol:
        shape = shape.simplify(tol, preserve_topology=True)
    parts = shape.geoms if isinstance(shape, MultiPolygon) else [shape]
    out = []
    for p in parts:
        if p.is_empty or p.area <= 0:
            continue
        p = orient(p, 1.0 if flip > 0 else -1.0)
        rings = [p.exterior] + list(p.interiors)
        out.append([[round(v * scale * (1 if i % 2 == 0 else flip), ndigits) for xy in list(r.coords)[:-1] for i, v in enumerate(xy)]
                    for r in rings])
    return out


def rubik():
    font = TTFont(ROOT / "site" / "fonts" / "rubik-latin.woff2")
    font = instantiateVariableFont(font, {"wght": WEIGHT})
    from fontTools.ttLib.removeOverlaps import removeOverlaps
    removeOverlaps(font)
    upm = font["head"].unitsPerEm
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    glyphs = {}
    for code, name in sorted(cmap.items()):
        ch = chr(code)
        if code < 32 or (0x7f <= code < 0xa0):
            continue
        pen = DecomposingRecordingPen(gs)
        gs[name].draw(pen)
        shape = even_odd(flatten(pen.value))
        glyphs[ch] = {"a": round(gs[name].width / upm, 4), "p": polys(shape, 1 / upm, 4, tol=4)}
    os2 = font["OS/2"]
    return {"weight": WEIGHT, "cap": round(os2.sCapHeight / upm, 4), "x": round(os2.sxHeight / upm, 4),
            "asc": round(font["hhea"].ascent / upm, 4), "desc": round(-font["hhea"].descent / upm, 4), "glyphs": glyphs}


def classic(cover):
    from svgelements import SVG, Path as SPath, Group
    svg = SVG.parse(str(cover), reify=True)
    layer = next(e for e in svg.elements() if isinstance(e, Group) and e.values.get("{http://www.inkscape.org/namespaces/inkscape}label") == "White Text")
    shapes = []
    for e in layer.select():
        if not isinstance(e, SPath):
            continue
        rings = []
        for sub in e.as_subpaths():
            seg_pts = []
            sp = SPath(sub)
            n = max(8, int(sp.length(error=1e-3) / 0.15))
            for i in range(n):
                q = sp.point(i / n)
                seg_pts.append((q.x, q.y))
            if len(seg_pts) > 2:
                rings.append(seg_pts)
        shape = even_odd(rings)
        if shape is not None and not shape.is_empty:
            shapes.append(shape)
    # svgelements works in CSS pixels; the cover is drawn in millimetres.
    from shapely.affinity import scale as shp_scale
    shapes = [shp_scale(s, 25.4 / 96, 25.4 / 96, origin=(0, 0)) for s in shapes]
    # The two white stars are small, square and have no holes; the rest is lettering. The lines
    # sit at fixed heights on the cover: the script above 84 mm, the title above 111 mm, then
    # the two-line tag.
    def is_star(s):
        x0, y0, x1, y1 = s.bounds
        return s.geom_type == "Polygon" and not list(s.interiors) and abs((x1 - x0) - (y1 - y0)) < 1 and 4 < x1 - x0 < 9
    letters = [s for s in shapes if not is_star(s)]
    mid = lambda s: (s.bounds[1] + s.bounds[3]) / 2
    groups = [[s for s in letters if mid(s) < 84], [s for s in letters if 84 <= mid(s) < 111], [s for s in letters if mid(s) >= 111]]
    names = ["script", "title", "tag"]
    out = {}
    for name, g in zip(names, groups):
        u = unary_union(g)
        x0, y0, x1, y1 = u.bounds
        from shapely.affinity import translate
        u = translate(u, -x0, -y0)
        out[name] = {"w": round(x1 - x0, 3), "h": round(y1 - y0, 3), "p": polys(u, 1, 3, flip=1, tol=0.02)}
    return out


def main():
    data = {"rubik": rubik()}
    if len(sys.argv) > 1:
        data["classic"] = classic(Path(sys.argv[1]))
    elif OUT.exists():
        old = json.loads(OUT.read_text())
        if "classic" in old:
            data["classic"] = old["classic"]
    OUT.write_text(json.dumps(data, separators=(",", ":")))
    print(f"{OUT.relative_to(ROOT)}  {OUT.stat().st_size // 1024} KB  {len(data['rubik']['glyphs'])} glyphs"
          + ("  classic: " + ", ".join(f"{k} {v['w']:.0f}x{v['h']:.0f} mm" for k, v in data.get("classic", {}).items())))


if __name__ == "__main__":
    main()
