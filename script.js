const menuButton = document.querySelector(".menu-btn");
const siteNav = document.querySelector("#site-nav");

function setMenuOpen(open) {
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  siteNav.classList.toggle("is-open", open);
}

menuButton.addEventListener("click", () => {
  setMenuOpen(menuButton.getAttribute("aria-expanded") !== "true");
});

siteNav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => setMenuOpen(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenuOpen(false);
});

document.addEventListener("click", (event) => {
  if (
    menuButton.getAttribute("aria-expanded") === "true" &&
    !siteNav.contains(event.target) &&
    !menuButton.contains(event.target)
  ) {
    setMenuOpen(false);
  }
});

document.querySelectorAll(".copy-call").forEach((button) => {
  const label = button.querySelector(".copy-label");
  const originalLabel = label.textContent;

  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      label.textContent = "Copied";
      window.setTimeout(() => {
        label.textContent = originalLabel;
      }, 1600);
    } catch {
      label.textContent = "Copy unavailable";
      window.setTimeout(() => {
        label.textContent = originalLabel;
      }, 1600);
    }
  });
});

// Keep the field-note list focused: opening one note closes any other open note.
const notes = Array.from(document.querySelectorAll(".note-entry"));
notes.forEach((note) => {
  note.addEventListener("toggle", () => {
    if (!note.open) return;
    notes.forEach((other) => {
      if (other !== note) other.open = false;
    });
  });
});


// Progressive scroll reveals, disabled when reduced motion is preferred.
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduceMotion && "IntersectionObserver" in window) {
  document.documentElement.classList.add("js-motion");
  const revealTargets = document.querySelectorAll(".section-heading, .project, .other-work-row, .console-intro, .console-panel, .note-entry, .direction-stamp, .direction-copy, .about-layout > div, .contact-layout > div");
  revealTargets.forEach((element,index) => {
    element.dataset.reveal = (element.matches(".other-work-row, .note-entry") ? "stagger" : "fade");
    if (element.dataset.reveal === "stagger") element.style.setProperty("--reveal-delay", `${(index % 3) * 75}ms`);
  });
  const revealObserver = new IntersectionObserver((entries,observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, {threshold:0.12,rootMargin:"0px 0px -35px 0px"});
  revealTargets.forEach(element => revealObserver.observe(element));
}
