"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormat } from "@/components/providers/format-provider";
import type { CustomerPaymentRow } from "@/lib/data/sales";

export function CustomerPaymentsTable({ payments }: { payments: CustomerPaymentRow[] }) {
  const format = useFormat();
  if (payments.length === 0) {
    return <EmptyState icon={Wallet} title="No payments yet" description="Payments recorded against this customer's invoices appear here." />;
  }
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Payment</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Invoice</TableHead>
            <TableHead className="hidden sm:table-cell">Account</TableHead>
            <TableHead className="hidden md:table-cell">Reference</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.number}</TableCell>
              <TableCell>{format.date(p.date)}</TableCell>
              <TableCell>
                <Link href={`/sales/invoices/${p.invoice.id}`} className="hover:underline">
                  {p.invoice.number}
                </Link>
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">{p.paymentAccount.name}</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{p.reference ?? "—"}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{format.money(p.amount)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={5} className="font-medium">
              Total received
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{format.money(total)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
