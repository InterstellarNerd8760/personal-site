"use strict";

const get = id => document.getElementById(id);
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}
async function loadJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url);
  return response.json();
}
async function initAtlas() {
  const [plan, catalog] = await Promise.all([loadJSON("image-plan.json"), loadJSON("records/catalog.json")]);
  const records = new Map(catalog.records.map(record => [record.path, record]));
  const dialog = get("image-detail");
  function showDetail(slot, updateUrl = false) {
    const record = records.get(slot.asset);
    if (!record) return;
    get("image-detail-id").textContent = slot.id;
    get("image-detail-title").textContent = record.title;
    const content = get("image-detail-content");
    content.replaceChildren();
    const image = node("img"); image.src = "records/" + slot.asset; image.alt = record.alt || record.title;
    content.append(image, node("p", record.caption || record.summary));
    const credit = [record.photographer, record.date].filter(Boolean).join(" · ");
    if (credit) content.append(node("p", credit, "image-detail-credit"));
    for (const [heading, value] of [["Editorial status",record.status],["Rights",record.rights],["Processing",record.derivative]]) {
      if (value) content.append(node("h3",heading),node("p",value));
    }
    const links = node("ul");
    const original = node("a","Archived JPEG"); original.href = "records/" + slot.asset;
    const li = node("li"); li.append(original); links.append(li);
    for (const source of record.sources || []) {
      let url;
      try {url = new URL(source.url);if(url.protocol !== "https:")continue;}catch{continue;}
      const a = node("a",source.label || "Source"); a.href = url.href; a.rel = "noopener noreferrer"; a.target = "_blank";
      const item = node("li"); item.append(a); links.append(item);
    }
    content.append(node("h3","Source and provenance"),links);
    if (!dialog.open) dialog.showModal();
    if (updateUrl) {const url = new URL(location.href);url.searchParams.set("record",slot.asset);history.replaceState({}, "", url);}
  }
  dialog.addEventListener("close",()=>{const url=new URL(location.href);url.searchParams.delete("record");history.replaceState({}, "", url);});
  function imageCard(slot) {
    const record = records.get(slot.asset);
    const card = node("article", "", "atlas-image-item");
    if (!slot.asset) {
      const placeholder = node("div", slot.id, "atlas-item-placeholder");
      placeholder.style.aspectRatio = "4 / 3";
      placeholder.style.height = "auto";
      card.append(placeholder, node("h3", slot.title), node("p", "Planned"));
      return card;
    }
    const link = node("a");
    link.href = "images.html?record=" + encodeURIComponent(slot.asset);
    link.addEventListener("click",event=>{if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();showDetail(slot,true);});
    const photo = node("img");
    photo.src = "records/" + slot.asset;
    photo.alt = record.alt;
    photo.loading = "lazy";
    link.append(photo, node("h3", slot.id + " · " + record.title));
    const source = node("a", record.photographer);
    source.href = record.sources[0].url;
    card.append(link, node("p", record.summary), source);
    return card;
  }
  const categories = [{id:"all",name:"All categories"}, ...plan.categories];
  const filters = get("atlas-filters");
  const search = get("image-search");
  let selected = categories[0];
  function renderPlan() {
    for (const button of filters.children) {
      button.setAttribute("aria-pressed", String(button.dataset.category === selected.id));
    }
    const all = selected.id === "all";
    get("scope-label").textContent = all ? "Search all subjects" : "Search within " + selected.name;
    const query = search.value.trim().toLowerCase();
    const matches = plan.records.filter(slot => (all || slot.category === selected.id) &&
      [slot.id, slot.title, records.get(slot.asset)?.title, records.get(slot.asset)?.summary, records.get(slot.asset)?.photographer, slot.category, slot.kind].join(" ").toLowerCase().includes(query));
    get("atlas-count").textContent = matches.length + (matches.length === 1 ? " subject" : " subjects");
    get("photo-gallery").replaceChildren(...matches.map(imageCard));
    get("photo-gallery").hidden = matches.length === 0;
    get("empty-result").hidden = matches.length > 0;
    get("reset-category").hidden = matches.length > 0 || all;
  }
  filters.replaceChildren();
  for (const category of categories) {
    const button = node("button", category.name, "atlas-filter");
    button.type = "button";
    button.dataset.category = category.id;
    button.onclick = () => { selected = category; renderPlan(); };
    filters.append(button);
  }
  search.oninput = renderPlan;
  get("reset-category").onclick = () => { selected = categories[0]; renderPlan(); search.focus(); };
  renderPlan();
  const requested = new URL(location.href).searchParams.get("record");
  const target = plan.records.find(slot => slot.asset && (slot.asset === requested || slot.id === requested));
  if (target) showDetail(target);
}
initAtlas().catch(() => { get("atlas-error").hidden = false; });
