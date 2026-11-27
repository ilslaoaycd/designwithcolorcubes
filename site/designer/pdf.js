// pdf.js — one printable page for a tray: the design, a QR code that opens it, its link and its
// code. A small PDF writer of its own (vector cubes, standard fonts, JPEG scans), so printing
// needs no library. Loaded only when someone prints or downloads a PDF. MIT licensed.
//
// Printing works like the Bike Archive torque sheets: the PDF loads into an off-screen iframe
// and that frame's print() opens the browser's dialog, where "Save as PDF" is also offered.

import { faceGeometry, RADIUS } from "/js/cubeface.js";
import { parseCode } from "/js/cubecode.js";
import { PAPERS } from "/js/paper.js";

// The page, in points: US Letter or A4 (opts.paper), set by makeTrayPdf. Everything is laid out
// from these, so either fits.
let PAGE_W = PAPERS.letter.w;
let PAGE_H = PAPERS.letter.h;
const M = 40;
const INK = [0.09, 0.094, 0.106];
const MUTED = [0.4, 0.41, 0.45];
const K = 0.5523; // Bézier handle length for a quarter circle

const n = (v) => (Math.round(v * 100) / 100).toString();
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const fill = (c) => `${n(c[0])} ${n(c[1])} ${n(c[2])} rg\n`;

/** Text for a PDF string in a standard font (WinAnsi), with the few non-ASCII characters we use. */
function pdfText(s) {
  const map = { "×": "\\327", "·": "\\267", "—": "\\227", "–": "\\226", "’": "\\222", "…": "\\205" };
  let out = "";
  for (const ch of s) {
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else if (map[ch]) out += map[ch];
    else if (ch.charCodeAt(0) < 128) out += ch;
    else out += "?";
  }
  return "(" + out + ")";
}

/** A page's drawing commands, written top-down (y grows downward) and flipped for PDF. */
function canvas() {
  let ops = "";
  const Y = (y) => PAGE_H - y;
  const api = {
    get ops() { return ops; },
    raw(s) { ops += s; },
    fill(c) { ops += fill(c); },
    rect(x, y, w, h) { ops += `${n(x)} ${n(Y(y + h))} ${n(w)} ${n(h)} re f\n`; },
    strokeRect(x, y, w, h, lw, c) { ops += `${n(lw)} w ${n(c[0])} ${n(c[1])} ${n(c[2])} RG ${n(x)} ${n(Y(y + h))} ${n(w)} ${n(h)} re S\n`; },
    roundRect(x, y, w, h, r) {
      if (r <= 0.01) { api.rect(x, y, w, h); return; }
      const k = K * r;
      ops += `${n(x + r)} ${n(Y(y))} m ${n(x + w - r)} ${n(Y(y))} l ` +
        `${n(x + w - r + k)} ${n(Y(y))} ${n(x + w)} ${n(Y(y + r - k))} ${n(x + w)} ${n(Y(y + r))} c ` +
        `${n(x + w)} ${n(Y(y + h - r))} l ${n(x + w)} ${n(Y(y + h - r + k))} ${n(x + w - r + k)} ${n(Y(y + h))} ${n(x + w - r)} ${n(Y(y + h))} c ` +
        `${n(x + r)} ${n(Y(y + h))} l ${n(x + r - k)} ${n(Y(y + h))} ${n(x)} ${n(Y(y + h - r + k))} ${n(x)} ${n(Y(y + h - r))} c ` +
        `${n(x)} ${n(Y(y + r))} l ${n(x)} ${n(Y(y + r - k))} ${n(x + r - k)} ${n(Y(y))} ${n(x + r)} ${n(Y(y))} c f\n`;
    },
    poly(pts) {
      ops += pts.map(([px, py], i) => `${n(px)} ${n(Y(py))} ${i ? "l" : "m"}`).join(" ") + " h f\n";
    },
    text(x, y, s, font, size, c = INK) {
      ops += `BT ${fill(c).trim()} /${font} ${n(size)} Tf ${n(x)} ${n(Y(y))} Td ${pdfText(s)} Tj ET\n`;
    },
    image(name, x, y, s) { ops += `q ${n(s)} 0 0 ${n(s)} ${n(x)} ${n(Y(y + s))} cm /${name} Do Q\n`; }
  };
  return api;
}

