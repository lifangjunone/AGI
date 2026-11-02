export function logPage(items, { query = "", filters = {}, page = 1, pageSize = 20 } = {}) {
  const needle = String(query).trim().toLowerCase();
  const matched = items.filter((item) => {
    const values = [item.requestId, item.id, item.applicationId, item.logicalModel,
      item.deploymentId, item.action, item.actor].filter(Boolean).join(" ").toLowerCase();
    return (!needle || values.includes(needle))
      && (!filters.application || item.applicationId === filters.application)
      && (!filters.action || item.action === filters.action)
      && (!filters.status || (filters.status === "success"
        ? item.status >= 200 && item.status < 400
        : !(item.status >= 200 && item.status < 400)));
  });
  const size = [10, 20, 50].includes(Number(pageSize)) ? Number(pageSize) : 20;
  const pages = Math.max(1, Math.ceil(matched.length / size));
  const current = Math.min(pages, Math.max(1, Math.floor(Number(page) || 1)));
  return { items: matched.slice((current - 1) * size, current * size), total: matched.length,
    page: current, pages, pageSize: size };
}
