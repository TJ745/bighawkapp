"use client";

import { useFormat } from "@/components/providers/format-provider";
import type { DocumentTotals } from "@/lib/business/totals";

type TotalsSummaryProps = {
  totals: DocumentTotals;
  extra?: { label: string; value: number; emphasis?: boolean; negative?: boolean }[];
};

// Subtotal / discount / VAT / grand total block used by forms, detail pages and dialogs.
export function TotalsSummary({ totals, extra }: TotalsSummaryProps) {
  const format = useFormat();
  const rows = [
    { label: "Subtotal", value: totals.subtotal },
    ...(totals.discountTotal > 0 ? [{ label: "Discount", value: totals.discountTotal, negative: true }] : []),
    { label: "VAT", value: totals.vatTotal },
    { label: "Grand total", value: totals.grandTotal, emphasis: true },
    ...(extra ?? []),
  ];
  return (
    <dl className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
      {rows.map((r) => (
        <div
          key={r.label}
          className={
            "flex items-center justify-between gap-4 " +
            ("emphasis" in r && r.emphasis ? "border-t pt-2 text-base font-semibold" : "text-muted-foreground")
          }
        >
          <dt>{r.label}</dt>
          <dd className={"tabular-nums " + ("emphasis" in r && r.emphasis ? "text-foreground" : "font-medium text-foreground")}>
            {"negative" in r && r.negative ? "- " : ""}
            {format.money(r.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
