Color Cube 3D model

Files
  color-cube.glb             glTF 2.0, textured with scans of an original Embossing Company set (texture built in)
  color-cube-printed.glb     same geometry with a 3D-printed look generated from the sliced layers
                             (0.2 mm layer lines, 0.45 mm skin lines, walls around the recess) plus fine
                             surface grain from the printed-cube scans; includes a normal map
  color-cube-flat.glb        same geometry with flat reference colors
  color-cube.obj/.mtl            OBJ of the original version (texture: textures-scan/atlas.png)
  color-cube-printed.obj/.mtl    OBJ of the printed version (textures-printed/atlas.png + atlas-normal.png)
  color-cube-flat.obj/.mtl       OBJ of the flat version (texture: textures-flat/atlas.png)
  textures-scan/, textures-printed/, textures-flat/
                             atlas (3x2: top, bottom, north / east, south, west) plus each face alone
  viewer.html                three.js viewer; serve this folder over http (it fetches the .glb files)

Dimensions (from an original cube)
  27.5 mm cube. On the two diagonal faces the light triangle (white on top, yellow on the bottom)
  is recessed 1 mm, inside a 1.7 mm raised rim along the two outer edges. The recess walls are the
  same color as the recessed triangle. Units in the files are metres (0.0275 = 27.5 mm).

Axes and faces (red side facing north)
  +Y up, -Z north, +X east.
  North red, East yellow, South white (cream), West blue.
  Top    red/white  - red triangle NW (raised), white triangle SE (recessed)
  Bottom blue/yellow - blue triangle NW (raised), yellow triangle SE (recessed)
  Each raised triangle borders the red and blue sides.

This is a visual model for renders and the website, not a print-ready solid. Corners are sharp;
the originals are slightly worn and rounded.
