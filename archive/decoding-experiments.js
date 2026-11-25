"use strict";

(() => {
  const number = document.getElementById("binary-number");
  const reading = document.getElementById("binary-reading");
  function count() {
    const value = Number(number.value);
    const bits = value.toString(2).padStart(4, "0");
    const sum = [...bits].map((bit, index) => Number(bit) * 2 ** (3 - index));
    reading.textContent = value + " = " + bits + "₂ · " + sum.join(" + ");
  }
  number.addEventListener("input", count);
  count();

  const channels = ["red", "green", "blue"].map(color => document.getElementById("channel-" + color));
  const swatch = document.getElementById("channel-swatch");
  const channelOutput = document.getElementById("channel-values");
  function paint() {
    const values = channels.map(channel => Number(channel.value));
    swatch.style.backgroundColor = "rgb(" + values.join(",") + ")";
    const neutral = values.every(value => value === values[0]);
    channelOutput.textContent = values.join(", ") + (neutral ? " · neutral" : " · unequal channels");
  }
  channels.forEach(channel => channel.addEventListener("input", paint));
  paint();

  const original = [0, 1, 1, 0, 0, 1, 1, 0];
  let received = original.slice();
  const group = document.getElementById("hamming-bits");
  const result = document.getElementById("hamming-result");
  const assessment = document.getElementById("hamming-assessment");
  const buttons = original.map((_, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", () => {
      received[index] ^= 1;
      readCodeword();
    });
    group.append(button);
    return button;
  });

  function readCodeword() {
    let syndrome = 0;
    let overall = 0;
    received.forEach((bit, index) => {
      overall ^= bit;
      if (bit && index < 7) syndrome ^= index + 1;
      const position = index + 1;
      buttons[index].textContent = String(bit);
      buttons[index].setAttribute("aria-label", "Position " + position + ", value " + bit + ". Toggle bit.");
      buttons[index].setAttribute("aria-pressed", String(bit !== original[index]));
    });
    const prefix = "Syndrome " + syndrome + " · " + (overall ? "odd" : "even") + " overall parity";
    if (!overall && syndrome) {
      result.textContent = prefix + " · detected inconsistent word.";
      assessment.textContent = "The decoder returns no data.";
      return;
    }
    const corrected = received.slice();
    const position = overall ? syndrome || 8 : 0;
    if (position) corrected[position - 1] ^= 1;
    const data = [2, 4, 5, 6].map(index => corrected[index]).join("");
    const operation = position ? " · flipped position " + position : "";
    result.textContent = prefix + operation + " · data " + data + ".";
    assessment.textContent = data === "1011" ?
      "The decoded value matches the example." :
      "The decoder accepted different data. This damage exceeded the guarantee.";
  }
  document.getElementById("hamming-reset").addEventListener("click", () => {
    received = original.slice();
    readCodeword();
  });
  readCodeword();
})();
