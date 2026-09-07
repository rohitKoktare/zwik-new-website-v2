/**
 * Admin list pagination. Every admin list must be paginated — unbounded
 * queries are explicitly disallowed (DATABASE_DESIGN.md §19).
 */

export const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export type Pagination = {
  page: number;
  pageSize: number;
  /** Inclusive start index for Supabase `.range()`. */
  from: number;
  /** Inclusive end index for Supabase `.range()`. */
  to: number;
};

/** Parses untrusted `?page=`/`?pageSize=` values into a safe, bounded range. */
export function parsePagination(params: {
  page?: string;
  pageSize?: string;
}): Pagination {
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const parsedSize = Number.parseInt(params.pageSize ?? "", 10);
  const pageSize =
    Number.isFinite(parsedSize) && parsedSize > 0
      ? Math.min(parsedSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  const from = (page - 1) * pageSize;

  return { page, pageSize, from, to: from + pageSize - 1 };
}

export function totalPages(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
