/* Interactive human tutorial. The conventions are NOT inferred from the marks. */
"use strict";
(() => {
  const original = [
    "00010000","00111000","01111100","11111110",
    "00011000","00011000","00011000","00000001"
  ].join("");
  let bits = original.split(""), scan = "row";
  const grid = document.getElementById("decoded-grid");
  const stream = document.getElementById("bit-sequence");
  const description = document.getElementById("pixel-description");
  const result = document.getElementById("decoder-result");
  const rows = document.getElementById("scan-row");
  const columns = document.getElementById("scan-column");
  if (!grid || !stream || !rows || !columns) return;
  function redraw() {
    stream.textContent = bits.join("").match(/.{1,8}/g).join("\n");
    rows.classList.toggle("selected", scan === "row");
    rows.setAttribute("aria-pressed", String(scan === "row"));
    columns.classList.toggle("selected", scan === "column");
    columns.setAttribute("aria-pressed", String(scan === "column"));
    result.textContent = scan === "row" ?
      "Row-first: the first eight symbols form the top row, left to right." :
      "Column-first: the first eight symbols form the left column, top to bottom. Notice the changed image.";

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const index = scan === "row" ? y * 8 + x : x * 8 + y;
        const position = y * 8 + x;
        const button = grid.children[position] || document.createElement("button");
        button.type = "button";
        button.className = "decoded-pixel" + (bits[index] === "1" ? " lit" : "");
        button.setAttribute("aria-label", "Row " + (y+1) + ", column " + (x+1) +
          ". Bit " + (index+1) + " is " + bits[index] + ". Toggle this bit.");
        button.title = "Encoded bit #" + (index+1);
        button.onclick = () => {
          bits[index] = bits[index] === "1" ? "0" : "1";
          redraw();
          description.textContent = "Changed encoded symbol #" + (index+1) +
            " at row " + (y+1) + ", column " + (x+1) + ".";
        };
        if (!button.parentNode) grid.append(button);
      }
    }
  }
  rows.addEventListener("click", () => { scan = "row"; redraw(); });
  columns.addEventListener("click", () => { scan = "column"; redraw(); });
  document.getElementById("scan-reset").addEventListener("click", () => {
    scan = "row"; bits = original.split("");
    description.textContent = "Original 64-bit example restored.";
    redraw();
  });
  redraw();
  fetch("records/primer/raster-example.txt").then((response) => {
    if (!response.ok) throw new Error("Missing example");
    return response.text();
  }).then((text) => {
    const sample = text.split(/\s+/).filter(Boolean);
    if (sample.length === 8 && sample.every((line) => /^[01]{8}$/.test(line))) {
      bits = sample.join("").split(""); redraw();
    }
  }).catch(() => {
    description.textContent = "Using the bundled example while the archive source is unavailable.";
  });
})();
