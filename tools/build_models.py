"""Build the model release and the website downloads from Isaac's working files.

The shapes are not changed. Each item (cube, tray, lid) is moved so it sits on the print bed
at the origin, and the lid is turned over so its artwork prints first. Then every item is
written in formats any slicer can open:

  models/3mf/   standard 3MF, one file per item, each color a named part of one object
  models/stl/   one STL per color part (load an item's files together as one object)
  models/obj/   one OBJ per item, with the colors in an MTL file
  models/projects/bambu-studio-orcaslicer/   Isaac's own sliced-and-printed project, as it is
  models/source/   Fusion files

and zipped into site/downloads/ with the print notes and the license.

Source files (not in the repository):
  Replica Files/3d Models/Old/Cube/*.obj      the six color parts of one cube
  Replica Files/3d Models/Case/**/*.obj       tray and lid
  Replica Files/Final Color Cubes (jan).3mf   the Bambu Studio project
  Replica Files/*.f3d                         Fusion sources

Needs Python 3 with trimesh and numpy.  Run from the repository root:  python tools/build_models.py
"""

import shutil
import sys
import zipfile
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Replica Files"
MODELS = ROOT / "models"
DOWNLOADS = ROOT / "site" / "downloads"

# Filament colors, in the order used everywhere: name -> display color (site palette).
COLORS = {"white": "#F4ECD8", "blue": "#1E2A5A", "yellow": "#E3B23C", "red": "#C0272D"}

# item -> (title, turn over?, [(source OBJ under Replica Files/3d Models, part name, color)])
ITEMS = {
    "color-cube": ("Color Cube", False, [
        ("Old/Cube/Red.obj", "cube-red", "red"),
        ("Old/Cube/Blue.obj", "cube-blue", "blue"),
        ("Old/Cube/Yellow.obj", "cube-yellow", "yellow"),
        ("Old/Cube/White.obj", "cube-white", "white"),
        ("Old/Cube/Blue-Yellow.obj", "cube-split-yellow", "yellow"),
        ("Old/Cube/Red-White.obj", "cube-split-white", "white"),
    ]),
    "tray-7x7": ("Color Cubes tray, 7x7", False, [
        ("Case/Case Bottom.obj", "tray", "white"),
    ]),
    "lid-7x7": ("Color Cubes lid, 7x7", True, [
        ("Case/Lid/Walls (Red).obj", "lid-walls-red", "red"),
        ("Case/Lid/Top (White).obj", "lid-top-white", "white"),
        ("Case/Lid/Reds.obj", "lid-art-red", "red"),
        ("Case/Lid/Blues.obj", "lid-art-blue", "blue"),
        ("Case/Lid/Yellows.obj", "lid-art-yellow", "yellow"),
        ("Case/Lid/Whites.obj", "lid-art-white", "white"),
    ]),
}

PROJECT = (SRC / "Final Color Cubes (jan).3mf", "projects/bambu-studio-orcaslicer/color-cubes-7x7-set.3mf")

SOURCES = [
    ("Single Cube (Design With Color Cubes!).f3d", "color-cube.f3d"),
    ("Color Cubes Case.f3d", "color-cubes-case-7x7.f3d"),
]

DESIGNER = "Isaac Lloyd"
LICENSE_NAME = "CC BY 4.0"
SITE = "https://designwithcolorcubes.org"

LICENSE_TXT = """Design With Color Cubes - 3D models, lid artwork and photos
Copyright (c) 2025-2026 Isaac Lloyd

Licensed under Creative Commons Attribution 4.0 International
(CC BY 4.0).  https://creativecommons.org/licenses/by/4.0/

You may print these, sell the prints, give them away, copy the files, change them and use
them for anything, including commercially, as long as you credit Isaac Lloyd and link to
https://designwithcolorcubes.org (and say if you changed them).

Full legal text: https://creativecommons.org/licenses/by/4.0/legalcode
"""

