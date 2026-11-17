/* Personal X Network Atlas — snapshot graph, November 2026.
   Only the center account and observed first-degree links are drawn.
   No X API, visitor accounts, scraping, or inferred cross-account edges. */
(() => {
  "use strict";
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.getElementById("xa-net-svg");
  const layer = document.getElementById("xa-net-layer");
  const list = document.getElementById("xa-net-list");
  const title = document.getElementById("xa-net-name");
  const facts = document.getElementById("xa-net-facts");
  const description = document.getElementById("xa-net-description");
  const profile = document.getElementById("xa-net-profile");
  const status = document.getElementById("xa-net-status");
  const search = document.getElementById("xa-net-search");
  if (!svg || !layer || !list || !search || !facts) return;

  const colors = { both: "#8fd1ae", follower: "#5cc8f5", interaction: "#e8b970" };
  const base = { width: 1100, height: 850 };
  const state = { nodes: [], selected: "", filter: "all", query: "", zoom: 1, panX: 0, panY: 0 };
  const pointers = new Map();
  let movedDuringDrag = false;
  let lastPinch = 0;

  const el = (tag, attrs, text) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, String(value));
    if (text != null) node.textContent = String(text);
    return node;
  };
  const textEl = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    node.textContent = text;
    return node;
  };
  const pos = (n) => {
    const angle = Number(n.angle) * Math.PI / 180;
    return { x: Math.cos(angle) * Number(n.radius), y: Math.sin(angle) * Number(n.radius) };
  };
  const countKinds = (n) => n.kind === "both" ? "Follower + public interaction" :
    n.kind === "follower" ? "Recorded follower" : "Public interaction";
  const isShown = (n) => {
    if (state.filter === "both" && n.kind !== "both") return false;
    if (state.filter === "follower" && n.kind !== "follower" && n.kind !== "both") return false;
    if (state.filter === "interaction" && n.kind !== "interaction" && n.kind !== "both") return false;
    return !state.query || n.handle.toLowerCase().includes(state.query);
  };
  const visible = () => state.nodes.filter(isShown);
  const updateView = () => {
    const w = base.width / state.zoom, h = base.height / state.zoom;
    svg.setAttribute("viewBox", [state.panX - w / 2, state.panY - h / 2, w, h].join(" "));
  };
  const zoomBy = (factor) => {
    state.zoom = Math.min(3.6, Math.max(.7, state.zoom * factor));
    updateView();
  };
  const resetView = () => {
    state.zoom = 1; state.panX = 0; state.panY = 0;
    updateView();
  };

  const select = (handle) => {
    const item = state.nodes.find(n => n.handle.toLowerCase() === String(handle).toLowerCase());
    if (!item) return;
    state.selected = item.handle;
    title.textContent = "@" + item.handle;
    description.textContent = countKinds(item);
    profile.href = "https://x.com/" + encodeURIComponent(item.handle);
    profile.hidden = false;
    facts.replaceChildren();
    const intro = textEl("p", "xa-net-evidence-intro",
      "Recorded observations (November 2026). These are not live account relationships.");
    facts.append(intro);
    const ul = document.createElement("ul");
    for (const record of item.evidence) {
      const li = document.createElement("li");
      const type = textEl("strong", "", record.type === "repost" ? "Repost" :
        record.type === "follower" ? "Follower snapshot" : "Public interaction");
      li.append(type, document.createTextNode(" — " + record.text));
      ul.append(li);
    }
    facts.append(ul);
    draw();
    renderList();
  };

  const draw = () => {
    layer.replaceChildren();
    const filtered = visible();
    for (const n of filtered) {
      const p = pos(n);
      const path = el("path", {
        d: "M 0 0 Q " + (p.x * .36 - p.y * .07).toFixed(2) + " " +
          (p.y * .36 + p.x * .07).toFixed(2) + " " + p.x.toFixed(2) + " " + p.y.toFixed(2),
        class: "xa-net-edge xa-net-edge-" + n.kind +
          (state.selected.toLowerCase() === n.handle.toLowerCase() ? " is-selected" : ""),
        "aria-hidden": "true"
      });
      layer.append(path);
    }
    const origin = el("g", { class: "xa-net-origin", role: "img", "aria-label": "Origin account @rosch_weston" });
    origin.append(el("circle", { r: 39 }), el("circle", { r: 28, class: "xa-net-origin-core" }),
      el("text", { y: 5, "text-anchor": "middle" }, "WR"));
    layer.append(origin);
    for (const n of filtered) {
      const p = pos(n);
      const selected = state.selected.toLowerCase() === n.handle.toLowerCase();
      const g = el("g", {
        transform: "translate(" + p.x.toFixed(2) + " " + p.y.toFixed(2) + ")",
        class: "xa-net-node xa-net-" + n.kind + (selected ? " is-selected" : ""),
        tabindex: "0",
        role: "button",
        "aria-label": "@" + n.handle + ", " + countKinds(n) + ". Select for details."
      });
      g.style.setProperty("--node-color", colors[n.kind]);
      g.append(el("circle", { r: selected ? 31 : 27, class: "xa-net-node-halo" }),
        el("circle", { r: 13, class: "xa-net-node-core" }),
        el("circle", { r: 3.6, class: "xa-net-node-center" }),
        el("text", { y: -42, "text-anchor": "middle", class: "xa-net-node-label" }, "@" + n.handle));
      g.addEventListener("click", () => { if (!movedDuringDrag) select(n.handle); });
      g.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault(); select(n.handle);
        }
      });
      layer.append(g);
    }
    status.textContent = filtered.length + " account" + (filtered.length === 1 ? "" : "s") +
      " shown · snapshot observations · no inferred cross-links";
  };

  const renderList = () => {
    list.replaceChildren();
    for (const n of visible()) {
      const b = textEl("button", "xa-net-list-item" +
        (state.selected.toLowerCase() === n.handle.toLowerCase() ? " is-selected" : ""), "@" + n.handle);
      b.type = "button";
      b.append(textEl("small", "", countKinds(n)));
      b.addEventListener("click", () => select(n.handle));
      list.append(b);
    }
    if (!list.childElementCount) list.append(textEl("p", "xa-net-empty", "No accounts match the current filter."));
  };

  const render = () => {
    draw(); renderList();
    document.querySelectorAll("[data-net-filter]").forEach(button => {
      const active = button.dataset.netFilter === state.filter;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
    });
  };

  document.querySelectorAll("[data-net-filter]").forEach(button => button.addEventListener("click", () => {
    state.filter = button.dataset.netFilter; render();
  }));
  search.addEventListener("input", () => {
    state.query = search.value.trim().toLowerCase().replace(/^@/, "").slice(0, 50);
    render();
  });
  document.querySelectorAll("[data-net-zoom]").forEach(button => button.addEventListener("click", () => {
    if (button.dataset.netZoom === "reset") resetView();
    else zoomBy(button.dataset.netZoom === "in" ? 1.3 : 1 / 1.3);
  }));
  svg.addEventListener("wheel", e => {
    e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  const span = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  svg.addEventListener("pointerdown", e => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movedDuringDrag = false;
    if (pointers.size === 2) {
      const pp = [...pointers.values()];
      lastPinch = span(pp[0], pp[1]);
    }
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", e => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.abs(dx) + Math.abs(dy) > 3) movedDuringDrag = true;
    if (pointers.size === 2) {
      const pp = [...pointers.values()];
      const next = span(pp[0], pp[1]);
      if (lastPinch > 0 && next > 0) zoomBy(next / lastPinch);
      lastPinch = next;
      return;
    }
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    state.panX -= dx * (base.width / state.zoom) / bounds.width;
    state.panY -= dy * (base.height / state.zoom) / bounds.height;
    updateView();
  });
  const stopPointer = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinch = 0;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    // Allow a subsequent ordinary click after the pointer event has completed.
    window.setTimeout(() => { movedDuringDrag = false; }, 0);
  };
  svg.addEventListener("pointerup", stopPointer);
  svg.addEventListener("pointercancel", stopPointer);
  svg.addEventListener("lostpointercapture", e => pointers.delete(e.pointerId));

  fetch("network-nodes.json", { cache: "no-store" })
    .then(response => { if (!response.ok) throw new Error("Network data unavailable"); return response.json(); })
    .then(data => {
      if (data.center !== "rosch_weston" || !Array.isArray(data.nodes)) throw new Error("Invalid network data");
      state.nodes = data.nodes.filter(n => /^[a-z0-9_]{1,15}$/i.test(n.handle) &&
        ["both", "follower", "interaction"].includes(n.kind) && Array.isArray(n.evidence) &&
        Number.isFinite(n.angle) && Number.isFinite(n.radius)).slice(0, 40);
      resetView();
      const first = state.nodes.find(n => n.handle === "space_jm_") || state.nodes[0];
      if (first) select(first.handle);
      else render();
      const count = document.getElementById("xa-net-total");
      if (count) count.textContent = String(state.nodes.length);
    })
    .catch(() => {
      status.textContent = "Network snapshot unavailable. Account analytics above remain readable.";
      list.replaceChildren(textEl("p", "xa-net-empty", "The network data file could not be loaded."));
    });
})();
