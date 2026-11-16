"use strict";
const slides = Array.from(document.querySelectorAll(".slide"));
const prev = document.getElementById("prev");
const next = document.getElementById("next");
const progress = document.getElementById("progress");
let current = 0;
function show(i) {
  current = Math.max(0, Math.min(slides.length - 1, i));
  slides.forEach((s, j) => { s.hidden = j !== current; s.classList.toggle("is-active", j === current); s.setAttribute("aria-hidden", String(j !== current)); });
  prev.disabled = current === 0; next.disabled = current === slides.length - 1;
  progress.textContent = (current + 1) + " / " + slides.length;
  history.replaceState(null, "", "#" + (current + 1));
}
prev.addEventListener("click", () => show(current - 1));
next.addEventListener("click", () => show(current + 1));
document.addEventListener("keydown", e => {
  if (e.target.closest("input, textarea, select")) return;
  if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); show(current + 1); }
  if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); show(current - 1); }
  if (e.key === "Home") show(0);
  if (e.key === "End") show(slides.length - 1);
});
window.addEventListener("hashchange", () => { const i = parseInt(location.hash.slice(1), 10); if (Number.isInteger(i) && i >= 1 && i <= slides.length) show(i - 1); });
const start = parseInt(location.hash.slice(1), 10);
show(Number.isInteger(start) ? start - 1 : 0);
