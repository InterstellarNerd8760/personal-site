/* Public, read-only repository statistics and GitHub contribution calendar.
   No client-side secrets, account cookies or analytics identifiers.
   If public APIs cannot be reached, dated snapshot numbers remain visible. */
(() => {
  "use strict";
  const owner = "InterstellarNerd8760";
  const repos = [
    { repo: "personal-site", size: "site-size", exact: "site-bytes", bytes: 2376033 },
    { repo: "lunar-atlas", size: "moon-size", exact: "moon-bytes", bytes: 494865280 }
  ];
  const fmt = new Intl.NumberFormat("en-US");
  const bytesToMB = bytes => (bytes / 1000000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MB";
  const updateField = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
  const getJson = async url => {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  };

  async function refreshRepoStats() {
    const outcomes = await Promise.allSettled(repos.map(async entry => {
      const data = await getJson("https://api.github.com/repos/" + owner + "/" + entry.repo + "/git/trees/main?recursive=1");
      if (!Array.isArray(data.tree) || data.truncated) throw new Error("Incomplete repository tree");
      const files = data.tree.filter(item => item.type === "blob" && Number.isFinite(item.size));
      const size = files.reduce((sum, item) => sum + item.size, 0);
      if (!files.length || size <= 0) throw new Error("No files available");
      return { ...entry, bytes: size, files: files.length };
    }));
    const current = repos.map((entry, i) => outcomes[i].status === "fulfilled" ? outcomes[i].value : entry);
    current.forEach(entry => {
      updateField(entry.size, bytesToMB(entry.bytes));
      updateField(entry.exact, fmt.format(entry.bytes) + " bytes");
    });
    const combined = current.reduce((sum, entry) => sum + entry.bytes, 0);
    updateField("combined-size", bytesToMB(combined));
    updateField("combined-bytes", fmt.format(combined) + " bytes");
    const failures = outcomes.filter(x => x.status !== "fulfilled").length;
    if (failures === 0) {
      updateField("source-stat-status", "Checked against GitHub main branches on " +
        new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) + ".");
    } else if (failures === outcomes.length) {
      updateField("source-stat-status", "Dated snapshot (Nov 16, 2026). GitHub refresh unavailable.");
    } else {
      updateField("source-stat-status", "Partially refreshed; unavailable repository uses the Nov 16 snapshot.");
    }
  }

  const zeroUtc = date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dateKey = date => date.toISOString().slice(0, 10);

  async function renderContributions() {
    const chart = document.getElementById("contribution-grid");
    const summary = document.getElementById("contribution-summary");
    if (!chart || !summary) return;
    try {
      // Public profile data, fetched without a token. One-hour provider-side cache.
      const data = await getJson("https://github-contributions-api.jogruber.de/v4/" + owner + "?y=last");
      if (!Array.isArray(data.contributions) || data.contributions.length < 200) throw new Error("Incomplete contribution calendar");
      const lookup = new Map(data.contributions.filter(c => typeof c.date === "string").map(c => [c.date.slice(0, 10), c]));
      const end = zeroUtc(new Date());
      const oneYearAgo = new Date(end);
      oneYearAgo.setUTCDate(end.getUTCDate() - 364);
      const firstSunday = new Date(oneYearAgo);
      firstSunday.setUTCDate(firstSunday.getUTCDate() - firstSunday.getUTCDay());
      let total = 0, active = 0, weeks = 0;
      const gridFragment = document.createDocumentFragment();
      for (let cursor = new Date(firstSunday); cursor <= end;) {
        const week = document.createElement("div");
        week.className = "contribution-week";
        for (let day = 0; day < 7; day++) {
          const square = document.createElement("span");
          const inYear = cursor >= oneYearAgo && cursor <= end;
          const datum = lookup.get(dateKey(cursor));
          const count = inYear && datum ? Math.max(0, Number(datum.count) || 0) : 0;
          const level = Math.min(4, Math.max(0, Number(datum && datum.level) || (count ? 1 : 0)));
          square.className = "contribution-day level-" + level + (!inYear ? " outside" : "");
          if (inYear) {
            square.title = dateKey(cursor) + ": " + count + (count === 1 ? " contribution" : " contributions");
            total += count;
            if (count > 0) active++;
          }
          week.appendChild(square);
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        gridFragment.appendChild(week);
        weeks++;
        if (weeks > 54) break;
      }
      chart.replaceChildren(gridFragment);
      chart.setAttribute("aria-label", fmt.format(total) + " GitHub contributions across " + active + " active days in the last 365 days. A color-coded daily heatmap.");
      summary.textContent = fmt.format(total) + " contributions on " + active + " active days · last 365 days";
      const label = document.getElementById("contribution-status");
      if (label) label.textContent = "Public GitHub contribution calendar · cached by provider";
    } catch (error) {
      summary.textContent = "Contribution calendar unavailable at the moment.";
      updateField("contribution-status", "Open GitHub to see the current graph.");
    }
  }

  refreshRepoStats();
  renderContributions();
})();
