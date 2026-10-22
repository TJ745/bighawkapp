"use client";

import Link from "next/link";
import { Printer, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { ExportButton } from "@/components/shared/export-button";
import { exportPosSales } from "@/actions/export";
import { Pagination } from "@/components/shared/pagination";
import { StatCards } from "@/components/shared/stat-cards";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import type { SaleListRow } from "@/lib/data/pos";
import { SALE_STATUS_LABELS } from "@/lib/validation/pos";
import { Coins, Percent, RotateCcw } from "lucide-react";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "held", label: "Held" },
  { value: "voided", label: "Voided" },
  { value: "refunded", label: "Refunded" },
];

type Props = {
  sales: SaleListRow[];
  total: number;
  page: number;
  takings: number;
  refunds: number;
  netSales: number;
  cost: number;
  hasQuery: boolean;
  branchName: string;
};

export function SalesTable({ sales, total, page, takings, refunds, netSales, cost, hasQuery, branchName }: Props) {
  const format = useFormat();
  const margin = netSales > 0 ? Math.round(((netSales - cost) / netSales) * 1000) / 10 : 0;

  return (
    <div className="space-y-4">
      <StatCards
        columns={4}
        stats={[
          { label: "Sold", value: takings, icon: Coins, tint: "green", hint: `${branchName}, this filter` },
          { label: "Refunded", value: refunds, icon: RotateCcw, tint: "red", hint: "Given back to customers" },
          { label: "Net sales", value: netSales, icon: Coins, tint: "blue", hint: "What was kept" },
          { label: "Gross margin", value: netSales - cost, icon: Percent, tint: "purple", hint: `${margin}% of net, cost ${format.money(cost)}` },
        ]}
      />

      <ListToolbar filters={FILTERS} searchPlaceholder="Search by number, customer or cashier">
        <ExportButton action={exportPosSales} />
      </ListToolbar>

      {sales.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={hasQuery ? "No sales match" : "No sales yet"}
          description={hasQuery ? "Try a different search or filter." : "Sales rung up at the register appear here."}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sale</TableHead>
                <TableHead className="hidden sm:table-cell">Customer</TableHead>
                <TableHead className="hidden lg:table-cell">Register / cashier</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Receipt</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale) => {
                const status = SALE_STATUS_LABELS[sale.status];
                return (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <Link href={`/pos/sales/${sale.id}`} className="font-medium hover:underline">
                        {sale.number}
                      </Link>
                      <p className="text-xs text-muted-foreground">{format.dateTime(sale.soldAt)}</p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {sale.customerId ? (
                        <Link href={`/customers/${sale.customerId}`} className="hover:underline">
                          {sale.customerName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Walk-in</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {[sale.registerName, sale.cashierName].filter(Boolean).join(" · ")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{sale.itemCount}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{format.money(sale.total)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button asChild variant="ghost" size="icon" aria-label="Print receipt" title="Print receipt">
                          <a href={`/pos/sales/${sale.id}/receipt`} target="_blank" rel="noreferrer">
                            <Printer />
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={page} total={total} />
    </div>
  );
}
