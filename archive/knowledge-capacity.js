"use strict";

function contentMix(input) {
  const articles = input.articles * input.articleBytes;
  const photographs = input.photos * (54 + Math.ceil(input.edge * input.edge * input.depth / 8));
  return { articles, photographs, logical: articles + photographs + input.primer + input.vocabulary + input.metadata };
}

if (typeof module !== "undefined") module.exports = { contentMix };

if (typeof document !== "undefined") {
  const format = bytes => (bytes / 1_000_000).toLocaleString("en", { maximumFractionDigits: 3 }) + " MB";
  const preset = document.getElementById("capacity-preset");
  const capacity = document.getElementById("capacity-form");
  const mix = document.getElementById("content-mix");
  const summary = document.getElementById("knowledge-source-summary");
  const graph = document.getElementById("knowledge-projection");
  let expanded;
  const basis = document.getElementById("capacity-basis");
  const percentBasis = "Current estimate uses the selected overhead percentage.";
  const expandedOption = preset.querySelector('[value="expanded"]');
  expandedOption.disabled = true;
  function chooseCustom() {
    delete capacity.dataset.protectedBytes;
    preset.value = "custom";
    basis.textContent = percentBasis;
  }
  preset.addEventListener("change", () => {
    const sizes = { core: 100_000_000, expanded: expanded?.logical_bytes, extended: 64_000_000_000 };
    delete capacity.dataset.protectedBytes;
    basis.textContent = percentBasis;
    if (preset.value === "expanded" && expanded) {
      capacity.dataset.protectedBytes = expanded.protected_bytes;
      basis.textContent = "Curated preset uses the calculated per-record CAX1 and CAEC byte count. Edit content or the percentage to switch to the custom model.";
    }
    if (!sizes[preset.value]) {
      capacity.requestSubmit();
      return;
    }
    capacity.elements.logicalMB.value = sizes[preset.value] / 1_000_000;
    capacity.requestSubmit();
  });
  capacity.elements.logicalMB.addEventListener("input", chooseCustom);
  capacity.elements.correction.addEventListener("input", chooseCustom);
  mix.addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries([...new FormData(mix)].map(([name, value]) => [name, Number(value)]));
    const result = contentMix(data);
    if (result.logical > 1_000_000_000_000) {
      document.getElementById("content-mix-result").textContent = "The content mix exceeds the calculator’s range.";
      return;
    }
    chooseCustom();
    capacity.elements.logicalMB.value = result.logical / 1_000_000;
    capacity.requestSubmit();
    document.getElementById("content-mix-result").textContent =
      format(result.logical) + " total · " + format(result.articles) + " articles · " + format(result.photographs) + " photographs.";
  });

  fetch("knowledge/budget.json").then(response => {
    if (!response.ok) throw Error("Budget unavailable");
    return response.json();
  }).then(data => {
    expanded = data.scenarios.find(scenario => scenario.articles === 3000);
    expandedOption.disabled = !expanded;
    const maximum = Math.max(...data.scenarios.map(scenario => scenario.encoded_bytes));
    summary.textContent = data.articles + " current drafts · " + format(data.logical_source_bytes) + " source records.";
    for (const scenario of data.scenarios) {
      const row = document.createElement("div");
      const title = document.createElement("p");
      title.textContent = scenario.articles.toLocaleString("en") + " articles · " + format(scenario.logical_bytes) +
        " logical · " + format(scenario.protected_bytes) + " protected per copy · " + format(scenario.encoded_bytes) + " total";
      const track = document.createElement("div");
      track.className = "explain-track";
      track.setAttribute("aria-hidden", "true");
      for (const [bytes, cls] of [[scenario.logical_bytes, ""],
        [scenario.protected_bytes - scenario.logical_bytes, "explain-warn"],
        [scenario.redundant_copy_bytes, "explain-pending"]]) {
        const segment = document.createElement("span");
        segment.style.width = (100 * bytes / maximum) + "%";
        segment.className = cls;
        track.append(segment);
      }
      row.append(title, track);
      graph.append(row);
    }
  }).catch(() => {
    summary.textContent = "The study ledger is unavailable. The custom estimator still works.";
    preset.querySelector('[value="expanded"]').disabled = true;
  });
}
