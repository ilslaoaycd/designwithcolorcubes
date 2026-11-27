# Tray code format

How a tray of Color Cubes is written as text, so it can go in a link or a QR code.
The reference implementation is [`site/js/cubecode.js`](../site/js/cubecode.js), tested by `test/cubecode.test.js`.

A tray's short link is `https://colorcubes.org/{code}`. It redirects to the designer at
`https://designwithcolorcubes.org/designer/{readable code}`.

## Tray codes

### Faces

Every cube shows one of 12 looks. Each look is a digit 0–11 with a one-character code:

| Digit | Code | Look |
|---|---|---|
| 0 | `w` | Solid white (cream) |
| 1 | `r` | Solid red |
| 2 | `y` | Solid yellow |
| 3 | `b` | Solid blue |
| 4–7 | `1 2 3 4` | Blue/yellow face. The blue triangle's square corner is at top-left, top-right, bottom-right or bottom-left (clockwise). |
| 8–11 | `5 6 7 8` | Red/white face, by the red triangle's corner, in the same order |

Rule of thumb: letters are solid faces and numbers are diagonal faces. Adding 4 to a blue/yellow code gives the red/white code with its colored corner in the same spot.

### Colors 

| Name | Hex |
|---|---|
| Red | `#C0272D` |
| White (cream) | `#F4ECD8` |
| Blue (navy) | `#1E2A5A` |
| Yellow | `#E3B23C` |

These are the on-screen colors. 

### Tray sizes

Trays can be 2–10 columns × 2–10 rows, and don't have to be square. Known editions:

| Set | Tray | Notes |
|---|---|---|
| No. 4 | 4×4 (16) | |
| No. 14 | 6×6 (36) | **Inferred** from lid designs; the cube count isn't documented |
| No. 34 | 7×7 (49) | **Designer default.** Box 8 × 8 × 1-1/8 in. |
| No. 44 | 9×9 (81) | Lid 10.5 × 10 in |
| "Design with Color Cubes" lid | 7×7 (49) | Set number unknown |

### Readable form (canonical for URLs people see)

- One code character per cube, rows top to bottom, with a `-` between rows.
- The number of groups is the row count, and the longest group is the column count.
- Example 7×7 (the "quadrants" photo): `686w313-868w131-686w313-wwwwwww-313w686-131w868-313w686`
- Canonical output is lowercase.

When parsing, any case is accepted. Spaces and underscores count as dashes, and repeated separators collapse. A row shorter than the longest is filled with `w` at its end. Fewer than 2 or more than 10 rows or columns is an error.

### Image number

The grid read as one base-12 number, row by row from the top-left cube (most significant) to the bottom-right cube (ones place). All white is image 0. The largest image number is 12^(w·h) − 1.

### Compact form, first version (still read)

```
[w][h][image number in base 36, zero-padded to L characters]
```

- `w` and `h` are single base-36 digits: `2`–`9`, and `A` for 10. So `77` is 7×7, `44` is 4×4, `AA` is 10×10, and `64` is 6 columns × 4 rows.
- `L` is the smallest length with 36^L ≥ 12^(w·h). It's fixed for each size, so codes for a given size are always the same length.
- Canonical output is uppercase. Parsing ignores case.
- Base 36 rather than base 62 so the whole URL fits QR **alphanumeric** mode, which needs capital letters. See "QR codes" below.

### Short form (what links and QR codes use now)

```
1[one base-36 number]
```

The leading `1` marks it: a first-form compact code always starts with the column count, `2`–`9` or `A`. The number is an exact arithmetic code (any length; the shortest that lands inside the final interval) of, in order:

1. columns − 2 and rows − 2, each 1 of 9 equally likely;
2. the layout, 1 of 11 equally likely: no symmetry, mirrored left–right, mirrored top–bottom, turned 180°, both mirrors, turned 90° (all four turns), all eight symmetries, mirrored on the main diagonal, on the other diagonal, on both diagonals, or **crop** (white everywhere outside a rectangle). The 90° and diagonal layouts are only for square trays. Mirroring or turning a tray also turns each split cube: its dark corner moves to its mirrored or turned place;
3. for crop, the rectangle: left (1 of `w`), top (1 of `h`), width − 1 (1 of `w − left`), height − 1 (1 of `h − top`);
4. the cubes, row by row from the top-left (only inside the rectangle for crop). A cube that the layout makes a copy of an earlier cube is skipped. Each coded cube's look uses these counts, which start at zero and go up after every coded cube: `1 + 2·seen[s] + 8·afterLeft[left][s] + 8·belowUp[up][s] + 2·(s = left) + 2·(s = up)`, where `left` and `up` are the looks to the left and above (or "none" at an edge).

The encoder tries every layout the tray has and keeps the shortest. If the first form would be shorter (only for trays with no pattern at all), it uses that instead, so a link never gets longer than it was. Symmetric designs come out at half the length or less: the 7×7 quadrants tray is `1M97I3YK9WTVBDI8AYBDJZNFH` (25 characters, was 36).

### Telling the forms apart

If the code contains any separator (`-`, space or `_`), it's readable. Otherwise it's compact. The word `canvas` is never a valid code (`c` = 12 isn't a valid size), so `/designer/canvas` can't collide with a tray.

### Lengths

| Tray | Compact code | Readable code |
|---|---|---|
| 2×2 | 5 | 5 |
| 4×4 | 14 | 19 |
| 6×6 | 27 | 41 |
| 7×7 | 36 | 55 |
| 9×9 | 59 | 89 |
| 10×10 | 72 | 109 |

The lengths above are the first form, and the most a code ever takes; the short form is usually well under them.

The reference implementation is `site/js/cubecode.js`, which exports `parseCode`, `toReadable`, `toCompact` (short form), `toCompactV1` (first form), `compactLen`, `gridToId`, `idToGrid`, `turn`, `faceName`, `faceColors`, `COLORS`, `EDITIONS` and `CODE`. If you port the format to another language, keep the tests in `test/cubecode.test.js` passing against it.

## QR codes

- QR codes always encode `https://colorcubes.org/{code}` **in capitals**, for example `HTTPS://COLORCUBES.ORG/77RNP42PXF425QXNXI6TDZEJNCRAEPDI013X`. Domains ignore case, and the Worker parses codes in any case.
- Alphanumeric mode, medium error correction (survives about 15% damage).
- The designer offers both formats and defaults to compact.

| Tray | Compact link QR | Readable link QR |
|---|---|---|
| 4×4 | 25×25 | 29×29 |
| 6×6 | 29×29 | 33×33 |
| 7×7 | 29×29 | 33×33 |
| 9×9 | 33×33 | 37×37 |
| 10×10 | 37×37 | 41×41 |

Uppercase base 36 beats base 62 for QR codes: at 7×7, a base-62 compact link would need byte mode and a 33×33 code. Ideas for later: printable QR cards to put in gift boxes, or a "download QR as PNG/SVG" button (the page can generate it client-side).
