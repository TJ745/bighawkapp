"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Eye, Inbox, PackageMinus, PackagePlus, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { DocumentView } from "@/components/documents/document-view";
import { RecordPaymentDialog, type PaymentAccountOption } from "@/components/documents/record-payment-dialog";
import { markPurchaseReceived, recordPurchasePayment } from "@/actions/purchases";
import { PURCHASE_STATUS } from "@/lib/business/procurement-status";
import type { PurchaseDetail } from "@/lib/data/procurement";
import type { PurchaseReceiptRow } from "@/lib/data/receiving";
import { ReceiveDialog, type ReceivableItemOption, type ReceivableLineView } from "./receive-dialog";
import { ReturnGoodsDialog, type ReturnableLineView } from "./return-goods-dialog";
import type { PurchaseReturnRow } from "@/lib/data/purchase-returns";

type Props = {
  purchase: PurchaseDetail;
  canEdit: boolean;
  showVat: boolean;
  accounts: PaymentAccountOption[];
  today: string;
  /** Receiving goods needs the POS module and inventory rights, so the page says whether it may. */
  canReceive: boolean;
  receivable: ReceivableLineView[];
  receivableItems: ReceivableItemOption[];
  branches: { id: string; name: string }[];
  currentBranchId: string | null;
  receipts: PurchaseReceiptRow[];
  canReturn: boolean;
  returnable: ReturnableLineView[];
  returns: PurchaseReturnRow[];
};

