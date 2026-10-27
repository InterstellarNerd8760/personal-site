/* Weston Rosch: site interactions + scroll choreography (GSAP, ScrollTrigger, SplitText, Lenis). */
(() => {
  const root = document.documentElement;
  const header = document.querySelector(".site-header");
  const menuButton = document.querySelector(".menu-btn");
  const siteNav = document.querySelector("#site-nav");

  /* ---------- Mobile menu ---------- */
  const setMenu = (open) => {
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    siteNav.classList.toggle("is-open", open);
  };
  menuButton.addEventListener("click", () => setMenu(menuButton.getAttribute("aria-expanded") !== "true"));
  siteNav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  /* ---------- Callsign copy ---------- */
  document.querySelectorAll(".copy-call").forEach((btn) => {
    const label = btn.querySelector(".copy-label");
    btn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(btn.dataset.copy); label.textContent = "Copied"; }
      catch { label.textContent = "Copy failed"; }
      setTimeout(() => (label.textContent = "Copy"), 1600);
    });
  });

  /* ---------- One open field note at a time ---------- */
  const notes = [...document.querySelectorAll(".note")];
  notes.forEach((n) => n.addEventListener("toggle", () => {
    if (n.open) notes.forEach((o) => { if (o !== n) o.open = false; });
  }));

  /* ---------- Header state + section index (works without GSAP) ---------- */
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 40);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const indexLinks = [...document.querySelectorAll(".section-index a")];
  const sections = [...document.querySelectorAll("[data-section]")];
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        indexLinks.forEach((l) => l.classList.toggle("is-active", l.dataset.index === entry.target.id));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach((s) => io.observe(s));
  }

  /* ---------- Motion ---------- */
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !window.gsap || !window.ScrollTrigger) { root.classList.remove("motion"); return; }

  gsap.registerPlugin(ScrollTrigger);
  if (window.SplitText) gsap.registerPlugin(SplitText);
  const ease = "expo.out";

  // Smooth scroll, synced to ScrollTrigger.
  let lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const target = document.querySelector(a.getAttribute("href"));
        if (!target) return;
        e.preventDefault();
        lenis.scrollTo(target, { offset: a.getAttribute("href") === "#top" ? 0 : -72 });
      });
    });
  }

  // 01 Hero: intro sequence.
  const heroTl = gsap.timeline({ defaults: { ease } });
  heroTl
    .fromTo(".hero-media img", { scale: 1.22, opacity: 0 }, { scale: 1.08, opacity: 1, duration: 2.4 }, 0)
    .to("[data-hero-line]", { y: 0, duration: 1.4, stagger: 0.14 }, 0.35)
    .fromTo("[data-hero]", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1.2, stagger: 0.12 }, 0.75);

  // Hero parallax: Earth drifts slower than the page; copy lifts and fades.
  gsap.to(".hero-media", { yPercent: 18, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
  gsap.to(".hero-inner", { yPercent: -18, opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "20% top", end: "85% top", scrub: true } });

  // Section headings: line-by-line mask reveal.
  document.querySelectorAll("[data-split]").forEach((el) => {
    if (window.SplitText) {
      const split = SplitText.create(el, { type: "lines", mask: "lines", linesClass: "split-line" });
      gsap.from(split.lines, { yPercent: 110, duration: 1.3, ease, stagger: 0.1, scrollTrigger: { trigger: el, start: "top 85%" } });
    } else {
      gsap.from(el, { y: 40, opacity: 0, duration: 1.2, ease, scrollTrigger: { trigger: el, start: "top 85%" } });
    }
  });

  // Generic fade-up.
  gsap.utils.toArray("[data-reveal]").forEach((el) => {
    gsap.fromTo(el, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 1.2, ease, scrollTrigger: { trigger: el, start: "top 88%" } });
  });

  // 02 Projects: staggered slide-in, image settles.
  ScrollTrigger.batch("[data-card]", {
    start: "top 85%",
    onEnter: (batch) => gsap.fromTo(batch, { opacity: 0, y: 70 }, { opacity: 1, y: 0, duration: 1.4, ease, stagger: 0.15 }),
  });
  gsap.utils.toArray(".project-media img").forEach((img) => {
    gsap.fromTo(img, { scale: 1.15 }, { scale: 1, ease: "none", scrollTrigger: { trigger: img, start: "top bottom", end: "bottom 40%", scrub: true } });
  });

  // WALL-E trace draws itself.
  const trace = document.querySelector(".trace");
  if (trace) {
    const len = trace.getTotalLength();
    gsap.set(trace, { strokeDasharray: len, strokeDashoffset: len });
    gsap.to(trace, { strokeDashoffset: 0, duration: 2.4, ease: "power2.inOut", scrollTrigger: { trigger: ".telemetry", start: "top 75%" } });
    gsap.from(".trace-dot", { scale: 0, transformOrigin: "center", duration: 0.6, delay: 1.5, ease: "back.out(3)", scrollTrigger: { trigger: ".telemetry", start: "top 75%" } });
  }

  // 03 Console: bars fill in sequence.
  gsap.fromTo(".focus .bar b", { scaleX: 0 }, { scaleX: 1, duration: 1.6, ease, stagger: 0.18, scrollTrigger: { trigger: ".console-panel", start: "top 75%" } });

  // 04 Long view: pinned scene with slow push-in and staged copy.
  const mm = gsap.matchMedia();
  mm.add("(min-width: 901px)", () => {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: ".long-view", start: "top top", end: "+=140%", scrub: 0.8, pin: ".long-stage" },
    });
    tl.fromTo(".long-media img", { scale: 1.25 }, { scale: 1, ease: "none", duration: 1 }, 0)
      .from(".long-inner .kicker", { opacity: 0, y: 30, duration: 0.15 }, 0.05)
      .from(".long-line", { opacity: 0, y: 60, stagger: 0.12, duration: 0.25 }, 0.1)
      .from(".long-copy", { opacity: 0, y: 30, duration: 0.2 }, 0.35)
      .fromTo(".milestones", { "--progress": 0 }, { "--progress": 1, ease: "none", duration: 0.35 }, 0.5)
      .from(".milestones li", { opacity: 0, y: 20, stagger: 0.06, duration: 0.15 }, 0.5);
  });
  mm.add("(max-width: 900px)", () => {
    gsap.from(".long-inner > *", { opacity: 0, y: 30, stagger: 0.12, duration: 1.2, ease, scrollTrigger: { trigger: ".long-view", start: "top 70%" } });
  });

  // 05 Notes: rows rise in.
  ScrollTrigger.batch("[data-note]", {
    start: "top 90%",
    onEnter: (batch) => gsap.fromTo(batch, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1.1, ease, stagger: 0.1 }),
  });

  // Side index progress bar tracks the whole page.
  gsap.to(".section-index-bar b", { scaleY: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: true } });

  // Recalculate after fonts and images settle.
  document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener("load", () => ScrollTrigger.refresh());
})();
