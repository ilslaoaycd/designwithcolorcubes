// set-picker.js — step 1 of "Print a set" on the home page: how many cubes across and down,
// drawn to scale in their tray inside the lid's outline, with what the printer has to hold.
// Next goes to the box designer (/box/7x7?set=1), which leads on to the files.
// MIT licensed (see LICENSE).

import { lidSize, traySize, beds, cubePlates, CUBE, TRAY } from "./print3d.js";
import { faceShapes, PRINTED_FLAT } from "./cubeface.js";
import { parseCode } from "./cubecode.js";
import { makeDesigns } from "./designs.js";

const $ = (id) => document.getElementById(id);
const KEY = "colorcubes:set";
const HOURS_7x7 = 33;        // the first 7 × 7 set, cubes, tray and lid (docs/rendering.md)
const GRAMS_PER_CUBE = 14;   // per cube on a four-color plate, purges included: 49 cubes come to 704 g in
                             // the Bambu Studio project, 713 g in OrcaSlicer (X1C) and 550-620 g in
                             // PrusaSlicer, against about 5.6 g a cube in one color

let set = { cols: 7, rows: 7 };
try { set = { ...set, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (e) { /* private mode */ }
const fromQuery = new URLSearchParams(location.search).get("size")?.match(/^(\d+)x(\d+)$/);
if (fromQuery) set = { cols: +fromQuery[1], rows: +fromQuery[2] };
const ok = (n) => Number.isInteger(n) && n >= 2 && n <= 10;
if (!ok(set.cols) || !ok(set.rows)) set = { cols: 7, rows: 7 };

// The design shown in the tray for each square size: the ones from the home page's row.
const FEATURED = {
  4: "b12b-1yy2-4yy3-b43b",
  5: "b3y4b-3yry4-yrrry-2yry1-b2y1b",
  6: "bbbbbb-b1yy2b-byrryb-byrryb-b4yy3b-bbbbbb",
  7: "b87r87b-6b1y2b5-713b428-rybbbyr-642b135-7b4y3b8-b56r56b",
  8: "57578686-75756868-57578686-75756868-68687575-86865757-68687575-86865757",
  9: "ww7rrr8ww-w7rbbbr8w-7rbyyybr8-rbyybyybr-rbybbbybr-rbyybyybr-6rbyyybr5-w6rbbbr5w-ww6rrr5ww",
  10: "wwww78wwww-www7rr8www-ww7rbbr8ww-w7rbyybr8w-7rbyyyybr8-6rbyyyybr5-w6rbyybr5w-ww6rbbr5ww-www6rr5www-wwww65wwww"
};
/** A design for the tray: the featured one, or else the most colorful made-up one (most of the
    four colors, then fewest solid faces). */
export function featured(cols, rows) {
  if (cols === rows && FEATURED[cols]) return FEATURED[cols];
  const score = (code) => {
    const { grid } = parseCode(code);
    const colors = new Set();
    for (const d of grid) {
      if (d < 4) colors.add(d);
      else colors.add(d < 8 ? 2 : 0).add(d < 8 ? 3 : 1);
    }
    return colors.size * 1000 - grid.filter((d) => d < 4).length;
  };
  return makeDesigns(cols, rows).map((d) => d.code).sort((a, b) => score(b) - score(a))[0];
}

/** The tray full of cubes inside the lid's outline, to scale. */
function traySVG(cols, rows, code) {
  const l = lidSize(cols, rows), t = traySize(cols, rows);
  const pad = 6;
  const W = l.w + 2 * pad, H = l.h + 2 * pad;
  const ox = pad + (l.w - t.w) / 2, oy = pad + (l.h - t.h) / 2;
  const p = parseCode(code);
  let cubes = "";
  const s = CUBE - 1.2;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = ox + TRAY.wall + TRAY.play / 2 + c * CUBE + 0.6, y = oy + TRAY.wall + TRAY.play / 2 + r * CUBE + 0.6;
    cubes += faceShapes(p.grid[r * cols + c], x, y, s, { palette: PRINTED_FLAT, edge: false, radius: 0.06 });
  }
  return `<svg viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" role="img" aria-label="A ${cols} by ${rows} tray of cubes inside the outline of its lid, to scale.">
    <rect x="${pad}" y="${pad}" width="${l.w.toFixed(1)}" height="${l.h.toFixed(1)}" rx="4" class="lid-line"/>
    <rect x="${ox.toFixed(1)}" y="${oy.toFixed(1)}" width="${t.w.toFixed(1)}" height="${t.h.toFixed(1)}" rx="2" class="tray-body"/>
    ${cubes}
  </svg>`;
}

function render() {
  const { cols, rows } = set;
  const n = cols * rows;
  $("set-cols").value = cols;
  $("set-rows").value = rows;
  if ($("any-shape")) $("set-rows").disabled = !$("any-shape").checked;
  const l = lidSize(cols, rows), t = traySize(cols, rows);
  const b = beds(cols, rows);
  const fits = b.square;
  const plates = cubePlates(n, fits || b.four[0]);
  const hours = Math.max(1, Math.round((HOURS_7x7 * n) / 49));
  const mm = (v) => v.toFixed(0);
  const square = cols === rows;
  $("square-note").textContent = square
    ? "The 1930s sets came in 4 × 4, 7 × 7 and 9 × 9. Square sets are easiest to design for, but any shape from 2 to 10 cubes a side works."
    : `${cols === 8 ? "An" : "A"} ${cols} × ${rows} set works too, with a box to match. Square sets have more ready-made designs, so they're the easier start.`;
  $("needs").innerHTML = `
    <p class="need-main">${n} cubes need a printer bed of at least <b>${b.four[0]} × ${b.four[1]} mm</b>${fits ? `: a ${fits} mm bed or bigger.` : `, bigger than most printers have. Try a smaller set.`}</p>
    <p>That leaves room beside the lid for the tower a printer with one nozzle purges into between colors, with the slicer’s purge tower set to 35 mm wide (the prime tower in Bambu Studio, OrcaSlicer and Cura; the wipe tower in PrusaSlicer). Some slicers start at 60 mm, which won’t fit. A printer with a nozzle for each color, or the lid in one color, needs ${b.one[0]} × ${b.one[1]} mm.</p>
    <p>The lid is the biggest piece at ${mm(l.w)} × ${mm(l.h)} × ${mm(l.height)} mm, the tray ${mm(t.w)} × ${mm(t.h)} × ${TRAY.height} mm, and the cubes fit on ${plates.count} plate${plates.count === 1 ? "" : "s"}. Allow about ${Math.round((n * GRAMS_PER_CUBE) / 10) * 10} g of filament for the cubes and ${hours} hours of printing in all.</p>`;
  $("tray-svg").innerHTML = traySVG(cols, rows, featured(cols, rows));
  $("tray-cap").textContent = `${n} cubes in their tray, inside the outline of the lid. Drawn to scale.`;
  $("set-next").href = `/box/${cols}x${rows}?set=1`;
  try { localStorage.setItem(KEY, JSON.stringify(set)); } catch (e) { /* ignore */ }
}

export function startSetPicker() {
  if (!$("chooser")) return;
  // Square sets unless asked: the rows follow the columns until the box is ticked.
  const any = $("any-shape");
  if (any) {
    any.checked = set.cols !== set.rows;
    any.addEventListener("change", () => {
      if (!any.checked) set = { cols: set.cols, rows: set.cols };
      render();
    });
  }
  for (const id of ["set-cols", "set-rows"]) {
    for (let n = 2; n <= 10; n++) $(id).add(new Option(String(n), String(n)));
    $(id).addEventListener("change", () => {
      const n = Number($(id).value);
      set = any && !any.checked ? { cols: n, rows: n } : { cols: Number($("set-cols").value), rows: Number($("set-rows").value) };
      render();
    });
  }
  render();
}