README_TXT = """DESIGN WITH COLOR CUBES - 7x7 set
https://designwithcolorcubes.org

A 3D-printable replica of Color Cubes, the 1930s designing toy: 49 cubes, a tray and a lid
with the original artwork printed into its top.

WHAT YOU NEED

  A printer that can print four colors in one job: a filament changer, a tool changer or
  several nozzles. Any brand works; the files are not tied to any printer or slicer.
  A print bed at least 211 x 211 mm for the lid. A printer with one nozzle that swaps four
  filaments also purges into a tower beside the lid: allow 246 x 211 mm for both (a 256 mm
  bed), with the slicer's purge tower set to 35 mm wide (the prime tower in Bambu Studio,
  OrcaSlicer and Cura; the wipe tower in PrusaSlicer). Some slicers start at 60 mm, which
  won't fit. The tray needs 206 x 206 mm; the cubes fit smaller beds (see the plates below).

WHAT TO PRINT

  color-cube   x 49    four colors
  tray-7x7     x 1     one color
  lid-7x7      x 1     four colors (already turned artwork-down, the way it should print)

  This lid is the set as it was first printed. The lid made on designwithcolorcubes.org/print/7x7
  is the same design with grooves between the cubes, so cubes of one color don't run together;
  get it there if you can.

THE FILES - the same three items in each format

  3mf/   Standard 3MF. Each item is one object whose parts are named by color
         (for example "lid-art-blue"). Opens in PrusaSlicer, OrcaSlicer, Bambu Studio,
         Cura, Snapmaker Orca, SuperSlicer and others. Bambu Studio and OrcaSlicer open
         every part on its filament: 1 white, 2 blue, 3 yellow, 4 red. Set up four
         filaments in the slicer before opening; with only one, everything prints in it.
           color-cubes-plate-49.3mf   all 49 cubes, 3 mm apart: 207 mm square, a 256 mm bed
                                      with the purge tower
           color-cubes-plate-25.3mf   25 cubes, 147 mm square, for 220 mm beds; print it twice,
                                      minus one. On a 180 mm bed use plates/cubes-4x4.3mf
                                      (16 cubes) four times, minus 15
  stl/   One STL per color part, for anything that reads STL. Load all of an item's files
         at once and, when asked, keep them as ONE object with several parts. In Cura, load
         them, select all and choose "Merge Models".
  obj/   One OBJ per item with a color (MTL) file beside it.
  projects/
         Slicer projects, already laid out on plates with colors and settings assigned.
         bambu-studio-orcaslicer/   the project the original set was printed from:
                                    three plates (lid, tray, 49 cubes), the lid without
                                    grooves. Made in Bambu Studio 2.4, so it needs Bambu
                                    Studio 2.4 or OrcaSlicer 2.5 or newer (OrcaSlicer 2.3
                                    opens it but can't slice it)
         More slicers' projects are welcome - send one in and it will be added here.

  A cube has eight parts: the four solid sides, and each split face as its dark half and
  the light triangle set into it (cube-split-by-blue and cube-split-by-yellow,
  cube-split-rw-red and cube-split-rw-white). In other slicers, and with STL and OBJ, give
  each part the filament its name says.

PRINT SETTINGS

  Filament      PLA in red, blue, yellow and white or beige - about 1 kg in all
  Layer height  0.2 mm
  Walls         2
  Infill        15%
  Supports      none, no raft
  Print time    about 33 hours in all

TIPS

  - The lid prints upside down, artwork on the bed. It saves a lot of filament on color
    changes and gives the artwork a smooth face. It needs no brim.
  - If your slicer can send color-change waste into the infill, turn that on for the cubes.
  - Swap the colors if you like. Any four will work.

SIZES

  Cube  26.95 mm         Tray  196 x 196 x 18 mm         Lid  200.3 x 200.3 x 33 mm

LICENSE

  CC BY 4.0 - see LICENSE.txt. Free to print, sell, give away and remix, as long as
  you credit Isaac Lloyd.
"""


def load_item(key):
    """Load an item's parts, place the item on the bed at the origin, and check every part."""
    title, flip, specs = ITEMS[key]
    parts = []
    for src, name, color in specs:
        mesh = trimesh.load(SRC / "3d Models" / src, force="mesh")
        # Fusion's OBJ export repeats each corner once per face, with its own normal.
        mesh.merge_vertices(merge_tex=True, merge_norm=True)
        parts.append([name, color, mesh])

    if flip:  # half a turn about X: the top goes to the bed, and nothing is mirrored
        turn = trimesh.transformations.rotation_matrix(np.pi, [1, 0, 0])
        for part in parts:
            part[2].apply_transform(turn)
    low = np.min([p[2].bounds[0] for p in parts], axis=0)
    for part in parts:
        part[2].apply_translation(-low)

    problems = []
    for name, _color, mesh in parts:
        size = mesh.bounds[1] - mesh.bounds[0]
        ok = bool(mesh.is_watertight and mesh.is_winding_consistent and mesh.volume > 0)
        print("  %-20s %6d faces  %-22s %s" % (name, len(mesh.faces),
              " x ".join("%g" % v for v in np.round(size, 2)), "closed solid" if ok else "NOT A CLOSED SOLID"))
        if not ok:
            problems.append(name)
    return title, parts, problems


