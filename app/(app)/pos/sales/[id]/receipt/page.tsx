import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReceiptPrint } from "@/components/pos/receipt-print";
import { requireModule } from "@/lib/auth/session";
import { getSale } from "@/lib/data/pos";
import { getAppSettings, getCompanySettings } from "@/lib/data/settings";
import { getFormatters } from "@/lib/settings/formatters";
import { zatcaStamp } from "@/lib/data/zatca";

export const metadata: Metadata = { title: "Receipt" };

/**
 * The printable receipt: 80 mm wide, opens the print dialog itself, and can be reached again from
 * the sales history — which is what "reprint receipt" means in practice.
 */
export default async function ReceiptPage({ params }: PageProps<"/pos/sales/[id]/receipt">) {
  const { id } = await params;
  await requireModule("POS", "POS", "view");
  const [sale, company, settings, format] = await Promise.all([getSale(id), getCompanySettings(), getAppSettings(), getFormatters()]);
  if (!sale) notFound();

  /**
   * A till receipt is a *simplified* tax invoice, which is the kind that must carry the QR code.
   * It is built from the stored sale, so a reprint months later produces the same code as the
   * original — the figures are the sale's, not the screen's.
   */
  const stamp = await zatcaStamp({
    document: "INVOICE",
    buyer: sale.customer,
    issuedAt: sale.soldAt,
    totalWithVat: sale.grandTotal,
    vatTotal: sale.vatTotal,
  });

  return (
    <ReceiptPrint
      sale={{
        number: sale.number,
        orderNumber: sale.orderNumber,
        soldAt: format.dateTime(sale.soldAt),
        cashierName: sale.cashierName,
        registerName: sale.register?.name ?? null,
        customerName: sale.customer?.name ?? null,
        status: sale.status,
        subtotal: format.money(sale.subtotal),
        discountTotal: sale.discountTotal > 0 ? format.money(sale.discountTotal) : null,
        vatTotal: settings.vatEnabled ? format.money(sale.vatTotal) : null,
        grandTotal: format.money(sale.grandTotal),
        changeDue: sale.changeDue > 0 ? format.money(sale.changeDue) : null,
        note: sale.note,
        items: sale.items.map((item) => ({
          name: item.modifiers.length > 0 ? `${item.name} (${item.modifiers.map((modifier) => modifier.optionName).join(", ")})` : item.name,
          detail: `${format.number(item.quantity)} ${item.unit} × ${format.money(item.unitPrice)}${item.discountPercent > 0 ? ` − ${item.discountPercent}%` : ""}`,
          total: format.money(item.lineTotal),
        })),
        payments: sale.payments.map((payment) => ({
          label: `${payment.method.charAt(0)}${payment.method.slice(1).toLowerCase()}${payment.reference ? ` · ${payment.reference}` : ""}`,
          amount: format.money(payment.amount),
        })),
      }}
      branch={{
        name: sale.branch.name,
        address: sale.branch.address,
        phone: sale.branch.phone,
        /**
         * On a tax invoice the printed VAT number must be the one inside the QR, and that is the
         * company's registration — in Saudi Arabia a branch is not separately registered. So a
         * branch-level number stays a display detail for ordinary receipts and is set aside here,
         * rather than letting the paper and the QR state two different taxpayers.
         */
        vatNumber: stamp ? company.vatNumber : (sale.branch.vatNumber ?? company.vatNumber),
      }}
      company={{ name: company.companyName, footer: settings.pdfFooterText }}
      zatca={stamp ? { title: stamp.title, nameAr: company.companyNameAr, qr: stamp.qr } : null}
    />
  );
}
