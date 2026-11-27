import { test } from "node:test";
import assert from "node:assert/strict";
import { remember, prune, readSaved, writeSaved, toBackup, fromBackup, isBlank, contentKey, AUTO_LIMIT } from "../site/designer/saved.js";

const tray = (code) => ({ mode: "tray", w: code.split("-")[0].length, h: code.split("-").length, code });
const A = tray("rwrw-wrwr"), B = tray("rwrw-wrw1"), C = tray("bbbb-yyyy");

test("editing a design keeps one entry that follows the changes", () => {
  let r = remember([], A, { now: 1 });
  assert.ok(r.created);
  const id = r.id;
  r = remember(r.items, B, { cur: id, now: 2 });
  assert.equal(r.items.length, 1);
  assert.equal(r.id, id);
  assert.equal(r.items[0].code, B.code);
  assert.equal(r.items[0].updated, 2);
  // Nothing changed: nothing to write.
  assert.equal(remember(r.items, B, { cur: id, now: 3 }).changed, false);
});

test("Save freezes a design; changing it afterwards starts a new entry", () => {
  let r = remember([], A, { keep: true, name: "Mine", now: 1 });
  const saved = r.id;
  assert.equal(r.items[0].saved, true);
  r = remember(r.items, B, { cur: saved, name: "Mine", now: 2 });
  assert.equal(r.items.length, 2);
  assert.notEqual(r.id, saved);
  const frozen = r.items.find((i) => i.id === saved);
  assert.equal(frozen.code, A.code);
  assert.equal(r.items.find((i) => i.id === r.id).name, "Mine");
  // Saving the same design twice, or undoing back to it, reuses the entry.
  assert.equal(remember(r.items, A, { keep: true, now: 3 }).changed, false);
  assert.equal(remember(r.items, A, { now: 3 }).id, saved);
});

test("old unsaved designs are pruned, saved ones stay", () => {
  let items = [{ id: "keep", name: "", saved: true, created: 0, updated: 0, ...C }];
  const L = "wryb12345678";
  for (let i = 0; i < AUTO_LIMIT + 5; i++) items.push({ id: "a" + i, name: "", saved: false, created: i + 1, updated: i + 1, ...tray(L[i % 12] + L[Math.floor(i / 12) % 12] + "-ww") });
  const out = prune(items);
  assert.equal(out.filter((i) => !i.saved).length, AUTO_LIMIT);
  assert.ok(out.some((i) => i.id === "keep"));
  assert.ok(!out.some((i) => i.id === "a0"), "the oldest went first");
});

test("blank designs aren't worth keeping", () => {
  assert.ok(isBlank(tray("ww-ww")));
  assert.ok(!isBlank(A));
  assert.ok(isBlank({ mode: "free", cells: [] }));
  assert.ok(!isBlank({ mode: "free", cells: [[0, 0, 3]] }));
});

test("the list survives storage, and a backup restores without duplicates", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  const free = { mode: "free", cells: [[-3, 2, 5], [0, 0, 11]] };
  let r = remember([], A, { keep: true, now: 1 });
  r = remember(r.items, free, { now: 2 });
  writeSaved(storage, r.items);
  const back = readSaved(storage);
  assert.equal(back.length, 2);
  assert.deepEqual(back.map(contentKey).sort(), r.items.map(contentKey).sort());

  const file = toBackup(back);
  assert.equal(fromBackup(back, file).added, 0);
  const into = fromBackup([], file);
  assert.equal(into.added, 2);
  assert.ok(fromBackup([], "not json").error);
  // Bad entries are dropped, not trusted.
  const bad = JSON.stringify({ items: [{ id: "x", mode: "tray", code: "zz-zz" }, { id: "y", mode: "free", cells: [[0, 0, 99]] }] });
  const res = fromBackup([], bad);
  assert.equal(res.added, 1);
  assert.deepEqual(res.items[0].cells, []);
});