def fmt(v):
    return ("%.5f" % v).rstrip("0").rstrip(".")


PAINT = {"white": "4", "blue": "8", "yellow": "0C", "red": "1C"}  # Bambu/Orca filaments 1-4
LID_SETTINGS = {"brim_type": "no_brim"}  # a brim would ring every cube on the lid's face


def write_3mf(path, title, parts, copies=None, paint=False, settings=None):
    """Standard 3MF (core specification): one object made of named, colored component meshes,
    once for each copy (copies: optional list of (x, y) offsets). Like site/js/print3d.js, it
    adds what Bambu Studio and OrcaSlicer read to open each part on its filament: a settings
    file naming each part's filament (and any settings for the object, such as no brim for a
    lid), and with paint=True their paint on the triangles."""
    names = list(COLORS)
    xml = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
           ' <metadata name="Title">%s</metadata>' % title,
           ' <metadata name="Designer">%s</metadata>' % DESIGNER,
           ' <metadata name="LicenseTerms">%s</metadata>' % LICENSE_NAME,
           ' <metadata name="Description">Design With Color Cubes, %s</metadata>' % SITE,
           ' <resources>',
           '  <basematerials id="1">']
    for name in names:
        xml.append('   <base name="%s" displaycolor="%sFF"/>' % (name.capitalize(), COLORS[name]))
    xml.append('  </basematerials>')
    ids = []
    for n, (name, color, mesh) in enumerate(parts, start=2):
        ids.append(n)
        extra = ' paint_color="%s"' % PAINT[color] if paint else ""
        xml.append('  <object id="%d" type="model" name="%s" pid="1" pindex="%d">' % (n, name, names.index(color)))
        xml.append('   <mesh>')
        xml.append('    <vertices>')
        xml.extend('     <vertex x="%s" y="%s" z="%s"/>' % tuple(fmt(c) for c in v) for v in mesh.vertices)
        xml.append('    </vertices>')
        xml.append('    <triangles>')
        xml.extend('     <triangle v1="%d" v2="%d" v3="%d"%s/>' % (*f, extra) for f in mesh.faces)
        xml.append('    </triangles>')
        xml.append('   </mesh>')
        xml.append('  </object>')
    # One parent object per copy: Bambu Studio and OrcaSlicer load each build item as an object
    # of its own, and each needs its filaments in the settings file.
    wholes = []
    for k, _at in enumerate(copies or [(0, 0)]):
        whole = max(ids) + 1 + k
        wholes.append(whole)
        xml.append('  <object id="%d" type="model" name="%s">' % (whole, title if not k else "%s %d" % (title, k + 1)))
        xml.append('   <components>')
        xml.extend('    <component objectid="%d"/>' % i for i in ids)
        xml.append('   </components>')
        xml.append('  </object>')
    xml.append(' </resources>')
    xml.append(' <build>')
    for whole, (x, y) in zip(wholes, copies or [(0, 0)]):
        xml.append('  <item objectid="%d" transform="1 0 0 0 1 0 0 0 1 %s %s 0"/>' % (whole, fmt(x), fmt(y)))
    xml.append(' </build>')
    xml.append('</model>')

    ext = lambda color: names.index(color) + 1
    cfg = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>']
    for k, whole in enumerate(wholes):
        cfg.append(' <object id="%d">' % whole)
        cfg.append('  <metadata key="name" value="%s"/>' % (title if not k else "%s %d" % (title, k + 1)))
        cfg.append('  <metadata key="extruder" value="%d"/>' % ext(parts[0][1]))
        for key, value in (settings or {}).items():
            cfg.append('  <metadata key="%s" value="%s"/>' % (key, value))
        for n, (name, color, _mesh) in zip(ids, parts):
            cfg.append('  <part id="%d" subtype="normal_part">' % n)
            cfg.append('   <metadata key="name" value="%s"/>' % name)
            cfg.append('   <metadata key="extruder" value="%d"/>' % ext(color))
            cfg.append('  </part>')
        cfg.append(' </object>')
    cfg.append('</config>')

    types = ('<?xml version="1.0" encoding="UTF-8"?>\n'
             '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
             '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
             '</Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Target="/3D/3dmodel.model" Id="rel0" '
            'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
            '</Relationships>')
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr("[Content_Types].xml", types)
        z.writestr("_rels/.rels", rels)
        z.writestr("3D/3dmodel.model", "\n".join(xml) + "\n")
        z.writestr("Metadata/model_settings.config", "\n".join(cfg) + "\n")


