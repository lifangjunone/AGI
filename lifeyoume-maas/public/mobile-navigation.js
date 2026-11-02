export function setupMobileNavigation({ sidebar, workspace, toggle, backdrop, close, media = matchMedia("(max-width: 760px)") }) {
  let opened = false;
  function setOpen(value, restoreFocus = false) {
    opened = Boolean(value && media.matches);
    sidebar.classList.toggle("open", opened);
    sidebar.inert = media.matches && !opened;
    workspace.inert = opened;
    backdrop.hidden = !opened;
    toggle.setAttribute("aria-expanded", String(opened));
    document.body.classList.toggle("navigation-open", opened);
    if (opened) {
      sidebar.setAttribute("role", "dialog");
      sidebar.setAttribute("aria-modal", "true");
      close.focus();
    } else {
      sidebar.removeAttribute("role");
      sidebar.removeAttribute("aria-modal");
      if (restoreFocus && media.matches) toggle.focus();
    }
  }
  toggle.addEventListener("click", () => setOpen(!opened));
  close.addEventListener("click", () => setOpen(false, true));
  backdrop.addEventListener("click", () => setOpen(false, true));
  sidebar.addEventListener("keydown", event => {
    if (!opened) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false, true);
    } else if (event.key === "Tab") {
      const controls = [...sidebar.querySelectorAll("button, a[href]")]
        .filter(control => !control.disabled && control.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  });
  media.addEventListener("change", () => {
    const focusInside = sidebar.contains(document.activeElement);
    setOpen(false, focusInside);
  });
  setOpen(false);
  return { close: (restoreFocus = false) => setOpen(false, restoreFocus) };
}
