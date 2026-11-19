/* Personal X Network Atlas — counted interaction graph, November 2026. */
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

  const colors = { mutual: "#8fd1ae", outbound: "#e8b970", inbound: "#5cc8f5", amplify: "#c4a0e8" };
  const kindLabel = {
    mutual: "Mutual conversation",
    outbound: "I reached out",
    inbound: "They reached out",
    amplify: "I only reposted them"
  };
  const base = { width: 1300, height: 1100 };
  const state = { nodes: [], edges: [], selected: "", filter: "all", query: "", zoom: 1, panX: 0, panY: 0 };
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
  const fmt = (value) => value == null ? "—" : Number(value).toLocaleString("en-US");
  const isShown = (n) => {
    if (state.filter !== "all" && n.kind !== state.filter) return false;
    return !state.query || n.handle.toLowerCase().includes(state.query) ||
      (n.name || "").toLowerCase().includes(state.query);
  };
  const visible = () => state.nodes.filter(isShown);
  const updateView = () => {
    const w = base.width / state.zoom, h = base.height / state.zoom;
    svg.setAttribute("viewBox", [state.panX - w / 2, state.panY - h / 2, w, h].join(" "));
  };
  const zoomBy = (factor) => {
    state.zoom = Math.min(3.6, Math.max(0.6, state.zoom * factor));
    updateView();
  };
  const resetView = () => {
    state.zoom = 1; state.panX = 0; state.panY = 0;
    updateView();
  };

  const lineItems = (counts) => {
    const rows = [
      [counts.replyTo, "replies from me"],
      [counts.mentionOut, "mentions from me"],
      [counts.quote, "quotes from me"],
      [counts.repost, "reposts from me"],
      [counts.replyFrom, "replies to me"],
      [counts.mentionFrom, "mentions of me"],
      [counts.quoteFrom, "quotes of me"]
    ];
    return rows.filter((row) => row[0] > 0);
  };

  const select = (handle) => {
    const item = state.nodes.find(n => n.handle.toLowerCase() === String(handle).toLowerCase());
    if (!item) return;
    state.selected = item.handle;
    title.textContent = "@" + item.handle;
    description.textContent = (item.name && item.name !== "@" + item.handle ? item.name + " · " : "") +
      kindLabel[item.kind] + " · " + item.weight + " interaction" + (item.weight === 1 ? "" : "s");
    profile.href = "https://x.com/" + encodeURIComponent(item.handle);
    profile.hidden = false;
    facts.replaceChildren();
    const intro = textEl("p", "xa-net-evidence-intro",
      "Counted public posts in the Nov 5–19, 2026 sample window.");
    facts.append(intro);
    const ul = document.createElement("ul");
    for (const [count, label] of lineItems(item.counts || {})) {
      const li = document.createElement("li");
      const strong = textEl("strong", "", String(count));
      li.append(strong, document.createTextNode(" " + label));
      ul.append(li);
    }
    facts.append(ul);
    if (item.profile) {
      const p = textEl("p", "xa-net-profile-metrics",
        "Public profile: " + fmt(item.profile.followers) + " followers · " +
        fmt(item.profile.following) + " following · " + fmt(item.profile.posts) + " posts");
      facts.append(p);
    }
    draw();
    renderList();
  };

  const draw = () => {
    layer.replaceChildren();
    const filtered = visible();
    const shown = new Set(filtered.map(n => n.handle));
    const maxWeight = Math.max(...state.nodes.map(n => n.weight), 1);

    for (const edge of state.edges) {
      if (!shown.has(edge.source) || !shown.has(edge.target)) continue;
      const a = state.nodes.find(n => n.handle === edge.source);
      const b = state.nodes.find(n => n.handle === edge.target);
      if (!a || !b) continue;
      const pa = pos(a), pb = pos(b);
      layer.append(el("line", {
        x1: pa.x.toFixed(2), y1: pa.y.toFixed(2),
        x2: pb.x.toFixed(2), y2: pb.y.toFixed(2),
        class: "xa-net-cooc",
        "stroke-width": String(1 + edge.weight),
        "aria-hidden": "true"
      }));
    }

    for (const n of filtered) {
      const p = pos(n);
      const selected = state.selected.toLowerCase() === n.handle.toLowerCase();
      const width = 1.4 + (n.weight / maxWeight) * 4.2;
      const path = el("path", {
        d: "M 0 0 Q " + (p.x * .36 - p.y * .07).toFixed(2) + " " +
          (p.y * .36 + p.x * .07).toFixed(2) + " " + p.x.toFixed(2) + " " + p.y.toFixed(2),
        class: "xa-net-edge xa-net-edge-" + n.kind + (selected ? " is-selected" : ""),
        "stroke-width": width.toFixed(2),
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
      const radius = 7 + Math.sqrt(n.weight) * 2.8 + (selected ? 3 : 0);
      const g = el("g", {
        transform: "translate(" + p.x.toFixed(2) + " " + p.y.toFixed(2) + ")",
        class: "xa-net-node xa-net-" + n.kind + (selected ? " is-selected" : ""),
        tabindex: "0",
        role: "button",
        "aria-label": "@" + n.handle + ", " + n.weight + " interactions, " + kindLabel[n.kind] + ". Select for details."
      });
      g.style.setProperty("--node-color", colors[n.kind]);
      g.append(
        el("circle", { r: (radius + 8).toFixed(1), class: "xa-net-node-halo" }),
        el("circle", { r: radius.toFixed(1), class: "xa-net-node-core" }),
        el("circle", { r: Math.max(2.2, radius * 0.22).toFixed(1), class: "xa-net-node-center" })
      );
      if (n.weight >= 4 || selected || state.zoom >= 1.45) {
        g.append(el("text", {
          y: -(radius + 14).toFixed(1),
          "text-anchor": "middle",
          class: "xa-net-node-label"
        }, "@" + n.handle));
      }
      g.addEventListener("click", () => { if (!movedDuringDrag) select(n.handle); });
      g.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault(); select(n.handle);
        }
      });
      layer.append(g);
    }
    status.textContent = filtered.length + " account" + (filtered.length === 1 ? "" : "s") +
      " shown · edge weight is counted interactions";
  };

  const renderList = () => {
    list.replaceChildren();
    const rows = visible().slice().sort((a, b) => b.weight - a.weight || a.handle.localeCompare(b.handle));
    for (const n of rows) {
      const b = textEl("button", "xa-net-list-item" +
        (state.selected.toLowerCase() === n.handle.toLowerCase() ? " is-selected" : ""), "@" + n.handle);
      b.type = "button";
      b.append(textEl("small", "", n.weight + " · " + kindLabel[n.kind]));
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
    draw();
  }));
  svg.addEventListener("wheel", e => {
    e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12); draw();
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
      draw();
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
    window.setTimeout(() => { movedDuringDrag = false; }, 0);
  };
  svg.addEventListener("pointerup", stopPointer);
  svg.addEventListener("pointercancel", stopPointer);
  svg.addEventListener("lostpointercapture", e => pointers.delete(e.pointerId));

  fetch("x-atlas.json", { cache: "no-store" })
    .then(response => { if (!response.ok) throw new Error("Network data unavailable"); return response.json(); })
    .then(data => {
      if (data.handle !== "rosch_weston" || !data.network || !Array.isArray(data.network.nodes)) {
        throw new Error("Invalid network data");
      }
      const kinds = ["mutual", "outbound", "inbound", "amplify"];
      state.nodes = data.network.nodes.filter(n =>
        /^[a-z0-9_]{1,15}$/i.test(n.handle) &&
        kinds.includes(n.kind) &&
        Number.isFinite(n.weight) && n.weight > 0 &&
        Number.isFinite(n.angle) && Number.isFinite(n.radius)
      );
      state.edges = Array.isArray(data.network.cooccurrenceEdges) ? data.network.cooccurrenceEdges : [];
      resetView();
      const first = state.nodes.find(n => n.handle === "miss1oncontrol") || state.nodes[0];
      if (first) select(first.handle);
      else render();
      const count = document.getElementById("xa-net-total");
      if (count) count.textContent = String(state.nodes.length);
      const universe = document.getElementById("xa-net-universe");
      if (universe && data.sample) universe.textContent = String(data.sample.accountsWithInteractions);
    })
    .catch(() => {
      status.textContent = "Network snapshot unavailable. Account metrics above remain readable.";
      list.replaceChildren(textEl("p", "xa-net-empty", "The network data file could not be loaded."));
    });
})();
