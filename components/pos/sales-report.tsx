"use client";

import { Coins, Package, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCards } from "@/components/shared/stat-cards";
import { useFormat } from "@/components/providers/format-provider";
import type { SoldLine } from "@/lib/data/pos-reports";

/**
 * What sold, and what it earned.
 *
 * Net of returns and excluding VAT, because that is what the shop keeps. Margin comes from the
 * cost snapshotted on each sold line, so changing a cost price today never rewrites what last
 * month made.
 */
export function SalesReportView({
  data,
  branchName,
  today,
}: {
  data: { items: SoldLine[]; categories: SoldLine[] };
  branchName: string;
  today: string;
}) {
  const net = data.items.reduce((sum, row) => sum + row.net, 0);
  const profit = data.items.reduce((sum, row) => sum + row.profit, 0);
  const units = data.items.reduce((sum, row) => sum + row.quantity, 0);

  return (
    <>
      <PageHeader
        title="What sold"
        description={`Every line rung up in ${branchName}, grouped by item and by category. Net of returns, excluding VAT.`}
        actions={<DateRangeFilter today={today} />}
      />

      <StatCards
        stats={[
          { label: "Net sales", value: net, icon: Coins, tint: "blue" },
          { label: "Gross profit", value: profit, icon: TrendingUp, tint: profit >= 0 ? "green" : "red" },
          { label: "Units sold", value: units, as: "number", icon: Package, tint: "purple" },
        ]}
      />

      <Breakdown title="By item" subtitle="Best sellers first. What to reorder, and what to stop stocking." rows={data.items} showCategory />
      <Breakdown title="By category" subtitle="Where the money actually comes from." rows={data.categories} />
    </>
  );
}

function Breakdown({ title, subtitle, rows, showCategory }: { title: string; subtitle: string; rows: SoldLine[]; showCategory?: boolean }) {
  const format = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Package} title="Nothing sold in this period" description="Change the dates, or ring something up." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                {showCategory ? <TableHead className="hidden md:table-cell">Category</TableHead> : null}
                <TableHead className="text-right">Sold</TableHead>
                <TableHead className="text-right">Net sales</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Cost</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="pr-6 text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="pl-6 font-medium">{row.name}</TableCell>
                  {showCategory ? (
                    <TableCell className="hidden text-muted-foreground md:table-cell">{row.categoryName ?? "—"}</TableCell>
                  ) : null}
                  <TableCell className="text-right tabular-nums">{format.number(row.quantity)}</TableCell>
                  <TableCell className="text-right tabular-nums">{format.money(row.net)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{format.money(row.cost)}</TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${row.profit < 0 ? "text-destructive" : ""}`}>
                    {format.money(row.profit)}
                  </TableCell>
                  <TableCell className="pr-6 text-right tabular-nums text-muted-foreground">
                    {row.marginPercent === null ? "—" : `${row.marginPercent}%`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
