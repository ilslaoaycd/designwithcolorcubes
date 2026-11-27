// saved.js — the designs kept in this browser: the list, how an entry is matched, pruned, backed
// up and restored. No DOM here, so the tests run it in Node. MIT licensed.
//
// How saving works (designer.js drives it):
// - Whatever you change is saved as you go, as one entry per design, which follows your edits.
// - Save (the button, Ctrl S) and Share freeze the entry as it is: it's marked saved and never
//   changes again, except its name. Changing the tray after that starts a new entry.
// - A design laid down whole (a preset, Random, Clear, a link someone sent) isn't saved until you
//   change it, so trying things out doesn't fill the list.
// - Entries that were never saved are pruned oldest first past AUTO_LIMIT. Saved ones stay.

import { parseCode, MIN_SIZE, MAX_SIZE } from "/js/cubecode.js";

export const SAVED_KEY = "colorcubes:designs:v1";
export const AUTO_LIMIT = 60;
export const SAVED_LIMIT = 1000;

/** What makes two designs the same: the tray code, or every cube on the free table. */
export function contentKey(e) {
  return e.mode === "tray" ? `t:${e.code}` : `f:${JSON.stringify(e.cells)}`;
}

/** True for a design not worth keeping: a tray of plain white, or an empty table. */
export function isBlank(e) {
  return e.mode === "tray" ? !/[^w-]/.test(e.code) : !e.cells.length;
}

export function newId() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Date.now().toString(36) + "-" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

const face = (d) => Number.isInteger(d) && d >= 0 && d < 12;
const int = Number.isInteger;

/** One entry checked and cleaned, or null if it isn't a design. Used on load and on restore. */
export function clean(e) {
  if (!e || typeof e !== "object" || typeof e.id !== "string" || !e.id) return null;
  const out = {
    id: e.id.slice(0, 64),
    name: typeof e.name === "string" ? e.name.slice(0, 80) : "",
    saved: !!e.saved,
    created: int(e.created) ? e.created : Date.now(),
    updated: int(e.updated) ? e.updated : Date.now(),
    mode: e.mode === "free" ? "free" : "tray"
  };
  if (out.mode === "tray") {
    const p = parseCode(String(e.code || ""));
    if (p.error || p.w < MIN_SIZE || p.h < MIN_SIZE || p.w > MAX_SIZE || p.h > MAX_SIZE) return null;
    out.w = p.w;
    out.h = p.h;
    out.code = String(e.code);
  } else {
    if (!Array.isArray(e.cells)) return null;
    out.cells = e.cells.filter((c) => Array.isArray(c) && int(c[0]) && int(c[1]) && face(c[2])).map((c) => [c[0], c[1], c[2]]);
  }
  return out;
}

export function readSaved(storage) {
  try {
    const data = JSON.parse(storage.getItem(SAVED_KEY) || "null");
    if (!data || !Array.isArray(data.items)) return [];
    return data.items.map(clean).filter(Boolean);
  } catch (e) {
    return [];
  }
}

/** Write the list. Throws if the browser refuses (storage full or blocked). */
export function writeSaved(storage, items) {
  storage.setItem(SAVED_KEY, JSON.stringify({ v: 1, items }));
}

/** Newest first; past the limits, drop the oldest that were never saved (then the oldest saved). */
export function prune(items, autoLimit = AUTO_LIMIT, savedLimit = SAVED_LIMIT) {
  const sorted = [...items].sort((a, b) => b.updated - a.updated);
  let auto = 0, saved = 0;
  return sorted.filter((e) => (e.saved ? ++saved <= savedLimit : ++auto <= autoLimit));
}

/**
 * Put the design on screen into the list. `cur` is the id of the entry being edited, if any.
 * Returns { items, id, created } or null when nothing needed writing.
 * - A saved entry never changes: editing one starts a new entry.
 * - With no entry, an entry with the same design is reused, so undoing back to a design, or
 *   saving twice, doesn't make a copy.
 * - `keep` (Save, Share) marks the entry saved.
 */
export function remember(items, snap, { cur = null, keep = false, name = "", now = Date.now() } = {}) {
  const k = contentKey(snap);
  // The entry this design goes in: the one being edited, unless it's saved and the design has
  // moved on since; failing that, one that already holds this exact design.
  let e = cur ? items.find((i) => i.id === cur) : null;
  if (e && e.saved && contentKey(e) !== k) e = null;
  if (!e) e = items.find((i) => contentKey(i) === k) || null;
  if (e && contentKey(e) === k && (!keep || e.saved)) return { items, id: e.id, created: false, changed: false };
  const next = items.map((i) => ({ ...i }));
  if (e) {
    const t = next.find((i) => i.id === e.id);
    Object.assign(t, snapFields(snap), { updated: now });
    if (keep) t.saved = true;
    return { items: prune(next), id: t.id, created: false, changed: true };
  }
  const entry = { id: newId(), name, saved: !!keep, created: now, updated: now, ...snapFields(snap) };
  next.push(entry);
  return { items: prune(next), id: entry.id, created: true, changed: true };
}

function snapFields(s) {
  return s.mode === "tray"
    ? { mode: "tray", w: s.w, h: s.h, code: s.code, cells: undefined }
    : { mode: "free", cells: s.cells, w: undefined, h: undefined, code: undefined };
}

/** A backup file's text. */
export function toBackup(items) {
  return JSON.stringify({ app: "designwithcolorcubes", kind: "designs", v: 1, exported: new Date().toISOString(), items }, null, 1);
}

/** Merge a backup into the list: entries already here (same id, or the same design) are skipped. */
export function fromBackup(items, text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return { error: "That file isn't a designs backup." }; }
  const incoming = Array.isArray(data) ? data : data && Array.isArray(data.items) ? data.items : null;
  if (!incoming) return { error: "That file isn't a designs backup." };
  const ids = new Set(items.map((i) => i.id));
  const keys = new Set(items.map(contentKey));
  const added = [];
  for (const raw of incoming) {
    const e = clean(raw);
    if (!e || ids.has(e.id) || keys.has(contentKey(e))) continue;
    ids.add(e.id);
    keys.add(contentKey(e));
    added.push(e);
  }
  return { items: prune([...items, ...added], Infinity, Infinity), added: added.length };
}
