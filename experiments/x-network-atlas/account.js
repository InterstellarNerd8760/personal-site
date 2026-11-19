/* Static X Network Atlas. Reads only a public same-origin snapshot. */
(() => {
  "use strict";
  const root = document.querySelector("[data-atlas-data]");
  if (!root) return;

  const fmt = (value) => Number(value).toLocaleString("en-US");
  const get = (data, path) => path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), data);

  const month = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const shortDate = (iso) => {
    const [year, mon, day] = iso.split("-").map(Number);
    return month[mon - 1] + " " + day;
  };

  fetch(root.getAttribute("data-atlas-data"), { cache: "no-store" })
    .then((res) => { if (!res.ok) throw new Error("Data not available"); return res.json(); })
    .then((data) => {
      if (data.handle !== "rosch_weston" || !data.profile || !data.sample) return;

      document.querySelectorAll("[data-metric]").forEach((el) => {
        const value = get(data, el.getAttribute("data-metric"));
        if (value != null && Number.isFinite(Number(value))) el.textContent = fmt(value);
      });

      const stamp = document.querySelector("[data-as-of]");
      if (stamp && data.asOfDisplay) {
        stamp.textContent = "Data as of " + data.asOfDisplay + " · Public X lookups stored as a static snapshot, not a live feed and not X Analytics.";
      }

      const non = data.sample.nonRetweet || {};
      const engagements = Number(non.likes) + Number(non.replies) + Number(non.reposts) + Number(non.quotes);
      const impressions = Number(non.impressions);
      const engageEl = document.querySelector('[data-derived-rate="engagements"]');
      if (engageEl && impressions > 0) {
        engageEl.textContent = (100 * engagements / impressions).toFixed(1) + "%";
      }
      const types = data.sample.byType || {};
      const posts = Number(data.sample.postsCollected);
      const replyEl = document.querySelector('[data-derived-rate="replyShare"]');
      if (replyEl && posts > 0) {
        replyEl.textContent = Math.round(100 * Number(types.reply) / posts) + "%";
      }

      const daily = document.getElementById("xa-daily");
      if (daily && Array.isArray(data.sample.daily)) {
        daily.replaceChildren();
        const max = Math.max(...data.sample.daily.map((row) => row.total), 1);
        data.sample.daily.forEach((row) => {
          const item = document.createElement("div");
          item.className = "xa-daily-row";
          const label = document.createElement("span");
          label.className = "xa-daily-label";
          label.textContent = shortDate(row.date);
          const track = document.createElement("div");
          track.className = "xa-daily-track";
          const fill = document.createElement("div");
          fill.className = "xa-daily-fill";
          fill.style.width = (100 * row.total / max).toFixed(1) + "%";
          track.append(fill);
          const count = document.createElement("strong");
          count.textContent = String(row.total);
          const title = row.date + ": " + row.total + " posts (" +
            row.original + " original, " + row.reply + " replies, " +
            row.quote + " quotes, " + row.retweet + " reposts)";
          item.title = title;
          item.append(label, track, count);
          daily.append(item);
        });
      }

      const list = document.getElementById("xa-top-posts");
      if (list && Array.isArray(data.sample.topPosts)) {
        list.replaceChildren();
        data.sample.topPosts.forEach((post) => {
          const item = document.createElement("li");
          const link = document.createElement("a");
          link.href = post.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          const pt = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Los_Angeles", month: "short", day: "numeric"
          }).format(new Date(post.createdAt));
          const kind = post.kind === "reply" && post.replyTo ? "Reply to @" + post.replyTo :
            post.kind === "reply" ? "Reply" :
            post.kind === "quote" ? "Quote" : "Original post";
          link.textContent = kind + " · " + pt;
          const meta = document.createElement("span");
          meta.textContent = fmt(post.impressions) + " impressions · " +
            fmt(post.likes) + " likes · " + fmt(post.replies) + " replies";
          item.append(link, meta);
          list.append(item);
        });
      }
    })
    .catch(() => {
      const stamp = document.querySelector("[data-as-of]");
      if (stamp) stamp.textContent = "Static snapshot shown · Data file could not be refreshed";
    });
})();
