// home.js — the landing page's moving parts: choosing the size of a set, and the 3D printed cube
// (loaded as it nears the screen).

import { startSetPicker } from "./set-picker.js";

startSetPicker();

// The printed cube in the print section: printed finish only, no switch. three.js is about
// 700 KB, so it loads as the cube nears the screen.
const printCube = document.getElementById("print-cube");
if (printCube && "IntersectionObserver" in window) {
  const seen = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    seen.disconnect();
    try {
      const { startCube } = await import("./cube3d.js");
      await startCube(printCube, "printed", () => {}, { only: ["printed"] });
    } catch (err) {
      printCube.querySelector(".status").textContent = "The 3D cube didn’t load. Reload the page to try again.";
    }
  }, { rootMargin: "300px 0px" });
  seen.observe(printCube);
}
