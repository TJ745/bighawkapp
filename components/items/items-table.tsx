"use client";

import Link from "next/link";
import { AlertTriangle, Boxes, Eye, MoreHorizontal, Package, Pencil, Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination } from "@/components/shared/pagination";
import { StatusMenu } from "@/components/shared/status-menu";
import { useFormat } from "@/components/providers/format-provider";
import { setItemActive } from "@/actions/items";
import type { ItemListRow } from "@/lib/data/items";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "products", label: "Products" },
  { value: "services", label: "Services" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

type Props = {
  items: ItemListRow[];
  total: number;
  page: number;
  hasQuery: boolean;
  canCreate: boolean;
  canEdit: boolean;
  branchName: string;
  /**
   * Whether to show which branch sells each item.
   *
   * Only where there is more than one: on a single-branch company the answer is the same on
   * every row, and a column of identical values is noise. Without it, a manager who has pinned
   * items to branches cannot tell which is which without opening each one.
   */
  showBranch?: boolean;
};

export function ItemsTable({ items, total, page, hasQuery, canCreate, canEdit, branchName, showBranch = false }: Props) {
  const format = useFormat();

  const newButton = canCreate ? (
    <Button asChild>
      <Link href="/pos/products/new">
        <Plus />
        New Item
      </Link>
    </Button>
  ) : null;

  return (
    <div className="space-y-4">
      <ListToolbar filters={FILTERS} searchPlaceholder="Search by name, code, SKU or barcode">
        {newButton}
      </ListToolbar>

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={hasQuery ? "No items match" : "No products or services yet"}
          description={
            hasQuery ? "Try a different search or filter." : "Add what you sell — products you stock and services you perform both live here."
          }
          action={!hasQuery ? newButton : undefined}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                {showBranch ? <TableHead className="hidden lg:table-cell">Sold at</TableHead> : null}
                <TableHead className="hidden lg:table-cell">Variants</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">{`Stock · ${branchName}`}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        {item.kind === "SERVICE" ? <Wrench className="size-4" /> : <Package className="size-4" />}
                      </span>
                      <div className="min-w-0">
                        {canEdit ? (
                          <Link href={`/pos/products/${item.id}/edit`} className="block truncate font-medium hover:underline">
                            {item.name}
                          </Link>
                        ) : (
                          <span className="block truncate font-medium">{item.name}</span>
                        )}
                        <p className="truncate text-xs text-muted-foreground">
                          {[item.code, item.brand, item.kind === "SERVICE" && item.durationMinutes ? `${item.durationMinutes} min` : null]
                            .filter(Boolean)
                            .join(" · ") || item.unit}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{item.category?.name ?? "—"}</TableCell>
                  {showBranch ? (
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{item.branch?.name ?? "Every branch"}</TableCell>
                  ) : null}
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {item.variantCount > 1 ? `${item.variantCount} variants` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{format.money(item.salePrice)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.totalStock === null ? (
                      <span className="text-muted-foreground">Not tracked</span>
                    ) : (
                      <span className={item.lowStock ? "inline-flex items-center gap-1 font-medium text-tint-red-foreground" : undefined}>
                        {item.lowStock ? <AlertTriangle className="size-3.5" /> : null}
                        {format.number(item.totalStock)} {item.unit}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusMenu
                      current={item.isActive ? { label: "Active", tone: "success" } : { label: "Inactive", tone: "neutral" }}
                      choices={
                        canEdit
                          ? [
                              item.isActive
                                ? { value: "inactive", label: "Inactive", tone: "neutral" as const, description: "Hidden from the register" }
                                : { value: "active", label: "Active", tone: "success" as const, description: "Available to sell again" },
                            ]
                          : []
                      }
                      onSelect={(value) => setItemActive(item.id, value === "active")}
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEdit ? (
                          <DropdownMenuItem asChild>
                            <Link href={`/pos/products/${item.id}/edit`}>
                              <Pencil />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        ) : null}
                        {item.trackStock ? (
                          <DropdownMenuItem asChild>
                            <Link href={`/pos/stock?q=${encodeURIComponent(item.name)}`}>
                              <Boxes />
                              Stock & movements
                            </Link>
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem asChild>
                          <Link href={`/pos/products?q=${encodeURIComponent(item.category?.name ?? item.name)}`}>
                            <Eye />
                            Similar items
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={page} total={total} />
    </div>
  );
}
