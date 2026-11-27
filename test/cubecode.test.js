import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE, MIN_SIZE, MAX_SIZE, toReadable, toCompact, toCompactV1, parseCode, compactLen, gridToId, turn
} from "../site/js/cubecode.js";

const QUADRANTS = "686w313-868w131-686w313-wwwwww6-313w686-131w868-313w686";
const QUADRANTS_COMPACT = "77RNP42PXF425QXNXI6TDZEJNCRAEPDI013X";

function randomGrid(cells) {
  return Array.from({ length: cells }, () => Math.floor(Math.random() * 12));
}

test("known example encodes both ways, and first-form links still open", () => {
  const p = parseCode(QUADRANTS);
  assert.equal(p.w, 7);
  assert.equal(p.h, 7);
  assert.equal(toCompactV1(p.grid, 7, 7), QUADRANTS_COMPACT);
  assert.equal(toReadable(parseCode(QUADRANTS_COMPACT).grid, 7, 7), QUADRANTS);
  const short = toCompact(p.grid, 7, 7);
  assert.ok(short.startsWith("1") && short.length < QUADRANTS_COMPACT.length, short);
  assert.equal(toReadable(parseCode(short).grid, 7, 7), QUADRANTS);
});

test("the short form is never longer than the first form, and much shorter for patterns", () => {
  for (let w = MIN_SIZE; w <= MAX_SIZE; w++) {
    for (let h = MIN_SIZE; h <= MAX_SIZE; h++) {
      for (let k = 0; k < 10; k++) {
        const g = randomGrid(w * h);
        assert.ok(toCompact(g, w, h).length <= toCompactV1(g, w, h).length);
      }
    }
  }
  // A 9x9 with four-way symmetry and a mostly blank 9x9 both shrink to well under half.
  const sym = parseCode("1b1b5b1b1-b5b1r1b5b-1b5b1b5b1-b1b5r5b1b-5r1rwr1r5-b1b5r5b1b-1b5b1b5b1-b5b1r1b5b-1b1b5b1b1");
  assert.ok(!sym.error);
  assert.ok(toCompact(sym.grid, 9, 9).length < 25, toCompact(sym.grid, 9, 9));
  const blank = new Array(81).fill(0);
  blank[40] = 5;
  assert.ok(toCompact(blank, 9, 9).length < 10, toCompact(blank, 9, 9));
});

test("every size 2x2 to 10x10 round-trips in both forms and any case", () => {
  for (let w = MIN_SIZE; w <= MAX_SIZE; w++) {
    for (let h = MIN_SIZE; h <= MAX_SIZE; h++) {
      const samples = [new Array(w * h).fill(0), new Array(w * h).fill(11)];
      for (let k = 0; k < 25; k++) samples.push(randomGrid(w * h));
      for (const g of samples) {
        const r = toReadable(g, w, h);
        const c = toCompact(g, w, h);
        const c1 = toCompactV1(g, w, h);
        assert.equal(c1.length, 2 + compactLen(w * h));
        for (const input of [r, r.toUpperCase(), c, c.toLowerCase(), c1, "#" + r]) {
          const p = parseCode(input);
          assert.ok(!p.error, input + " -> " + p.error);
          assert.equal(p.w, w);
          assert.equal(p.h, h);
          assert.equal(toReadable(p.grid, w, h), r);
        }
      }
    }
  }
});

test("compact lengths for the known editions", () => {
  assert.equal(compactLen(16), 12); // 4x4 -> 14 chars with prefix
  assert.equal(compactLen(36), 25); // 6x6 -> 27
  assert.equal(compactLen(49), 34); // 7x7 -> 36
  assert.equal(compactLen(81), 57); // 9x9 -> 59
});

test("all-white is image 0", () => {
  assert.equal(gridToId(new Array(49).fill(0)), 0n);
  assert.equal(toCompactV1(new Array(49).fill(0), 7, 7), "77" + "0".repeat(34));
  assert.equal(toReadable(parseCode(toCompact(new Array(49).fill(0), 7, 7)).grid, 7, 7), "wwwwwww-".repeat(6) + "wwwwwww");
});

test("readable leniency: spaces, underscores, short rows", () => {
  assert.equal(toReadable(parseCode("wb rb").grid, 2, 2), "wb-rb");
  assert.equal(toReadable(parseCode("wb__rb").grid, 2, 2), "wb-rb");
  const p = parseCode("wbr-w");
  assert.equal(p.filled, 2);
  assert.equal(toReadable(p.grid, p.w, p.h), "wbr-www");
});

test("errors", () => {
  assert.ok(parseCode("").error);
  assert.ok(parseCode("wb").error);                  // no dash -> compact -> bad size
  assert.ok(parseCode("ww-ww-ww-ww-ww-ww-ww-ww-ww-ww-ww").error); // 11 rows
  assert.ok(parseCode("wwwwwwwwwww-ww").error);      // 11 columns
  assert.ok(parseCode("wx-ww").error);               // bad character
  assert.ok(parseCode("ZZ1").error);                 // bad size prefix
  assert.ok(parseCode("canvas").error);              // reserved word is never a valid code
  assert.ok(parseCode("22" + "Z".repeat(compactLen(4))).error); // past last image
  assert.ok(parseCode("favicon.ico").error);
});

test("turn cycles diagonal faces clockwise and leaves solids alone", () => {
  assert.deepEqual([0, 1, 2, 3].map(turn), [0, 1, 2, 3]);
  assert.deepEqual([4, 5, 6, 7].map(turn), [5, 6, 7, 4]);
  assert.deepEqual([8, 9, 10, 11].map(turn), [9, 10, 11, 8]);
  assert.equal(CODE.length, 12);
});

import { underside, turnOver } from "../site/js/cubecode.js";

test("turning a tray over shows each cube's opposite face, mirrored left to right", () => {
  // Solids: red and white swap, blue and yellow swap.
  assert.deepEqual([0, 1, 2, 3].map(underside), [1, 0, 3, 2]);
  // Split faces trade color pairs, and the dark corner mirrors left to right.
  assert.equal(underside(4), 9);  // blue at TL -> red at TR
  assert.equal(underside(10), 7); // red at BR  -> blue at BL
  for (let d = 0; d < 12; d++) assert.equal(underside(underside(d)), d);
  // A row "w 1 r" (white, blue/yellow with blue TL, red) turns over to "w 6 r" reversed:
  // red becomes white and lands on the left, white becomes red on the right.
  const p = parseCode("w1r-yyy");
  assert.equal(toReadable(turnOver(p.grid, 3, 2), 3, 2), "w6r-bbb");
  // Turning over twice gives the original tray.
  const lid = parseCode("561y256-8w4y3w7-1277712-yy7b7yy-4377743-5w1y2w6-874y387");
  assert.deepEqual(turnOver(turnOver(lid.grid, 7, 7), 7, 7), lid.grid);
});
