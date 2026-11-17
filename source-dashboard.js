/* Weston Rosch — public repository source dashboard and GitHub contribution heatmap.
   No access tokens, private data, or fabricated contributions. Repository sizes come
   from the latest public main-branch Git trees and refresh while this tab is open. */
(() => {
  "use strict";

  const owner = "InterstellarNerd8760";
  const repos = [
    { repo: "personal-site", size: "site-size", exact: "site-bytes", bytes: 2453509, refreshed: false },
    { repo: "lunar-atlas", size: "moon-size", exact: "moon-bytes", bytes: 494865280, refreshed: false }
  ];
  const SNAPSHOT_DATE = "Nov 16, 2026";
  const REPO_POLL_MS = 10 * 60 * 1000;
  const CONTRIBUTIONS_POLL_MS = 60 * 60 * 1000;
  const MIN_REPO_CHECK_GAP_MS = 60 * 1000;
  const fmt = new Intl.NumberFormat("en-US");
  const bytesToMB = bytes => (bytes / 1000000).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }) + " MB";
  const updateField = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };
  const getJson = async url => {
    const response = await fetch(url, {
      mode: "cors", credentials: "omit", cache: "no-store",
      headers: { Accept: "application/vnd.github+json, application/json" }
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  };

  let lastRepoCheck = 0;
  let repoRefreshPromise = null;
  let lastContributionCheck = 0;
  let contributionsPromise = null;

  function showRepoStats() {
    let combined = 0;
    for (const item of repos) {
      combined += item.bytes;
      updateField(item.size, bytesToMB(item.bytes));
      updateField(item.exact, fmt.format(item.bytes) + " bytes");
    }
    updateField("combined-size", bytesToMB(combined));
    updateField("combined-bytes", fmt.format(combined) + " bytes");
  }

  function checkTimeLabel() {
    return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  async function refreshRepoStats(isManual = false) {
    if (repoRefreshPromise) return repoRefreshPromise;
    // Avoid accidentally exhausting GitHub's unauthenticated API limit from repeated checks.
    if (lastRepoCheck && Date.now() - lastRepoCheck < MIN_REPO_CHECK_GAP_MS) {
      if (isManual) updateField("source-stat-status", "Already checked recently. GitHub updates are checked at most once per minute.");
      return;
    }
    lastRepoCheck = Date.now();
    const btn = document.getElementById("source-refresh");
    if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }
    repoRefreshPromise = (async () => {
      const outcomes = await Promise.allSettled(repos.map(async entry => {
        const data = await getJson(
          "https://api.github.com/repos/" + owner + "/" + entry.repo + "/git/trees/main?recursive=1"
        );
        if (!Array.isArray(data.tree) || data.truncated) throw new Error("Incomplete repository tree");
        const files = data.tree.filter(item => item.type === "blob" && Number.isSafeInteger(item.size));
        if (!files.length) throw new Error("No files returned");
        const bytes = files.reduce((total, item) => total + item.size, 0);
        if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error("Invalid byte sum");
        return bytes;
      }));
      outcomes.forEach((outcome, i) => {
        if (outcome.status === "fulfilled") {
          repos[i].bytes = outcome.value;
          repos[i].refreshed = true;
        }
      });
      showRepoStats();
      const failed = outcomes.filter(x => x.status === "rejected").length;
      if (failed === 0) {
        updateField("source-stat-status", "Last checked against GitHub main branches at " +
          checkTimeLabel() + ". Auto-checks about every 10 minutes while this page is open.");
      } else if (failed === outcomes.length) {
        updateField("source-stat-status", "GitHub unavailable or rate-limited. Showing last known sizes " +
          (repos.every(x => x.refreshed) ? "from a previous check." : "(fallback from " + SNAPSHOT_DATE + " where needed)."));
      } else {
        updateField("source-stat-status", "Checked at " + checkTimeLabel() +
          "; one repository could not refresh. Its last known size is still displayed.");
      }
    })().finally(() => {
      repoRefreshPromise = null;
      if (btn) { btn.disabled = false; btn.textContent = "Refresh bytes"; }
    });
    return repoRefreshPromise;
  }

  const zeroUtc = date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dateKey = date => date.toISOString().slice(0, 10);
  const fullDate = key => new Date(key + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC", weekday: "long", month: "short", day: "numeric", year: "numeric"
  });
  const dailyDetail = document.getElementById("contribution-day-detail");
  const tooltip = document.createElement("div");
  tooltip.className = "contribution-tooltip";
  tooltip.id = "contribution-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  let activeDay = null;

  function positionTooltip(square) {
    if (!square || tooltip.hidden) return;
    const rect = square.getBoundingClientRect();
    const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    const left = Math.max(10, Math.min(window.innerWidth - width - 10,
      rect.left + rect.width / 2 - width / 2));
    const above = rect.top >= height + 15;
    tooltip.style.left = left + "px";
    tooltip.style.top = (above ? rect.top - height - 10 : rect.bottom + 10) + "px";
  }

  function showDay(square) {
    if (!square) return;
    activeDay = square;
    const count = Number(square.dataset.count) || 0;
    const day = fullDate(square.dataset.date);
    const countText = fmt.format(count) + (count === 1 ? " contribution" : " contributions");
    const strong = document.createElement("strong");
    strong.textContent = countText;
    const dateSpan = document.createElement("span");
    dateSpan.textContent = " on " + day;
    tooltip.replaceChildren(strong, dateSpan);
    tooltip.hidden = false;
    if (dailyDetail) dailyDetail.textContent = countText + " on " + day + ".";
    positionTooltip(square);
  }

  function hideDay(square) {
    if (square && activeDay !== square) return;
    tooltip.hidden = true;
    activeDay = null;
  }

  async function renderContributions() {
    if (contributionsPromise) return contributionsPromise;
    const chart = document.getElementById("contribution-grid");
    const summary = document.getElementById("contribution-summary");
    if (!chart || !summary) return;
    lastContributionCheck = Date.now();
    contributionsPromise = (async () => {
      try {
        // Third-party view of public GitHub daily contribution counts (not commits only).
        // The provider caches upstream data; frequent polling cannot make it truly real-time.
        const data = await getJson(
          "https://github-contributions-api.jogruber.de/v4/" + owner + "?y=last"
        );
        if (!Array.isArray(data.contributions) || data.contributions.length < 200) {
          throw new Error("Incomplete contribution calendar");
        }
        const lookup = new Map(data.contributions
          .filter(c => typeof c.date === "string").map(c => [c.date.slice(0, 10), c]));
        const end = zeroUtc(new Date());
        const oneYearAgo = new Date(end);
        oneYearAgo.setUTCDate(end.getUTCDate() - 364);
        const firstSunday = new Date(oneYearAgo);
        firstSunday.setUTCDate(firstSunday.getUTCDate() - firstSunday.getUTCDay());
        let total = 0, active = 0, weeks = 0;
        const squares = [];
        const gridFragment = document.createDocumentFragment();

        for (let cursor = new Date(firstSunday); cursor <= end;) {
          const week = document.createElement("div");
          week.className = "contribution-week";
          for (let day = 0; day < 7; day++) {
            const square = document.createElement("span");
            const key = dateKey(cursor);
            const inYear = cursor >= oneYearAgo && cursor <= end;
            const datum = lookup.get(key);
            const count = inYear && datum ? Math.max(0, Number(datum.count) || 0) : 0;
            const level = Math.min(4, Math.max(0, Number(datum && datum.level) || (count ? 1 : 0)));
            square.className = "contribution-day level-" + level + (!inYear ? " outside" : "");
            if (inYear) {
              const dayLabel = fullDate(key);
              square.dataset.date = key;
              square.dataset.count = String(count);
              square.tabIndex = squares.length === 0 ? 0 : -1;
              square.setAttribute("aria-label", dayLabel + ": " +
                fmt.format(count) + (count === 1 ? " contribution" : " contributions"));
              square.setAttribute("aria-describedby", "contribution-day-detail");
              square.addEventListener("pointerenter", event => {
                if (event.pointerType !== "touch") showDay(square);
              });
              square.addEventListener("pointerleave", () => {
                if (document.activeElement !== square) hideDay(square);
              });
              square.addEventListener("focus", () => showDay(square));
              square.addEventListener("blur", () => hideDay(square));
              square.addEventListener("click", () => showDay(square));
              squares.push(square);
              total += count;
              if (count > 0) active++;
            }
            week.appendChild(square);
            cursor.setUTCDate(cursor.getUTCDate() + 1);
          }
          gridFragment.appendChild(week);
          if (++weeks > 54) break;
        }

        // One keyboard tab stop for the calendar, with arrow-key navigation
        // to each successive day. Arrow right/left changes week; up/down changes day.
        squares.forEach((square, index) => square.addEventListener("keydown", event => {
          const offsets = { ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 };
          if (!(event.key in offsets)) return;
          event.preventDefault();
          const next = squares[Math.min(squares.length - 1, Math.max(0, index + offsets[event.key]))];
          if (!next || next === square) return;
          square.tabIndex = -1;
          next.tabIndex = 0;
          next.focus();
        }));
        hideDay();
        chart.replaceChildren(gridFragment);
        chart.setAttribute("aria-label", fmt.format(total) + " contributions on " +
          active + " active days across the last 365 days. Focus a square and use arrow keys for daily details.");
        summary.textContent = fmt.format(total) + " contributions on " + active +
          " active days · last 365 days";
        updateField("contribution-status", "Public GitHub contribution counts (not just commits), cached by provider.");
      } catch (error) {
        if (!chart.childElementCount) summary.textContent = "Contribution calendar unavailable at the moment.";
        updateField("contribution-status", "Couldn't refresh GitHub activity. See the official GitHub profile for the current calendar.");
      }
    })().finally(() => { contributionsPromise = null; });
    return contributionsPromise;
  }

  const refreshButton = document.getElementById("source-refresh");
  if (refreshButton) refreshButton.addEventListener("click", () => refreshRepoStats(true));
  document.addEventListener("pointerdown", event => {
    if (activeDay && !event.target.closest(".contribution-day")) hideDay();
  });
  window.addEventListener("scroll", () => { if (activeDay) positionTooltip(activeDay); }, true);
  window.addEventListener("resize", () => { if (activeDay) positionTooltip(activeDay); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") hideDay();
  });

  showRepoStats();
  refreshRepoStats();
  renderContributions();
  window.setInterval(() => {
    if (!document.hidden) refreshRepoStats();
  }, REPO_POLL_MS);
  window.setInterval(() => {
    if (!document.hidden) renderContributions();
  }, CONTRIBUTIONS_POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hideDay(); return; }
    refreshRepoStats();
    if (Date.now() - lastContributionCheck >= CONTRIBUTIONS_POLL_MS) renderContributions();
  });
})();
