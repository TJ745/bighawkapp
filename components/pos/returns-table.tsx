"use client";

import Link from "next/link";
import { Coins, PackageX, RotateCcw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination } from "@/components/shared/pagination";
import { StatCards } from "@/components/shared/stat-cards";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import type { ReturnListRow } from "@/lib/data/pos";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "restocked", label: "Restocked" },
  { value: "written-off", label: "Written off" },
];

type Props = {
  returns: ReturnListRow[];
  total: number;
  page: number;
  refunded: number;
  cost: number;
  hasQuery: boolean;
  branchName: string;
};

export function ReturnsTable({ returns, total, page, refunded, cost, hasQuery, branchName }: Props) {
  const format = useFormat();

  return (
    <div className="space-y-4">
      <StatCards
        columns={2}
        stats={[
          { label: "Refunded", value: refunded, icon: Coins, tint: "red", invertTrend: true, hint: `${branchName}, this filter` },
          { label: "Cost returned", value: cost, icon: PackageX, tint: "amber", hint: "Comes back off cost of goods" },
        ]}
      />

      <ListToolbar filters={FILTERS} searchPlaceholder="Search by return, sale, reason or who did it" />

      {returns.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title={hasQuery ? "No returns match" : "No returns yet"}
          description={hasQuery ? "Try a different search or filter." : "Returns are taken from a sale — open one and choose Return items."}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return</TableHead>
                <TableHead>Sale</TableHead>
                <TableHead className="hidden lg:table-cell">Reason</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="text-right">Refunded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{row.number}</p>
                    <p className="text-xs text-muted-foreground">
                      {format.dateTime(row.returnedAt)} · {row.userName}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Link href={`/pos/sales/${row.saleId}`} className="hover:underline">
                      {row.saleNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {row.customerId ? (
                        <Link href={`/customers/${row.customerId}`} className="hover:underline">
                          {row.customerName}
                        </Link>
                      ) : (
                        "Walk-in"
                      )}
                    </p>
                  </TableCell>
                  <TableCell className="hidden max-w-56 truncate text-muted-foreground lg:table-cell">{row.reason}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.itemCount}</TableCell>
                  <TableCell>
                    <StatusBadge tone={row.restock ? "success" : "warning"}>{row.restock ? "Restocked" : "Written off"}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{format.money(row.grandTotal)}</TableCell>
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
