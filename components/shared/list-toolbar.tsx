"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };

type ListToolbarProps = {
  filters?: FilterOption[];
  searchPlaceholder?: string;
  children?: React.ReactNode;
};

// Search box + filter pills that write to the URL (?q=&filter=&page=1) so the server does the filtering.
export function ListToolbar({ filters, searchPlaceholder = "Search…", children }: ListToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQ = searchParams.get("q") ?? "";
  const currentFilter = searchParams.get("filter") ?? filters?.[0]?.value ?? "all";
  const [q, setQ] = useState(currentQ);

  function navigate(next: { q?: string; filter?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextQ = next.q ?? currentQ;
    const nextFilter = next.filter ?? currentFilter;
    if (nextQ) params.set("q", nextQ);
    else params.delete("q");
    if (nextFilter && nextFilter !== (filters?.[0]?.value ?? "all")) params.set("filter", nextFilter);
    else params.delete("filter");
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  // Debounce typing before updating the URL.
  useEffect(() => {
    if (q === currentQ) return;
    const t = setTimeout(() => navigate({ q }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {filters?.length ? (
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {filters.map((f) => {
            const active = f.value === currentFilter;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => navigate({ filter: f.value })}
                aria-pressed={active}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div />
      )}
      <div className="flex items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Search"
            className="pl-8"
          />
        </div>
        {children}
      </div>
    </div>
  );
}
