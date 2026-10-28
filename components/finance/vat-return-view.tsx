"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { PageHeader } from "@/components/shared/page-header";
import { StatCards } from "@/components/shared/stat-cards";
import { useFormat } from "@/components/providers/format-provider";
import type { VatReturn, VatSide } from "@/lib/business/vat-return";
import { Receipt, ShoppingCart, Scale } from "lucide-react";

/**
 * What was charged, what was paid, and the difference.
 *
 * The screen says what basis it is on, because every other Finance screen is cash-based and a
 * reader would otherwise assume this one is too.
 */
export function VatReturnView({ data, today, vatEnabled }: { data: VatReturn; today: string; vatEnabled: boolean }) {
  const format = useFormat();
  const owed = data.netVat >= 0;

  return (
    <>
      <PageHeader
        title="VAT"
        description="VAT charged on sales, VAT paid on purchases, and what the difference comes to for a period."
        actions={<DateRangeFilter today={today} />}
      />

      {!vatEnabled ? (
        <Alert>
          <AlertDescription>VAT is switched off in Settings, so these figures will be zero.</AlertDescription>
        </Alert>
      ) : null}

      <StatCards
        stats={[
          { label: "VAT on sales", value: data.sales.vat, icon: Receipt, tint: "blue" },
          { label: "VAT on purchases", value: data.purchases.vat, icon: ShoppingCart, tint: "amber" },
          {
            label: owed ? "Owed to ZATCA" : "Reclaimable",
            value: Math.abs(data.netVat),
            icon: Scale,
            tint: owed ? "red" : "green",
            hint: owed ? "Charged to customers, less what suppliers charged you" : "Suppliers charged you more VAT than you charged out",
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SideCard title="Sales" subtitle="What you charged your customers." side={data.sales} creditLabel="Credit notes and returns" />
        <SideCard title="Purchases" subtitle="What your suppliers charged you." side={data.purchases} creditLabel="Goods sent back" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Where these figures come from</CardTitle>
          <CardDescription>
            Every document counted, so nothing is taken on trust. Credits and returns are shown as negatives.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Source</TableHead>
                <TableHead className="text-right">Documents</TableHead>
                <TableHead className="text-right">Before VAT</TableHead>
                <TableHead className="pr-6 text-right">VAT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sources.map((source) => (
                <TableRow key={source.label}>
                  <TableCell className="pl-6">{source.label}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{source.documents}</TableCell>
                  <TableCell className="text-right tabular-nums">{format.money(source.net)}</TableCell>
                  <TableCell className="pr-6 text-right font-medium tabular-nums">{format.money(source.vat)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Alert>
        <AlertDescription className="space-y-2">
          <p>
            <span className="font-medium text-foreground">These figures are on the document date, not the payment date.</span> An invoice issued
            inside this period counts towards it whether or not it has been paid — which is how VAT works, and the opposite of the other Finance
            screens, where money only counts when it moves.
          </p>
          <p>
            Only purchases that have been <span className="font-medium text-foreground">received</span> count towards VAT on purchases. A general
            expense counts when you recorded a VAT rate on it, which you should only do where the supplier gave you a tax invoice. This is a
            summary of what you recorded — what belongs on each line of ZATCA&apos;s own form is for you and your accountant.
          </p>
        </AlertDescription>
      </Alert>
    </>
  );
}

function SideCard({ title, subtitle, side, creditLabel }: { title: string; subtitle: string; side: VatSide; creditLabel: string }) {
  const format = useFormat();
  const rows: { label: string; net: number; vat?: number; strong?: boolean }[] = [
    { label: "Standard-rated", net: side.standardRatedNet, vat: side.standardRatedVat },
    { label: "Zero-rated or exempt", net: side.zeroRatedNet },
    { label: creditLabel, net: -side.adjustmentsNet, vat: -side.adjustmentsVat },
    { label: "Total", net: side.net, vat: side.vat, strong: true },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">&nbsp;</TableHead>
              <TableHead className="text-right">Before VAT</TableHead>
              <TableHead className="pr-6 text-right">VAT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label} className={row.strong ? "hover:bg-transparent" : undefined}>
                <TableCell className={`pl-6 ${row.strong ? "font-medium" : ""}`}>{row.label}</TableCell>
                <TableCell className={`text-right tabular-nums ${row.strong ? "font-semibold" : ""}`}>{format.money(row.net)}</TableCell>
                <TableCell className={`pr-6 text-right tabular-nums ${row.strong ? "font-semibold" : ""}`}>
                  {row.vat === undefined ? "—" : format.money(row.vat)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
