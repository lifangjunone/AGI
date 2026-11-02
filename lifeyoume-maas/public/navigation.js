import { modelStatusOptions } from "./model-status.js";

const views = new Set(["overview", "models", "apps", "playground", "usage", "audit"]);

export function readNavigation(hash) {
  const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  return {
    view: views.has(params.get("view")) ? params.get("view") : "overview",
    query: (params.get("q") || "").slice(0, 200),
    capability: (params.get("capability") || "all").slice(0, 80),
    provider: (params.get("provider") || "all").slice(0, 80),
    status: modelStatusOptions.some(([value]) => value === params.get("status")) ? params.get("status") : "all",
    page: Math.max(1, Math.min(100000, Math.floor(Number(params.get("page")) || 1))),
    pageSize: [10, 20, 50].includes(Number(params.get("size"))) ? Number(params.get("size")) : 10,
    sort: params.get("sort") === "name" ? "name" : "updated"
  };
}

export function navigationHash(value) {
  const params = new URLSearchParams({ view: views.has(value.view) ? value.view : "overview" });
  // Only non-secret navigation fields are ever serialized.
  if (value.query) params.set("q", value.query.slice(0, 200));
  for (const key of ["capability", "provider", "status"]) {
    if (value[key] && value[key] !== "all") params.set(key, value[key]);
  }
  if (value.page > 1) params.set("page", String(value.page));
  if (value.pageSize !== 10) params.set("size", String(value.pageSize));
  if (value.sort === "name") params.set("sort", value.sort);
  return `#${params}`;
}
