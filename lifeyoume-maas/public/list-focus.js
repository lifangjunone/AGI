// Content rerenders replace native controls; preserve the user's keyboard position.
export function captureListFocus(root, active = document.activeElement) {
  if (!active || !root.contains(active)) return null;
  if (active.id) return { id: active.id };
  if (active.dataset?.selectModel) return { modelId: active.dataset.selectModel };
  return null;
}

export function restoreListFocus(root, position) {
  if (!position) return;
  const control = position.id
    ? [...root.querySelectorAll("[id]")].find(node => node.id === position.id)
    : [...root.querySelectorAll("[data-select-model]")].find(node => node.dataset.selectModel === position.modelId);
  const target = control && !control.disabled ? control
    : position.id === "model-next" ? root.querySelector("#model-prev:not(:disabled)")
    : position.id === "model-prev" ? root.querySelector("#model-next:not(:disabled)") : null;
  (target || document.querySelector("#main"))?.focus({ preventScroll: true });
}
