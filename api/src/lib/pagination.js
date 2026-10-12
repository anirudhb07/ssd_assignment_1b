const MAX_PAGE_SIZE = 100;

// Reads ?page=&pageSize= with safe defaults. Never trust the client to
// ask for a reasonable page size: the orders table has 120k rows.
export function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// The shape every list endpoint returns.
export function paged(items, total, { page, pageSize }) {
  return { items, page, pageSize, total };
}
