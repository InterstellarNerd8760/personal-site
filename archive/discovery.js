"use strict";

(async () => {
  const controls = document.getElementById("readout-case");
  const status = document.getElementById("readout-result");
  const before = document.getElementById("readout-before");
  const after = document.getElementById("readout-after");
  const labels = {
    unknown_bit_phase: "Unknown starting bit phase",
    three_bit_slip_between_slots: "Three-bit slip between slots",
    "48_symbol_scratch": "48-symbol scratch",
    complementary_copy_damage: "Complementary damage in two copies",
    third_copy_supplies_missing_slot: "Third copy supplies the missing slot",
    same_slot_lost_in_both_copies: "Same slot lost in both copies",
    both_map_bookends_missing: "Both physical maps missing",
    logical_index_missing: "Logical index missing",
  };

  try {
    const response = await fetch("surface-study.json");
    if (!response.ok) throw Error("No sampled study");
    const data = await response.json();

    function paint(container, slots, count) {
      const cells = Array.from({ length: count }, () => null);
      const bitsPerSlot = data.slot_bytes * 8;
      for (const slot of slots) {
        const position = Math.max(0, Math.round(slot.bit_offset / bitsPerSlot));
        if (position < cells.length) cells[position] = slot;
      }
      container.setAttribute("role", "img");
      container.setAttribute("aria-label", cells.filter(Boolean).length + " verified or intact slot positions across " + count + " display cells.");
      const elements = cells.map(slot => {
        const cell = document.createElement("span");
        cell.className = !slot ? "missing" : slot.corrected_symbols ? "fixed" :
          slot.role === "map" ? "map" : slot.id === data.damage_target_id ? "photo" : "normal";
        cell.title = slot ? slot.role + " " + slot.id + ", block " + (slot.index + 1) : "No verified slot";
        return cell;
      });
      container.replaceChildren(...elements);
    }

    function showCase() {
      const active = data.cases[controls.value];
      after.replaceChildren();
      for (const [index, slots] of active.slots_after.entries()) {
        const heading = document.createElement("h3");
        heading.textContent = "Readout " + (index + 1);
        const grid = document.createElement("div");
        grid.className = "surface-grid";
        paint(grid, slots, Math.ceil(active.readouts[index].bytes / data.slot_bytes));
        after.append(heading, grid);
      }
      const recovered = active.records.length + " records verified, totaling " +
        active.logical_bytes_recovered.toLocaleString("en") + " bytes.";
      const mapStatus = active.map_status === "verified" ? " Physical slot map verified." :
        " No verified physical slot map. Completeness is unknown.";
      const missing = active.missing_ids.length ? " Missing record IDs: " + active.missing_ids.join(", ") + "." : "";
      status.textContent = recovered + mapStatus + (active.logical_index_recovered ? "" : " Logical index unavailable.") + missing;
    }

    if (data.geometry) {
      const geometry = data.geometry;
      document.getElementById("surface-geometry").textContent =
        geometry.width_um / 1000 + " × " + geometry.height_um / 1000 + " mm modeled at " +
        geometry.pitch_um + " μm pitch. One obscured row changed " +
        geometry.changed_sample_bits + " sampled bits. The reader returned " +
        geometry.records_after + " of " + geometry.records_before + " records from that copy and " +
        geometry.combined_records + " with a second usable copy.";
    }
    paint(before, data.slots_before, data.slots_before.length);
    controls.replaceChildren(...Object.entries(labels).map(([key, label]) => new Option(label, key)));
    controls.value = "complementary_copy_damage";
    controls.disabled = false;
    controls.addEventListener("change", showCase);
    showCase();
  } catch {
    status.textContent = "The sampled readout study is unavailable. See the recovery specification for the procedure.";
  }
})();
