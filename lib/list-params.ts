// Parses common list query params (?q=&filter=&page=) used by every list screen.
export const PAGE_SIZE = 25;

/**
 * `pageSize` is only set by an export, which wants the whole filtered list rather than the page on
 * screen. Leaving it out keeps every list screen paginated exactly as before.
 */
export type ListParams = { q: string; filter: string; page: number; pageSize?: number };

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

/**
 * The Prisma `skip`/`take` for a page.
 *
 * Takes the whole `ListParams` so an export can widen the window by setting `pageSize` without
 * every list query needing to know that exports exist.
 */
export function paginate(params: number | ListParams) {
  if (typeof params === "number") return { skip: (params - 1) * PAGE_SIZE, take: PAGE_SIZE };
  const size = params.pageSize && params.pageSize > 0 ? params.pageSize : PAGE_SIZE;
  return { skip: (params.page - 1) * size, take: size };
}

export function pageCount(total: number) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
