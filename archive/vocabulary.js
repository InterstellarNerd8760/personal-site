"use strict";

(async () => {
  const target = document.getElementById("vocabulary");
  const svgNamespace = "http://www.w3.org/2000/svg";

  async function load(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error("Vocabulary source unavailable");
    return response.json();
  }

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function mark(sheet, key, label, viewBox) {
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
    const symbol = document.createElementNS(svgNamespace, "use");
    symbol.setAttribute("href", "records/" + sheet + "#" + key);
    svg.append(symbol);
    return svg;
  }

  try {
    const [data, plan] = await Promise.all([load("records/vocabulary/index.json"), load("image-plan.json")]);
    const images = new Map(plan.records.map(record => [record.id, record]));
    const cards = [];

    function card(entry) {
      const article = element("article");
      article.id = entry.id;
      const heading = element("h3", entry.id);
      for (const id of entry.tokens || [entry.id]) {
        heading.append(mark(data.sheet, id, "Glyph " + id, "0 0 60 60"));
      }
      const samples = element("div");
      samples.className = "vocabulary-examples";
      for (const key of entry.examples) {
        samples.append(mark(data.sheet, key, data.illustrations[key], "0 0 120 60"));
      }
      for (const id of entry.images || []) {
        const source = images.get(id);
        const link = element("a");
        link.href = "images.html?record=" + encodeURIComponent(source.asset);
        const image = element("img");
        image.src = "records/" + source.asset;
        image.alt = source.title;
        image.loading = "lazy";
        link.append(image);
        samples.append(link);
      }
      const gloss = element("details");
      gloss.append(element("summary", "Reveal the gloss"), element("p", entry.label + ". " + entry.ambiguity));
      for (const id of entry.articles || []) {
        const link = element("a", id);
        link.href = "encyclopedia.html?article=" + encodeURIComponent(id);
        gloss.append(link, " ");
      }
      for (const id of entry.contrast_with || []) {
        const link = element("a", "Compare " + id);
        link.href = "#" + id;
        gloss.append(link, " ");
      }
      article.append(heading, samples, gloss);
      return article;
    }

    cards.push(element("h2", "Concepts"), ...data.entries.map(card));
    cards.push(element("h2", "Combinations"), ...data.statements.map(card));
    target.replaceChildren(...cards);
  } catch {
    target.textContent = "The illustrated vocabulary is temporarily unavailable. The structured record is linked above.";
  }
})();