export function PurchaseDetailView({
  purchase: p,
  canEdit,
  showVat,
  accounts,
  today,
  canReceive,
  receivable,
  receivableItems,
  branches,
  currentBranchId,
  receipts,
  canReturn,
  returnable,
  returns,
}: Props) {
  const router = useRouter();
  const format = useFormat();
  const [payOpen, setPayOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [goodsOpen, setGoodsOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const outstanding = receivable.filter((line) => line.outstandingQuantity > 0);
  const status = PURCHASE_STATUS[p.status];
  const pdfUrl = `/api/procurement/purchases/${p.id}/pdf`;

  async function markReceived() {
    const result = await markPurchaseReceived(p.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked as received");
    router.refresh();
  }

  const extraTotals =
    p.paidTotal > 0
      ? [
          { label: "Paid", value: p.paidTotal, negative: true },
          { label: "Balance", value: p.remaining, emphasis: true },
        ]
      : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href="/procurement/purchases">
              <ArrowLeft />
              All purchases
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{p.number}</h1>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            {p.supplierQuotation ? (
              <Link href={`/procurement/supplier-quotations/${p.supplierQuotation.id}`} className="text-sm text-primary hover:underline">
                From {p.supplierQuotation.number}
              </Link>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {p.supplier.name} · {format.money(p.grandTotal)}
            {p.remaining > 0 && p.paidTotal > 0 ? ` · ${format.money(p.remaining)} remaining` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              <Eye />
              Print
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`${pdfUrl}?download=1`}>
              <Download />
              Download PDF
            </a>
          </Button>
          {canEdit ? (
            <Button asChild variant="outline">
              <Link href={`/procurement/purchases/${p.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          ) : null}
          {canReceive && outstanding.length > 0 ? (
            <Button variant="outline" onClick={() => setGoodsOpen(true)}>
              <PackagePlus />
              Receive goods
            </Button>
          ) : null}
          {canReturn && returnable.length > 0 ? (
            <Button variant="outline" onClick={() => setReturnOpen(true)}>
              <PackageMinus />
              Send goods back
            </Button>
          ) : null}
          {canEdit && !p.receivedAt ? (
            <Button variant="outline" onClick={() => setReceiveOpen(true)}>
              <Inbox />
              Mark as received
            </Button>
          ) : null}
          {canEdit && p.remaining > 0 ? (
            <Button onClick={() => setPayOpen(true)}>
              <Wallet />
              Record Payment
            </Button>
          ) : null}
        </div>
      </div>

      <DocumentView
        kind="purchase"
        documentId={p.id}
        party={p.supplier}
        meta={[
          { label: "Purchase date", value: format.date(p.date) },
          { label: "Due date", value: format.date(p.dueDate) },
          { label: "Payment term", value: p.paymentTermDays === 0 ? "Due immediately" : `${p.paymentTermDays} days` },
          { label: "Supplier invoice", value: p.supplierReference ?? "—" },
          { label: "Received", value: p.receivedAt ? format.dateTime(p.receivedAt) : "Not yet" },
          {
            label: "For customer",
            value: p.customer ? (
              <Link href={`/customers/${p.customer.id}`} className="hover:underline">
                {p.customer.name}
              </Link>
            ) : (
              "General"
            ),
          },
          ...(p.project
            ? [
                {
                  label: "Project",
                  value: (
                    <Link href={`/projects/${p.project.id}`} className="hover:underline">
                      {p.project.code} · {p.project.name}
                    </Link>
                  ),
                },
              ]
            : []),
        ]}
        items={p.items}
        totals={p}
        extraTotals={extraTotals}
        internalNotes={p.notes}
        attachments={p.attachments}
        canEdit={canEdit}
        showVat={showVat}
      />

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {p.payments.length === 0 ? (
            <p className="px-6 pb-4 text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Payment</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Paid from</TableHead>
                  <TableHead className="hidden md:table-cell">Reference</TableHead>
                  <TableHead className="pr-6 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.payments.map((pay) => (
                  <TableRow key={pay.id}>
                    <TableCell className="pl-6 font-medium">{pay.number}</TableCell>
                    <TableCell>{format.date(pay.date)}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{pay.paymentAccount.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{pay.reference ?? "—"}</TableCell>
                    <TableCell className="pr-6 text-right font-medium tabular-nums">{format.money(pay.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        documentNumber={p.number}
        remaining={p.remaining}
        today={today}
        accounts={accounts}
        direction="paid"
        record={(values) => recordPurchasePayment(p.id, values)}
      />
      {receipts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Deliveries</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Receipt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Into</TableHead>
                  <TableHead className="hidden md:table-cell">What arrived</TableHead>
                  <TableHead className="pr-6 text-right">At cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((receipt) => (
                  <TableRow key={receipt.id}>
                    <TableCell className="pl-6 font-medium">
                      {receipt.number}
                      {receipt.status === "CANCELLED" ? <span className="ml-2 text-xs text-muted-foreground">cancelled</span> : null}
                    </TableCell>
                    <TableCell>{format.date(receipt.date)}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{receipt.branchName}</TableCell>
                    <TableCell className="hidden max-w-72 truncate text-muted-foreground md:table-cell">
                      {receipt.lines.map((line) => `${format.number(line.quantity)} × ${line.name}`).join(", ")}
                    </TableCell>
                    <TableCell className="pr-6 text-right font-medium tabular-nums">
                      {receipt.status === "CANCELLED" ? "—" : format.money(receipt.value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {returns.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sent back</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Return</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Out of</TableHead>
                  <TableHead className="hidden md:table-cell">Why</TableHead>
                  <TableHead className="text-right">Off the bill</TableHead>
                  <TableHead className="pr-6 text-right">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-6 font-medium">
                      {row.number}
                      {row.status === "CANCELLED" ? <span className="ml-2 text-xs text-muted-foreground">cancelled</span> : null}
                    </TableCell>
                    <TableCell>{format.date(row.date)}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{row.branchName}</TableCell>
                    <TableCell className="hidden max-w-72 truncate text-muted-foreground md:table-cell">{row.reason}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {row.status === "CANCELLED" ? "—" : format.money(row.grandTotal)}
                      {row.refundedTotal > 0 ? (
                        <span className="block text-xs font-normal text-muted-foreground">{format.money(row.refundedTotal)} back</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      {/* The paperwork that travels with the goods. */}
                      <Button asChild variant="ghost" size="sm">
                        <a href={`/api/procurement/returns/${row.id}/pdf`} target="_blank" rel="noopener noreferrer">
                          <Download />
                          <span className="sr-only">Download {row.number}</span>
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <ReturnGoodsDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        purchaseId={p.id}
        purchaseNumber={p.number}
        lines={returnable}
        branches={branches}
        currentBranchId={currentBranchId}
        accounts={accounts}
        paidTotal={p.paidTotal}
        today={today}
      />

      <ReceiveDialog
        open={goodsOpen}
        onOpenChange={setGoodsOpen}
        purchaseId={p.id}
        purchaseNumber={p.number}
        lines={receivable}
        items={receivableItems}
        branches={branches}
        currentBranchId={currentBranchId}
        today={today}
      />

      <ConfirmDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        title="Mark as received?"
        description="The goods or services have been received. The purchase will count towards what you owe the supplier."
        confirmLabel="Mark as received"
        onConfirm={markReceived}
      />
    </div>
  );
}
