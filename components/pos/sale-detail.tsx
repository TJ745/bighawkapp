"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Loader2, Printer, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { voidSale } from "@/actions/pos";
import type { SaleDetail } from "@/lib/data/pos";
import { PAYMENT_METHODS, SALE_STATUS_LABELS } from "@/lib/validation/pos";
import { ReturnDialog, type ReturnableLineView } from "./return-dialog";

type Props = {
  sale: SaleDetail;
  canVoid: boolean;
  canRefund: boolean;
  vatEnabled: boolean;
  returnable: ReturnableLineView[];
  accounts: { id: string; name: string; type: string }[];
};

export function SaleDetailView({ sale, canVoid, canRefund, vatEnabled, returnable, accounts }: Props) {
  const format = useFormat();
  const [voidOpen, setVoidOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const hasReturnable = returnable.some((line) => line.returnableQuantity > 0);
  const canReturnNow = canRefund && hasReturnable && (sale.status === "COMPLETED" || sale.status === "PARTIALLY_REFUNDED");
  const status = SALE_STATUS_LABELS[sale.status];
  const margin = sale.grandTotal > 0 ? Math.round(((sale.grandTotal - sale.costTotal) / sale.grandTotal) * 1000) / 10 : 0;

  return (
    <div className="space-y-6">
      {sale.status === "VOIDED" ? (
        <Alert>
          <AlertDescription>
            Voided{sale.voidedByName ? ` by ${sale.voidedByName}` : ""}
            {sale.voidedAt ? ` on ${format.dateTime(sale.voidedAt)}` : ""}
            {sale.voidReason ? ` — ${sale.voidReason}` : ""}. Stock went back and the money was reversed.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{sale.number}</h2>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </div>
          <p className="text-sm text-muted-foreground">
            {format.dateTime(sale.soldAt)} · {sale.branch.name}
            {sale.register ? ` · ${sale.register.name}` : ""} · {sale.cashierName}
            {sale.table ? ` · ${sale.table.name}` : ""}
            {sale.tabName ? ` · tab ${sale.tabName}` : ""}
            {sale.orderNumber ? ` · order ${sale.orderNumber}` : ""}
            {sale.guestCount ? ` · ${sale.guestCount} guests` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/pos/sales/${sale.id}/receipt`} target="_blank" rel="noreferrer">
              <Printer />
              Receipt
            </a>
          </Button>
          {canReturnNow ? (
            <Button variant="outline" onClick={() => setReturnOpen(true)}>
              <RotateCcw />
              Return items
            </Button>
          ) : null}
          {canVoid && sale.status === "COMPLETED" ? (
            <Button variant="destructive" onClick={() => setVoidOpen(true)}>
              <Ban />
              Void sale
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>
            {sale.customer ? (
              <>
                Sold to <Link href={`/customers/${sale.customer.id}`}>{sale.customer.name}</Link>
              </>
            ) : (
              "Walk-in customer"
            )}
            {sale.cartDiscountPercent > 0 ? ` · ${sale.cartDiscountPercent}% off the whole sale` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Discount</TableHead>
                {vatEnabled ? <TableHead className="hidden text-right md:table-cell">VAT</TableHead> : null}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sale.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="font-medium">{item.name}</p>
                    {item.modifiers.length > 0 ? (
                      <p className="text-xs text-muted-foreground">{item.modifiers.map((modifier) => modifier.optionName).join(", ")}</p>
                    ) : null}
                    {item.ingredients.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Used {item.ingredients.map((ingredient) => `${format.number(ingredient.quantity)} ${ingredient.unit} ${ingredient.name}`).join(", ")}
                      </p>
                    ) : null}
                    {item.sku ? <p className="text-xs text-muted-foreground">{item.sku}</p> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {format.number(item.quantity)} {item.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{format.money(item.unitPrice)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {item.lineDiscount > 0 ? `−${format.money(item.lineDiscount)}` : "—"}
                  </TableCell>
                  {vatEnabled ? <TableCell className="hidden text-right tabular-nums md:table-cell">{format.money(item.lineVat)}</TableCell> : null}
                  <TableCell className="text-right font-medium tabular-nums">{format.money(item.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Totals</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1.5 text-sm">
              <Row label="Subtotal" value={format.money(sale.subtotal)} />
              {sale.discountTotal > 0 ? <Row label="Discount" value={`−${format.money(sale.discountTotal)}`} /> : null}
              {vatEnabled ? <Row label="VAT" value={format.money(sale.vatTotal)} /> : null}
              <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{format.money(sale.grandTotal)}</dd>
              </div>
              <Row label="Cost of goods" value={format.money(sale.costTotal)} />
              <Row label="Gross margin" value={`${format.money(sale.grandTotal - sale.costTotal)} (${margin}%)`} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
            <CardDescription>Recorded against the company payment accounts, so Finance sees it.</CardDescription>
          </CardHeader>
          <CardContent>
            {sale.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{sale.status === "PARKED" ? "Nothing taken yet — this sale is on hold." : "No payment recorded."}</p>
            ) : (
              <dl className="space-y-1.5 text-sm">
                {sale.payments.map((payment) => (
                  <Row
                    key={payment.id}
                    label={`${payment.isRefund ? "Refund — " : ""}${PAYMENT_METHODS.find((m) => m.value === payment.method)?.label ?? payment.method} · ${payment.accountName}${payment.reference ? ` · ${payment.reference}` : ""}`}
                    value={format.money(payment.amount)}
                  />
                ))}
                <div className="flex items-center justify-between border-t pt-2 font-medium">
                  <dt>Paid</dt>
                  <dd className="tabular-nums">{format.money(sale.paidTotal)}</dd>
                </div>
                {sale.changeDue > 0 ? <Row label="Change given" value={format.money(sale.changeDue)} /> : null}
                {sale.refundedTotal > 0 ? (
                  <>
                    <Row label="Refunded" value={"−" + format.money(sale.refundedTotal)} />
                    <div className="flex items-center justify-between border-t pt-2 font-medium">
                      <dt>Kept</dt>
                      <dd className="tabular-nums">{format.money(sale.paidTotal - sale.refundedTotal)}</dd>
                    </div>
                  </>
                ) : null}
              </dl>
            )}
            {sale.note ? <p className="mt-4 text-sm text-muted-foreground">{sale.note}</p> : null}
          </CardContent>
        </Card>
      </div>

      {sale.returns.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Returns</CardTitle>
            <CardDescription>What came back from this sale and what was handed over.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return</TableHead>
                  <TableHead className="hidden sm:table-cell">Reason</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="text-right">Refunded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.returns.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="font-medium">{row.number}</p>
                      <p className="text-xs text-muted-foreground">
                        {format.dateTime(row.returnedAt)} · {row.userName}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{row.reason}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.itemCount}</TableCell>
                    <TableCell>
                      <StatusBadge tone={row.restock ? "success" : "warning"}>{row.restock ? "Restocked" : "Written off"}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{format.money(row.grandTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <ReturnDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        saleId={sale.id}
        saleNumber={sale.number}
        lines={returnable}
        accounts={accounts}
        registerId={sale.registerId}
        vatEnabled={vatEnabled}
      />
      <VoidDialog open={voidOpen} saleId={sale.id} number={sale.number} onClose={() => setVoidOpen(false)} />
    </div>
  );
}

function VoidDialog({ open, saleId, number, onClose }: { open: boolean; saleId: string; number: string; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const result = await voidSale({ saleId, reason });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${number} voided`);
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void {number}?</DialogTitle>
          <DialogDescription>
            The items go back into stock and the payments are reversed, so this sale stops counting as income. The record itself is kept.
          </DialogDescription>
        </DialogHeader>
        <FormField label="Reason" htmlFor="void-reason" required description="Kept on the sale and in the audit trail.">
          <Textarea id="void-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={saving || !reason.trim()}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Void sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-muted-foreground">
      <dt className="min-w-0">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}
