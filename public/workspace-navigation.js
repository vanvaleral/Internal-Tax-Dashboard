/* Data-free sidebar behavior, independent of authenticated business state. */
(() => {
  const desktop = window.matchMedia("(min-width: 901px)");
  const narrow = window.matchMedia("(min-width: 901px) and (max-width: 1100px)");
  const root = document.documentElement, sidebar = document.getElementById("workspace-sidebar"), toggle = document.getElementById("compact-rail-toggle");
  let requestedMini = null;
  const sync = () => {
    const available = desktop.matches && !root.classList.contains("cases-fullscreen");
    const mini = available && (requestedMini ?? narrow.matches);
    root.classList.toggle("desktop-nav-mini", mini);
    sidebar.removeAttribute("inert"); sidebar.removeAttribute("aria-hidden");
    toggle.disabled = !available;
    toggle.setAttribute("aria-expanded", String(!mini));
    toggle.setAttribute("aria-label", mini ? "Show full sidebar" : "Use mini sidebar");
    toggle.title = mini ? "Show full sidebar" : "Use mini sidebar";
    sidebar.querySelector("h1").title = available ? "Double-click to switch sidebar size" : "";
    if (!available && document.activeElement === toggle) sidebar.querySelector(".nav-btn.active:not([hidden])")?.focus({ preventScroll: true });
  };
  const switchSize = () => {
    if (!desktop.matches || root.classList.contains("cases-fullscreen")) return;
    requestedMini = !root.classList.contains("desktop-nav-mini"); sync();
  };
  toggle.addEventListener("click", switchSize);
  sidebar.addEventListener("dblclick", event => {
    if (!(event.target instanceof Element) || event.target.closest("button,a,input,select,textarea,[contenteditable]")) return;
    event.preventDefault(); switchSize();
  });
  desktop.addEventListener("change", sync);
  narrow.addEventListener("change", sync);
  sync();
})();
