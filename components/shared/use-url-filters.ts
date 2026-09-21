"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Reads and updates URL query filters so Server Components do the filtering.
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function get(key: string) {
    return searchParams.get(key) ?? "";
  }

  function set(updates: Record<string, string | null | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return { get, set };
}
