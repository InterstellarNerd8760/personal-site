const menuBtn = document.querySelector(".menu-btn");
const mobileNav = document.querySelector("#mobile-nav");

function setMenu(open) {
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  mobileNav.hidden = !open;
}

menuBtn.addEventListener("click", () => {
  setMenu(menuBtn.getAttribute("aria-expanded") !== "true");
});

mobileNav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => setMenu(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenu(false);
});

const copyBtn = document.querySelector(".copy-call");
const copyLabel = copyBtn.querySelector(".copy-label");
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(copyBtn.dataset.copy);
    copyLabel.textContent = "Copied";
    window.setTimeout(() => {
      copyLabel.textContent = "Copy callsign";
    }, 1600);
  } catch {
    copyLabel.textContent = "Copy callsign";
  }
});
