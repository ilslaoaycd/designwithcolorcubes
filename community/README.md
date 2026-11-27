# Community models

Models for Color Cubes made by people other than Isaac: remixes, other cubes, trays, storage, lids and anything else that goes with the set. Isaac's own set is in [`../models/`](../models/).

Each model has its own folder in `models/`:

```
community/models/<short-name>/
  README.md            who made it, the license, print settings, what it's for
  <short-name>.3mf     preferred: one object, parts named by color
  stl/                 one STL per part, named by color: drawer-red.stl, drawer-white.stl
  source/              optional: the file you made it in (.f3d, .FCStd, .scad, .blend, .step)
  photo.jpg            a photo of a real print, metadata stripped
```

`<short-name>` is lowercase words joined by hyphens, saying what the model is: `drawer-7x7`, `rounded-cube`, `tray-8x8-stacking`.

## Before you send one

- Every part is a closed mesh: watertight, no holes or flipped normals.
- Millimetres, at the size it prints. A cube is 26.95 mm; the 7×7 tray is 196 × 196 × 18 mm.
- A 3MF, plus an STL of each part.
- Prints without supports or a raft, or the README says why not.
- Multicolor models are split into one part per filament, named by color (`cube-red.stl`, `lid-art-blue.stl`), with the same names inside the 3MF.
- A photo of a real print from these exact files, with its metadata stripped (`magick in.jpg -strip photo.jpg`).
- Each file under about 25 MB.
- Your own work, or a remix whose license allows it, with a link to the original.

The full guide is in [CONTRIBUTING.md](../CONTRIBUTING.md). If you'd rather not use Git, send the files with the [model form](https://github.com/ilslaoaycd/designwithcolorcubes/issues/new?template=model_submission.yml) and someone will put them in place for you.

## License

Models here are under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), the same as the rest of the project, unless their README says CC0. Credit goes to the author named in each README.

## README template

Copy this into `community/models/<short-name>/README.md`:

```markdown
# <Name of the model>

<One or two sentences: what it is and what it's for.>

![A print of it](photo.jpg)

- **Made by:** <your name or handle, with a link if you like>
- **License:** CC BY 4.0   <!-- or CC0 -->
- **Based on:** <link to the original and its author, if it's a remix; otherwise "original">
- **Fits:** <which set or tray size, for example "the 7×7 set">

## Files

| File | Print | Color |
|---|---|---|
| `<short-name>.3mf` | 1 | all parts |
| `stl/<short-name>-red.stl` | 1 | red |

## Print settings

- Printer and slicer it was tested on:
- Filament:
- Layer height:
- Walls:
- Infill:
- Supports: none
- Print time:

## Notes

<Anything that went wrong, tolerances, how it goes together.>
```
