"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { StatCards } from "@/components/shared/stat-cards";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import type { AccountBalance, FinanceTotals } from "@/lib/business/finance";

type Props = { totals: FinanceTotals; accounts: AccountBalance[]; today: string };

export function ProfitView({ totals, accounts, today }: Props) {
  const format = useFormat();
  const totalBalance = accounts.filter((a) => a.isActive).reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="space-y-6">
      <DateRangeFilter today={today} defaultPreset="this-month" />
      <StatCards
        stats={[
          { label: "Total income", value: totals.totalIncome, tone: "success" },
          { label: "Total expenses", value: totals.totalExpenses },
          { label: "Profit", value: totals.profit, tone: totals.profit >= 0 ? "success" : "danger", hint: "Income − expenses for the selected period" },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Breakdown
          title="Income"
          description="Money that came in."
          rows={[
            { label: "Customer payments", value: totals.customerPayments },
            { label: "Other income", value: totals.otherIncome },
          ]}
          total={totals.totalIncome}
        />
        <Breakdown
          title="Expenses"
          description="Money that went out."
          rows={[
            { label: "Supplier payments", value: totals.supplierPayments },
            { label: "General expenses", value: totals.generalExpenses },
          ]}
          total={totals.totalExpenses}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account balances</CardTitle>
          <CardDescription>Opening balance plus all money received, minus all money paid out (all time).</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Account</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Opening balance</TableHead>
                <TableHead className="pr-6 text-right">Current balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="pl-6">
                    <span className="inline-flex items-center gap-2 font-medium">
                      {a.name}
                      {!a.isActive ? <StatusBadge tone="neutral">Inactive</StatusBadge> : null}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{format.money(a.openingBalance)}</TableCell>
                  <TableCell className={`pr-6 text-right font-medium tabular-nums ${a.balance < 0 ? "text-destructive" : ""}`}>{format.money(a.balance)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="hover:bg-transparent">
                <TableCell className="pl-6 font-medium" colSpan={2}>
                  Total (active accounts)
                </TableCell>
                <TableCell className="pr-6 text-right font-semibold tabular-nums">{format.money(totalBalance)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Breakdown({ title, description, rows, total }: { title: string; description: string; rows: { label: string; value: number }[]; total: number }) {
  const format = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="font-medium tabular-nums">{format.money(r.value)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{format.money(total)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
