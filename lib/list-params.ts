// Parses common list query params (?q=&filter=&page=) used by every list screen.
export const PAGE_SIZE = 25;

export type ListParams = { q: string; filter: string; page: number };

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseListParams(raw: RawParams, defaultFilter = "all"): ListParams {
  const page = Number(first(raw.page));
  return {
    q: (first(raw.q) ?? "").trim().slice(0, 100),
    filter: first(raw.filter) ?? defaultFilter,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function paginate(page: number) {
  return { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE };
}

export function pageCount(total: number) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
