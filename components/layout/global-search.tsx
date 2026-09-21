"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FolderKanban, Loader2, Receipt, Search, ShoppingCart, Truck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { searchEverything } from "@/actions/search";
import { PURCHASE_STATUS, SUPPLIER_QUOTATION_STATUS } from "@/lib/business/procurement-status";
import { INVOICE_STATUS, QUOTATION_STATUS } from "@/lib/business/sales-status";
import type { SearchGroup, SearchHit } from "@/lib/data/search";
import type { InvoiceStatus, ProjectStatus, PurchaseStatus, QuotationStatus, SupplierQuotationStatus } from "@/lib/generated/prisma/enums";
import { PROJECT_STATUS } from "@/lib/validation/projects";

const GROUPS: { key: SearchGroup; label: string; icon: typeof Users }[] = [
  { key: "customers", label: "Customers", icon: Users },
  { key: "suppliers", label: "Suppliers", icon: Truck },
  { key: "quotations", label: "Quotations", icon: FileText },
  { key: "invoices", label: "Invoices", icon: Receipt },
  { key: "supplierQuotations", label: "Supplier Quotations", icon: FileText },
  { key: "purchases", label: "Purchases", icon: ShoppingCart },
  { key: "projects", label: "Projects", icon: FolderKanban },
];

function statusFor(hit: SearchHit) {
  switch (hit.group) {
    case "invoices":
      return INVOICE_STATUS[hit.status as InvoiceStatus];
    case "quotations":
      return QUOTATION_STATUS[hit.status as QuotationStatus];
    case "purchases":
      return PURCHASE_STATUS[hit.status as PurchaseStatus];
    case "supplierQuotations":
      return SUPPLIER_QUOTATION_STATUS[hit.status as SupplierQuotationStatus];
    case "projects":
      return PROJECT_STATUS[hit.status as ProjectStatus];
    default:
      return null;
  }
}

// Cross-module search. Opens with ⌘K / Ctrl+K; results come from a permission-scoped Server Action.
export function GlobalSearch() {
  const router = useRouter();
  const format = useFormat();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  // Guards against an earlier, slower request overwriting a newer one.
  const requestRef = useRef(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Clearing happens in the change handler; the effect only owns the debounced fetch.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const id = ++requestRef.current;
    const timer = setTimeout(async () => {
      const result = await searchEverything(term);
      if (id !== requestRef.current) return;
      setHits(result.success ? result.data : []);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function onQueryChange(value: string) {
    setQuery(value);
    const short = value.trim().length < 2;
    setHits(short ? [] : hits);
    setLoading(!short);
  }

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const grouped = GROUPS.map((group) => ({
    ...group,
    items: hits.filter((h) => h.group === group.key),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="text-muted-foreground w-9 justify-start gap-2 rounded-full px-0 font-normal sm:w-60 sm:px-3.5 md:w-64 lg:w-80 xl:w-96"
        aria-label="Search"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:inline">⌘K</kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Find customers, suppliers, documents and projects"
        className="sm:max-w-xl"
      >
        {/* The server already ranked and filtered the hits. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search customers, invoices, purchases, projects…" value={query} onValueChange={onQueryChange} />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Searching…
              </div>
            ) : query.trim().length < 2 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Type at least 2 characters to search.</div>
            ) : (
              <CommandEmpty>No matches found.</CommandEmpty>
            )}
            {grouped.map((group) => (
              <CommandGroup key={group.key} heading={group.label}>
                {group.items.map((hit) => {
                  const status = statusFor(hit);
                  return (
                    <CommandItem key={`${hit.group}-${hit.id}`} value={`${hit.group}-${hit.id}`} onSelect={() => go(hit.href)} className="gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <group.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{hit.title}</span>
                        {hit.subtitle ? <span className="block truncate text-xs text-muted-foreground">{hit.subtitle}</span> : null}
                      </span>
                      {hit.amount !== null ? (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{format.money(hit.amount)}</span>
                      ) : null}
                      {status ? <StatusBadge tone={status.tone}>{status.label}</StatusBadge> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
