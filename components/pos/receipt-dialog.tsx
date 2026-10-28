"use client";

import Link from "next/link";
import { CheckCircle2, CloudOff, Printer, ShoppingCart } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFormat } from "@/components/providers/format-provider";
import type { DocumentTotals } from "@/lib/business/totals";
import type { PaymentDraft } from "./payment-dialog";
import { PAYMENT_METHODS } from "@/lib/validation/pos";

export type ReceiptData = {
  /** Null for a sale rung up offline: the server has not made the record yet. */
  saleId: string | null;
  number: string;
  lines: { name: string; quantity: number; unit: string; unitPrice: number; discountPercent: number }[];
  totals: DocumentTotals;
  payments: PaymentDraft[];
  changeDue: number;
  customerName: string | null;
  cashierName: string;
  branchName: string;
  soldAt: Date;
  /** Quick service only: the number called out at the counter. */
  orderNumber?: number | null;
  /**
   * Rung up with no connection. There is no document number and no sale to open yet, so the
   * dialog says so rather than offering links that would go nowhere.
   */
  provisional?: boolean;
};

/**
 * Shown the moment a sale lands: change due in large type (what the cashier needs), the receipt
 * summary, and a printable copy. The printable receipt itself is a route, so it can be reprinted
 * from the sales history as well.
 */
export function ReceiptDialog({ receipt, onClose, vatEnabled }: { receipt: ReceiptData | null; onClose: () => void; vatEnabled: boolean }) {
  const format = useFormat();
  if (!receipt) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-tint-green-foreground" />
            Sale {receipt.number}
          </DialogTitle>
          <DialogDescription>
            {receipt.branchName} · {receipt.cashierName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {receipt.orderNumber ? (
            <div className="rounded-lg bg-tint-blue p-4 text-center">
              <p className="text-xs font-medium tracking-wide text-tint-blue-foreground uppercase">Call out</p>
              <p className="text-4xl font-semibold text-tint-blue-foreground tabular-nums">{receipt.orderNumber}</p>
            </div>
          ) : null}

          {receipt.changeDue > 0 ? (
            <div className="rounded-lg bg-tint-green p-4 text-center">
              <p className="text-xs font-medium tracking-wide text-tint-green-foreground uppercase">Change due</p>
              <p className="text-3xl font-semibold text-tint-green-foreground tabular-nums">{format.money(receipt.changeDue)}</p>
            </div>
          ) : null}

          <ul className="divide-y text-sm">
            {receipt.lines.map((line, index) => (
              <li key={index} className="flex items-start justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate">{line.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {format.number(line.quantity)} {line.unit} × {format.money(line.unitPrice)}
                    {line.discountPercent > 0 ? ` − ${line.discountPercent}%` : ""}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{format.money(line.quantity * line.unitPrice * (1 - line.discountPercent / 100))}</span>
              </li>
            ))}
          </ul>

          <dl className="space-y-1 border-t pt-3 text-sm">
            <Row label="Subtotal" value={format.money(receipt.totals.subtotal)} />
            {receipt.totals.discountTotal > 0 ? <Row label="Discount" value={`−${format.money(receipt.totals.discountTotal)}`} /> : null}
            {vatEnabled ? <Row label="VAT" value={format.money(receipt.totals.vatTotal)} /> : null}
            <div className="flex items-center justify-between border-t pt-1.5 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{format.money(receipt.totals.grandTotal)}</dd>
            </div>
            {receipt.payments.map((payment, index) => (
              <Row
                key={index}
                label={PAYMENT_METHODS.find((m) => m.value === payment.method)?.label ?? payment.method}
                value={format.money(payment.amount)}
              />
            ))}
          </dl>
        </div>

        {/**
          * An offline sale has no record on the server yet, so there is nothing to print from and
          * nothing to open. Saying so plainly beats two links that lead nowhere.
          */}
        {receipt.provisional ? (
          <Alert>
            <CloudOff />
            <AlertDescription>
              Sold with no connection. The official receipt and its number follow once this reaches the server — it is sent by itself when the
              connection returns.
            </AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          {receipt.provisional ? null : (
            <Button asChild variant="outline">
              <a href={`/pos/sales/${receipt.saleId}/receipt`} target="_blank" rel="noreferrer">
                <Printer />
                Print receipt
              </a>
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            <ShoppingCart />
            Next sale
          </Button>
        </DialogFooter>
        {receipt.provisional ? null : (
          <p className="text-center text-xs text-muted-foreground">
            <Link href={`/pos/sales/${receipt.saleId}`}>Open this sale</Link>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
