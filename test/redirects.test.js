import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { resolve } from "../workers/redirects/src/index.js";

const READABLE = "686w313-868w131-686w313-wwwwww6-313w686-131w868-313w686";
const COMPACT = "77RNP42PXF425QXNXI6TDZEJNCRAEPDI013X";
const DESIGNER = "https://designwithcolorcubes.org/designer/";

async function go(path, method = "GET") {
  return worker.fetch(new Request("https://colorcubes.org" + path, { method }));
}

test("root goes to the main site", async () => {
  const res = await go("/");
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("Location"), "https://designwithcolorcubes.org/");
});

test("compact code (as a QR code sends it, in capitals) lands on the readable designer URL", async () => {
  const res = await go("/" + COMPACT);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), DESIGNER + READABLE);
});

test("lowercase compact and uppercase readable both work", async () => {
  assert.equal(resolve("/" + COMPACT.toLowerCase()).location, DESIGNER + READABLE);
  assert.equal(resolve("/" + READABLE.toUpperCase()).location, DESIGNER + READABLE);
  assert.equal(resolve("/" + READABLE + "/").location, DESIGNER + READABLE);
});

test("other sizes", () => {
  assert.equal(resolve("/wbwb-bwbw").location, DESIGNER + "wbwb-bwbw");
  assert.equal(resolve("/44" + "0".repeat(12)).location, DESIGNER + "wwww-wwww-wwww-wwww");
  assert.equal(resolve("/aa" + "0".repeat(70)).location.split("/").pop().split("-").length, 10);
});

test("bad codes go to the designer with ?invalid", () => {
  const r = resolve("/not-a-code");
  assert.equal(r.status, 302);
  assert.equal(r.location, DESIGNER + "?invalid=not-a-code");
});

test("robots, favicon and methods", async () => {
  assert.equal((await go("/robots.txt")).status, 200);
  assert.equal(resolve("/favicon.ico").location, "https://designwithcolorcubes.org/favicon.ico");
  assert.equal(resolve("/apple-touch-icon.png").location, "https://designwithcolorcubes.org/apple-touch-icon.png");
  assert.equal((await go("/" + COMPACT, "POST")).status, 405);
});

// Hostnames that mirror the main site.
async function from(host, path) {
  return worker.fetch(new Request("https://" + host + path));
}

test("the .com and both www hostnames 301 to the .org, keeping path and query", async () => {
  for (const host of ["designwithcolorcubes.com", "www.designwithcolorcubes.com", "www.designwithcolorcubes.org"]) {
    const res = await from(host, "/print/?size=7");
    assert.equal(res.status, 301, host);
    assert.equal(res.headers.get("Location"), "https://designwithcolorcubes.org/print/?size=7", host);
    assert.equal((await from(host, "/")).headers.get("Location"), "https://designwithcolorcubes.org/", host);
  }
});

test("a mirror hostname never treats its path as a tray code", async () => {
  const res = await from("designwithcolorcubes.com", "/designer/wbwb-bwbw");
  assert.equal(res.headers.get("Location"), DESIGNER + "wbwb-bwbw");
});

test("www.colorcubes.org is a short-link host", async () => {
  const res = await from("www.colorcubes.org", "/" + COMPACT);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), DESIGNER + READABLE);
});

test("box links go to the box designer with their size, code and words", async () => {
  const { presetSpec, encode, query } = await import("../site/js/boxcode.js");
  const spec = presetSpec("text", 7, 5);
  const token = encode(spec);
  const res = await go("/b/" + token + query(spec));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), "https://designwithcolorcubes.org/box/7x5/" + token + query(spec));
  assert.equal(resolve("/b/!!").location, "https://designwithcolorcubes.org/designer/?invalid=b%2F!!");
  assert.equal(resolve("/b/zzzz").location, "https://designwithcolorcubes.org/box/");
});
