// files.js — the Files page: a folded group's list is put in place when it's first opened (it waits
// in a <template>, see tools/build_downloads.py), and Download all zips a section's files in the
// browser (print3d.js's zip writer, loaded then), with the license and a read-me. Every file also
// downloads on its own. MIT licensed (see LICENSE).

const LICENSE = `Design With Color Cubes - models, artwork and pictures
Copyright (c) 2025-2026 Isaac Lloyd

Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).
https://creativecommons.org/licenses/by/4.0/

Use them for anything, commercial use included, as long as you credit Isaac Lloyd and link to
https://designwithcolorcubes.org (and say if you changed them).
`;

const size = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

async function downloadAll(button) {
  const section = button.closest(".files-section");
  // The open lists, and those still waiting in their <template>.
  const links = [...section.querySelectorAll("a[download]"), ...[...section.querySelectorAll("template")].flatMap((t) => [...t.content.querySelectorAll("a[download]")])];
  const label = button.innerHTML;
  button.setAttribute("aria-busy", "true");
  button.disabled = true;
  try {
    const entries = [];
    let done = 0, bytes = 0;
    // A few at a time: quick, without opening hundreds of requests at once.
    const queue = links.slice();
    const worker = async () => {
      for (let a; (a = queue.shift());) {
        const url = new URL(a.getAttribute("href"), location.href);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url.pathname}: ${res.status}`);
        const data = new Uint8Array(await res.arrayBuffer());
        entries.push([decodeURIComponent(url.pathname.replace(/^\/(downloads|files)\//, "")), data]);
        done++; bytes += data.length;
        button.textContent = `Getting ${done} of ${links.length} (${size(bytes)})…`;
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    button.textContent = "Zipping…";
    const { zip } = await import("/js/print3d.js");
    const title = section.querySelector("h2").textContent;
    const readme = `DESIGN WITH COLOR CUBES - ${title}\nhttps://designwithcolorcubes.org/downloads/#${section.id}\n\n${links.length} files. Every one is also on the page above, to download on its own.\n`;
    const blob = new Blob([await zip([["README.txt", readme], ["LICENSE.txt", LICENSE], ...entries])], { type: "application/zip" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `color-cubes-${section.id}.zip` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    button.innerHTML = label;
  } catch (e) {
    button.textContent = "That didn’t work. Try again, or take the files one at a time.";
    setTimeout(() => { button.innerHTML = label; }, 6000);
  } finally {
    button.removeAttribute("aria-busy");
    button.disabled = false;
  }
}

// "toggle" doesn't bubble, so listen while it's on its way down.
document.addEventListener("toggle", (e) => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.open) return;
  const t = d.querySelector(":scope > template");
  if (t) t.replaceWith(t.content);
}, true);

document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-all]");
  if (b) downloadAll(b);
});