let FLAT = false;
/** One cube face as vectors: the color, its light triangle, rounded corners. */
function vectorFace(c, d, x, y, s, radius = RADIUS) {
  const g = faceGeometry(d, { flat: FLAT });
  c.fill(rgb(g.base));
  c.roundRect(x, y, s, s, radius * s);
  if (g.tri) {
    c.fill(rgb(g.light));
    c.poly(g.tri.map(([px, py]) => [x + px * s, y + py * s]));
  }
}

/** The site's mark: four cubes on a dark ground (tray 74-25). */
function mark(c, x, y, size) {
  const unit = size / 218;
  c.fill(rgb("#2B2320"));
  c.rect(x, y, size, size);
  parseCode("74-25").grid.forEach((d, i) => {
    vectorFace(c, d, x + (6 + (i % 2) * 106) * unit, y + (6 + Math.floor(i / 2) * 106) * unit, 100 * unit, 0);
  });
}

// Character widths (per 1000 units of font size) of the two standard fonts, for right-aligning
// and fitting text. Characters not listed count as 556, about the width of a digit.
const WIDTHS = {
  F1: { " ": 278, ".": 278, "/": 278, ":": 278, "-": 333, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
    k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, ",": 278 },
  F2: { " ": 278, "×": 584, C: 722, F: 611, T: 611, a: 556, b: 611, c: 556, e: 556, l: 278, o: 611, r: 389, s: 556, u: 611, y: 556 }
};
const textWidth = (s, font, size) => [...s].reduce((sum, ch) => sum + ((WIDTHS[font] || {})[ch] || 556), 0) * size / 1000;

/**
 * Build the PDF. opts:
 *   cols, rows        the area drawn, in cubes
 *   cells             [{ x, y, d }] looks inside that area
 *   tray              true for a tray (outline, QR code and link), false for a free table
 *   faces             null for solid cubes, or 12 JPEG scans [{ bytes, size }] by look
 *   flat              solid cubes with flat faces (no rim round the light triangle)
 *   title, date       the heading at the top left
 *   link              the short link: printed in lowercase beside the QR code, and clickable
 *   qr                { size, dark(r, c) } or null
 *   paper             "letter" (the default) or "a4"
 * Returns a Uint8Array.
 */
