/* Client-side project filtering; all cards remain visible without JS. */
(() => {
  const buttons = [...document.querySelectorAll("[data-project-filter]")];
  const cards = [...document.querySelectorAll("[data-project-kind]")];
  const count = document.getElementById("project-count");
  if (!buttons.length || !cards.length) return;
  const filter = (value) => {
    let shown = 0;
    cards.forEach(card => {
      const ok = value === "all" || card.dataset.projectKind === value || card.dataset.projectStage === value;
      card.hidden = !ok;
      if (ok) shown++;
    });
    buttons.forEach(b => {
      const on = b.dataset.projectFilter === value;
      b.classList.toggle("is-selected", on);
      b.setAttribute("aria-pressed", String(on));
    });
    if (count) count.textContent = shown + (shown === 1 ? " project" : " projects");
  };
  buttons.forEach(b => b.addEventListener("click", () => filter(b.dataset.projectFilter)));
})();
