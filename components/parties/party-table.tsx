"use client";

import Link from "next/link";
import { Building2, Plus, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination } from "@/components/shared/pagination";
import { StatusMenu } from "@/components/shared/status-menu";
import { useFormat } from "@/components/providers/format-provider";
import { setPartyActive } from "@/actions/parties";
import type { PartyKind, PartyListItem } from "@/lib/data/parties";
import { PARTY_CONFIG, PARTY_FILTERS } from "./party-config";

type PartyTableProps = {
  kind: PartyKind;
  items: PartyListItem[];
  total: number;
  page: number;
  hasQuery: boolean;
  canCreate: boolean;
  canEdit: boolean;
};

export function PartyTable({ kind, items, total, page, hasQuery, canCreate, canEdit }: PartyTableProps) {
  const format = useFormat();
  const config = PARTY_CONFIG[kind];

  return (
    <div className="space-y-4">
      <ListToolbar filters={PARTY_FILTERS} searchPlaceholder="Search by name, phone or email">
        {canCreate ? (
          <Button asChild>
            <Link href={`${config.basePath}/new`}>
              <Plus />
              New {config.singular}
            </Link>
          </Button>
        ) : null}
      </ListToolbar>

      {items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={hasQuery ? `No ${config.plural.toLowerCase()} match` : `No ${config.plural.toLowerCase()} yet`}
          description={
            hasQuery
              ? "Try a different search or filter."
              : kind === "customer"
                ? "Add your first customer to start sending quotations and invoices."
                : "Add your first supplier to record quotations and purchases."
          }
          action={
            canCreate && !hasQuery ? (
              <Button asChild>
                <Link href={`${config.basePath}/new`}>
                  <Plus />
                  New {config.singular}
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{config.singular}</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden lg:table-cell">Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">{config.totalLabel}</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link href={`${config.basePath}/${item.id}`} className="flex items-center gap-3 hover:underline">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        {item.type === "COMPANY" ? <Building2 className="size-4" /> : <User className="size-4" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{item.name}</span>
                        <span className="block truncate text-xs text-muted-foreground md:hidden">{item.phone}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{item.type === "COMPANY" ? "Company" : "Individual"}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{item.phone}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{item.email ?? "—"}</TableCell>
                  <TableCell>
                    <StatusMenu
                      current={item.isActive ? { label: "Active", tone: "success" } : { label: "Inactive", tone: "neutral" }}
                      choices={
                        canEdit
                          ? [
                              item.isActive
                                ? { value: "inactive", label: "Inactive", tone: "neutral" as const, description: `Hidden when creating documents` }
                                : { value: "active", label: "Active", tone: "success" as const, description: "Available again in pickers" },
                            ]
                          : []
                      }
                      onSelect={(value) => setPartyActive(kind, item.id, value === "active")}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{format.money(item.financials.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={item.financials.outstanding > 0 ? "font-medium text-warning-foreground dark:text-warning" : undefined}>
                      {format.money(item.financials.outstanding)}
                    </span>
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