export function makeTrayPdf(opts) {
  FLAT = !!opts.flat;
  ({ w: PAGE_W, h: PAGE_H } = PAPERS[opts.paper] || PAPERS.letter);
  const c = canvas();
  const W = PAGE_W - 2 * M;
  const links = [];

  // Heading on the left, the mark and name on the right of the same line.
  c.text(M, M + 20, opts.title, "F2", 24);
  c.text(M, M + 38, opts.date, "F1", 10, MUTED);
  const name = "Color Cubes", nameSize = 13;
  const nameX = PAGE_W - M - textWidth(name, "F2", nameSize);
  c.text(nameX, M + 16, name, "F2", nameSize);
  mark(c, nameX - 8 - 22, M - 1, 22);

  // The tray: as wide as the margins allow, unless the page isn't tall enough for that.
  const top = M + 56;
  const QR = 76, GAP = 20;
  const footer = 22;
  const availH = PAGE_H - M - footer - (opts.tray ? QR + GAP : 0) - top;
  const cell = Math.min(W / opts.cols, availH / opts.rows);
  const gap = cell * 0.035;
  const tw = cell * opts.cols, th = cell * opts.rows;
  const tx = M + (W - tw) / 2;
  const used = new Set();
  for (const { x, y, d } of opts.cells) {
    const X = tx + x * cell + gap / 2, Y = top + y * cell + gap / 2, s = cell - gap;
    if (opts.faces) { used.add(d); c.image("Im" + d, X, Y, s); }
    else vectorFace(c, d, X, Y, s);
  }
  if (opts.tray) c.strokeRect(tx - 1, top - 1, tw + 2, th + 2, 1.4, [0, 0, 0]);

  // The QR code with the link beside it, both opening the tray.
  if (opts.tray && opts.link) {
    const text = opts.link.toLowerCase();
    const size = 12;
    const by = top + th + GAP;
    // Line the QR code up with the tray's left edge, unless the link would then run off the page.
    const qx = Math.max(M, Math.min(tx, PAGE_W - M - QR - 16 - textWidth(text, "F1", size)));
    if (opts.qr) {
      const q = opts.qr, m = QR / q.size;
      c.fill([0, 0, 0]);
      for (let r = 0; r < q.size; r++) {
        // One rectangle per run of dark modules in a row.
        for (let col = 0; col < q.size; col++) {
          if (!q.dark(r, col)) continue;
          let end = col;
          while (end + 1 < q.size && q.dark(r, end + 1)) end++;
          c.rect(qx + col * m, by + r * m, (end - col + 1) * m + 0.05, m + 0.05);
          col = end;
        }
      }
      links.push({ x: qx, y: by, w: QR, h: QR, url: opts.link });
    }
    const lx = opts.qr ? qx + QR + 16 : qx;
    const ly = by + QR / 2 + size * 0.35;
    c.text(lx, ly, text, "F1", size);
    links.push({ x: lx, y: ly - size, w: textWidth(text, "F1", size), h: size * 1.4, url: opts.link });
  }

  c.text(M, PAGE_H - M + 14, "designwithcolorcubes.org  ·  Free to print and share, CC BY 4.0", "F1", 8, MUTED);

  return assemble(c.ops, opts.faces ? [...used].map((d) => ({ name: "Im" + d, ...opts.faces[d] })) : [], links);
}

/** Write the objects, the cross-reference table and the trailer. */
function assemble(content, images, links = []) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (data) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (num, body) => { offsets[num] = length; push(`${num} 0 obj\n`); body(); push("\nendobj\n"); };

  const imgBase = 8;
  const xobjects = images.map((im, i) => `/${im.name} ${imgBase + i} 0 R`).join(" ");
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  // Clickable areas (y measured down from the top, as everywhere else here).
  const annots = links.map((l) =>
    `<< /Type /Annot /Subtype /Link /Border [0 0 0] /Rect [${n(l.x)} ${n(PAGE_H - l.y - l.h)} ${n(l.x + l.w)} ${n(PAGE_H - l.y)}] /A << /S /URI /URI ${pdfText(l.url)} >> >>`
  ).join(" ");
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents 4 0 R ${annots ? `/Annots [${annots}] ` : ""}` +
    `/Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >>${xobjects ? ` /XObject << ${xobjects} >>` : ""} >> >>`));
  const body = enc.encode(content);
  obj(4, () => { push(`<< /Length ${body.length} >>\nstream\n`); push(body); push("\nendstream"); });
  obj(5, () => push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  obj(6, () => push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
  obj(7, () => push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>"));
  images.forEach((im, i) => obj(imgBase + i, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${im.size} /Height ${im.size} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`);
    push(im.bytes);
    push("\nendstream");
  }));
  const count = imgBase + images.length;
  const xref = length;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) table += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  push(table + `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/**
 * Open the PDF in the browser's print dialog: load it into an off-screen iframe (it needs a
 * real size for Chrome's PDF viewer to render), wait for the viewer to paint, then print().
 */
export function printPdf(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const frame = document.createElement("iframe");
    Object.assign(frame.style, { position: "fixed", right: "100%", bottom: "100%", width: "600px", height: "800px", border: "0" });
    frame.setAttribute("aria-hidden", "true");
    frame.onload = () => {
      setTimeout(() => {
        try { frame.contentWindow.focus(); frame.contentWindow.print(); }
        catch (e) { window.open(url, "_blank"); } // some browsers won't print a PDF frame; show it instead
      }, 1000);
      setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); resolve(); }, 60000);
    };
    document.body.appendChild(frame);
    frame.src = url;
  });
}