def write_obj(path, title, parts):
    """One OBJ with a group per part, and an MTL file giving each part its color."""
    path.parent.mkdir(parents=True, exist_ok=True)
    mtl = path.with_suffix(".mtl")
    used = sorted({color for _n, color, _m in parts}, key=list(COLORS).index)
    lines = ["# %s - %s, %s, %s" % (title, DESIGNER, LICENSE_NAME, SITE)]
    for color in used:
        r, g, b = (int(COLORS[color][i:i + 2], 16) / 255 for i in (1, 3, 5))
        lines += ["newmtl %s" % color, "Kd %.4f %.4f %.4f" % (r, g, b), ""]
    mtl.write_text("\n".join(lines), encoding="utf-8")

    out = ["# %s - %s, %s, %s" % (title, DESIGNER, LICENSE_NAME, SITE), "# units: millimetres",
           "mtllib %s" % mtl.name]
    offset = 1
    for name, color, mesh in parts:
        out += ["o %s" % name, "usemtl %s" % color]
        out.extend("v %s %s %s" % tuple(fmt(c) for c in v) for v in mesh.vertices)
        out.extend("f %d %d %d" % tuple(f + offset) for f in mesh.faces)
        offset += len(mesh.vertices)
    path.write_text("\n".join(out) + "\n", encoding="utf-8")


def make_zip(name, entries):
    """entries: list of (file on disk, path inside the zip)."""
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    path = DOWNLOADS / name
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for src, arc in entries:
            z.write(src, arc)
    print("wrote %s  (%.1f MB, %d files)" % (path.relative_to(ROOT).as_posix(), path.stat().st_size / 1e6, len(entries)))


def tree(folder):
    return [(p, p.relative_to(MODELS).as_posix()) for p in sorted((MODELS / folder).rglob("*")) if p.is_file()]


if __name__ == "__main__":
    for old in ("3mf", "stl", "obj", "projects", "source"):
        shutil.rmtree(MODELS / old, ignore_errors=True)
    for stray in MODELS.glob("*.3mf"):
        stray.unlink()
    MODELS.mkdir(exist_ok=True)

    bad = []
    for key in ITEMS:
        print(key)
        title, parts, problems = load_item(key)
        bad += problems
        write_3mf(MODELS / "3mf" / (key + ".3mf"), title, parts, settings=LID_SETTINGS if key.startswith("lid") else None)
        if key == "color-cube":
            # Ready-made plates of cubes, 3 mm apart: 49 for 256 mm beds and 25 for 220 mm beds, each with
            # room for a purge tower (the site's plates/ folder has 16 for 180 mm beds).
            side = max(p[2].bounds[1].max() for p in parts)
            for count, cols in ((49, 7), (25, 5)):
                step = side + 3
                spots = [(c * step, r * step) for r in range(cols) for c in range(cols)][:count]
                write_3mf(MODELS / "3mf" / ("color-cubes-plate-%d.3mf" % count),
                          "Color Cubes, plate of %d" % count, parts, spots)
        write_obj(MODELS / "obj" / (key + ".obj"), title, parts)
        for name, _color, mesh in parts:
            out = MODELS / "stl" / key / (name + ".stl")
            out.parent.mkdir(parents=True, exist_ok=True)
            mesh.export(out)

    (MODELS / PROJECT[1]).parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(PROJECT[0], MODELS / PROJECT[1])
    (MODELS / "source").mkdir(exist_ok=True)
    for src, dest in SOURCES:
        shutil.copyfile(SRC / src, MODELS / "source" / dest)
    (MODELS / "LICENSE.txt").write_text(LICENSE_TXT, encoding="utf-8")
    (MODELS / "README.txt").write_text(README_TXT, encoding="utf-8")

    notes = [(MODELS / "README.txt", "README.txt"), (MODELS / "LICENSE.txt", "LICENSE.txt")]
    # Only the zips made here: the rest of site/downloads/ belongs to other tools.
    for old in DOWNLOADS.glob("color-cubes-7x7-*.zip"):
        old.unlink()
    make_zip("color-cubes-7x7-set.zip", notes + tree("3mf") + tree("stl") + tree("obj") + tree("projects"))
    make_zip("color-cubes-7x7-3mf.zip", notes + tree("3mf"))
    make_zip("color-cubes-7x7-stl.zip", notes + tree("stl"))
    make_zip("color-cubes-7x7-obj.zip", notes + tree("obj"))
    make_zip("color-cubes-fusion-source.zip", [notes[1]] + tree("source"))

    if bad:
        print("\nNot closed solids:")
        for b in bad:
            print("  ", b)
        sys.exit(1)
