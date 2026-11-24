/* Human-side multimedia archive reader; no generated HTML from record text. */
"use strict";
const byId = (id) => document.getElementById(id);
const nav = byId("record-nav");
const panel = byId("reader-content");
let groups = [], records = [], current = -1, sequence = 0;

function element(tag, text, className) {
  const e = document.createElement(tag);
  if (text !== null && text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}
function clear(target) { target.replaceChildren(); }
function safeExternal(url) {
  try { const candidate = new URL(url); return /^https?:$/.test(candidate.protocol) ? candidate.href : null; }
  catch { return null; }
}
function renderParagraphs(raw, path) {
  clear(panel);
  if (path.endsWith("raster-example.txt")) {
    panel.append(element("p", "These eight lines represent a grid of 64 pixels. The format is already explained to human readers; it is not self-decoding."));
    panel.append(element("pre", raw, "reader-code"));
    return;
  }
  const blocks = raw.trim().split(/\n\s*\n/);
  blocks.forEach((block, index) => {
    const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    if (index === 0 && lines.length === 1 && lines[0] === lines[0].toUpperCase()) return;
    if (lines.every((line) => line.startsWith("- "))) {
      const list = element("ul");
      lines.forEach((line) => list.append(element("li", line.slice(2))));
      panel.append(list);
    } else if (lines.length === 1 && lines[0] === lines[0].toUpperCase() && lines[0].length < 90) {
      panel.append(element("h3", lines[0]));
    } else {
      panel.append(element("p", lines.join(" ")));
    }
  });
}
const narrow = matchMedia("(max-width:700px)");
function sizeContents() { byId("contents").open = !narrow.matches; }
sizeContents();
narrow.addEventListener("change", sizeContents);
function renderMedia(record) {
  clear(panel);
  const figure = element("figure", null, "media-figure");
  const source = "records/" + record.path;
  if (record.media_type.startsWith("image/") && record.media_type !== "image/x-portable-graymap") {
    const image = element("img");
    image.src = source; image.alt = record.alt || record.title; image.loading = "lazy";
    const full = element("a"); full.href = source; full.append(image); figure.append(full);
  } else if (record.media_type.startsWith("audio/")) {
    const audio = element("audio");
    audio.controls = true; audio.preload = "metadata"; audio.src = source;
    audio.setAttribute("aria-label", record.title);
    figure.append(audio);
  } else {
    panel.append(element("p", "No preview available. Open the original record to inspect this file."));
    return;
  }
  if (record.caption && record.caption !== record.summary) figure.append(element("figcaption", record.caption));
  if (record.photographer) figure.append(element("figcaption", [record.photographer, record.date].filter(Boolean).join(" · ")));
  panel.append(figure);
  panel.append(element("p", "This is a digital development asset. Independent physical decoding remains a separate experiment.", "media-note"));
}
function renderSources(record) {
  const target = byId("reader-sources");
  clear(target);
  const links = Array.isArray(record.sources) ? record.sources : [];
  if (!links.length) return;
  target.append(element("h3", "Sources and provenance"));
  if (record.derivative) target.append(element("p", record.derivative));
  const list = element("ul");
  links.forEach((source) => {
    const url = safeExternal(source.url);
    if (!url) return;
    const item = element("li");
    const link = element("a", source.label || url);
    link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
    item.append(link); list.append(item);
  });
  target.append(list);
}
function navigation(search = "") {
  clear(nav);
  const query = search.trim().toLowerCase();
  let shown = 0;
  groups.forEach((group) => {
    const matches = records.filter((record) => record.group === group.id &&
      [record.path, record.title, record.summary].join(" ").toLowerCase().includes(query));
    if (!matches.length) return;
    nav.append(element("p", group.label, "reader-chapter"));
    matches.forEach((record) => {
      const button = element("button", record.title, "record-nav-link");
      button.type = "button"; button.dataset.path = record.path;
      button.setAttribute("aria-current", records[current]?.path === record.path ? "page" : "false");
      button.addEventListener("click", () => display(record.path, true));
      nav.append(button); shown++;
    });
  });
  if (!shown) nav.append(element("p", "No matching records.", "reader-loading"));
}
async function display(path, push = false) {
  const index = records.findIndex((record) => record.path === path);
  if (index === -1) return;
  const request = ++sequence;
  current = index;
  const record = records[index];
  byId("record-title").textContent = record.title;
  byId("record-summary").textContent = record.summary;
  byId("record-category").textContent = (groups.find((group) => group.id === record.group) || {}).label || record.group;
  byId("record-count").textContent = (index + 1) + " / " + records.length;
  byId("record-raw").href = "records/" + record.path;
  byId("record-prev").disabled = index === 0;
  byId("record-next").disabled = index === records.length - 1;
  const details = byId("record-details");
  clear(details);
  [record.media_type, record.status || "Unreviewed", record.rights || "Rights unknown"].forEach((value) =>
    details.append(element("span", value)));
  renderSources(record);
  for (const button of nav.querySelectorAll("[data-path]")) {
    button.setAttribute("aria-current", button.dataset.path === path ? "page" : "false");
  }
  if (push) {
    if (narrow.matches) byId("contents").open = false;
    const heading = byId("record-title");
    heading.focus({preventScroll:true});
    heading.scrollIntoView({behavior:"instant", block:"start"});
    const url = new URL(location.href);
    url.searchParams.set("record", record.path);
    history.pushState({}, "", url);
  }
  clear(panel);
  panel.append(element("p", "Loading the selected record…", "reader-loading"));
  try {
    if (record.media_type.startsWith("image/") && record.media_type !== "image/x-portable-graymap" ||
        record.media_type.startsWith("audio/")) {
      renderMedia(record);
    } else if (record.media_type === "text/plain" || record.media_type === "text/csv") {
      const response = await fetch("records/" + record.path);
      if (!response.ok) throw new Error("Missing record");
      const text = await response.text();
      if (request === sequence) renderParagraphs(text, record.path);
    } else {
      clear(panel);
      panel.append(element("p", "This record is included and verified but needs a specialist viewer. Use the original file link."));
    }
  } catch (error) {
    if (request === sequence) {
      clear(panel);
      panel.append(element("p", "Unable to load this record. The downloadable ZIP retains the source file."));
    }
  }
}
async function init() {
  try {
    const results = await Promise.all([fetch("downloads/manifest.json"), fetch("records/catalog.json")]);
    if (results.some((response) => !response.ok)) throw new Error("Index unavailable");
    const manifest = await results[0].json(), catalog = await results[1].json();
    if (!Array.isArray(manifest.files) || !Array.isArray(catalog.records) || !Array.isArray(catalog.groups)) {
      throw new Error("Invalid catalog");
    }
    groups = catalog.groups;
    const known = new Map(catalog.records.map((record) => [record.path, record]));
    records = manifest.files.filter((file) => file.path.startsWith("content/") && file.path !== "content/catalog.json")
      .map((file) => {
        const path = file.path.slice(8), meta = known.get(path) || {};
        return Object.assign({path, media_type:file.media_type, title:path.split("/").pop().replace(/-/g, " "),
          summary:"Archive source record.", group:path.split("/")[0]}, meta);
      })
      .sort((a,b) => {
        const ia = groups.findIndex((group) => group.id === a.group);
        const ib = groups.findIndex((group) => group.id === b.group);
        return (ia < 0 ? 100 : ia) - (ib < 0 ? 100 : ib) || a.title.localeCompare(b.title);
      });
    if (!records.length) throw new Error("No records");
    navigation();
    const requested = new URL(location.href).searchParams.get("record");
    await display(records.some((record) => record.path === requested) ? requested : records[0].path);
  } catch (error) {
    nav.textContent = "Unable to load the collection. Download the source archive from the home page.";
    clear(panel); panel.append(element("p", "The archive index is unavailable."));
  }
}
byId("library-search").addEventListener("input", (event) => navigation(event.target.value));
byId("record-prev").addEventListener("click", () => records[current-1] && display(records[current-1].path, true));
byId("record-next").addEventListener("click", () => records[current+1] && display(records[current+1].path, true));
addEventListener("popstate", () => {
  const path = new URL(location.href).searchParams.get("record");
  display(records.some((record) => record.path === path) ? path : records[0]?.path);
});
init();
