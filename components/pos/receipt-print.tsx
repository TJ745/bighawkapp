"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

type ReceiptSale = {
  number: string;
  /** Quick service only: the collection number printed large for the customer. */
  orderNumber?: number | null;
  soldAt: string;
  cashierName: string;
  registerName: string | null;
  customerName: string | null;
  status: string;
  subtotal: string;
  discountTotal: string | null;
  vatTotal: string | null;
  grandTotal: string;
  changeDue: string | null;
  note: string | null;
  items: { name: string; detail: string; total: string }[];
  payments: { label: string; amount: string }[];
};

/**
 * What a Saudi tax invoice adds to the receipt: the Arabic title, the seller's Arabic name, and
 * the QR code. Null when e-invoicing is off, so an ordinary receipt prints exactly as before.
 *
 * The QR arrives as a ready-made SVG path rather than a payload, which keeps the QR encoder out of
 * the browser bundle — the server has already worked out what to draw.
 */
export type ReceiptZatca = {
  title: { en: string; ar: string };
  nameAr: string | null;
  qr: { size: number; path: string };
};

/**
 * A thermal-style receipt: fixed 80 mm column, no app chrome when printed. Values arrive
 * pre-formatted from the server so the printed copy uses the company's date and number settings.
 */
export function ReceiptPrint({
  sale,
  branch,
  company,
  zatca,
}: {
  sale: ReceiptSale;
  branch: { name: string; address: string | null; phone: string | null; vatNumber: string | null };
  company: { name: string; footer: string };
  zatca?: ReceiptZatca | null;
}) {
  // Opening the print dialog is the whole point of this route.
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 350);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[80mm] space-y-4">
      <div className="flex justify-end print:hidden">
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
          <Printer />
          Print again
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-4 font-mono text-[11px] leading-relaxed print:border-0 print:bg-transparent print:p-0">
        <div className="space-y-0.5 text-center">
          <p className="text-sm font-semibold">{company.name || branch.name}</p>
          {zatca?.nameAr ? <p dir="rtl" className="text-sm font-semibold">{zatca.nameAr}</p> : null}
          <p>{branch.name}</p>
          {branch.address ? <p>{branch.address}</p> : null}
          {branch.phone ? <p>{branch.phone}</p> : null}
          {branch.vatNumber ? <p>VAT {branch.vatNumber}</p> : null}
          {/* Saying which kind of document this is, in both languages, is itself a requirement. */}
          {zatca ? (
            <div className="pt-1">
              <p className="font-semibold">{zatca.title.en}</p>
              <p dir="rtl" className="font-semibold">
                {zatca.title.ar}
              </p>
            </div>
          ) : null}
        </div>

        {sale.orderNumber ? (
          <div className="mt-2 text-center">
            <p className="text-[10px] tracking-wide uppercase">Order</p>
            <p className="text-3xl font-semibold">{sale.orderNumber}</p>
          </div>
        ) : null}

        <Divider />

        <div className="space-y-0.5">
          <Line left="Receipt" right={sale.number} />
          <Line left="Date" right={sale.soldAt} />
          {sale.registerName ? <Line left="Register" right={sale.registerName} /> : null}
          <Line left="Cashier" right={sale.cashierName} />
          <Line left="Customer" right={sale.customerName ?? "Walk-in"} />
          {sale.status !== "COMPLETED" ? <Line left="Status" right={sale.status} /> : null}
        </div>

        <Divider />

        <ul className="space-y-1.5">
          {sale.items.map((item, index) => (
            <li key={index}>
              <p className="break-words">{item.name}</p>
              <Line left={item.detail} right={item.total} />
            </li>
          ))}
        </ul>

        <Divider />

        <div className="space-y-0.5">
          <Line left="Subtotal" right={sale.subtotal} />
          {sale.discountTotal ? <Line left="Discount" right={`-${sale.discountTotal}`} /> : null}
          {sale.vatTotal ? <Line left="VAT" right={sale.vatTotal} /> : null}
          <div className="mt-1 border-t border-dashed pt-1 text-xs font-semibold">
            <Line left="TOTAL" right={sale.grandTotal} />
          </div>
          {sale.payments.map((payment, index) => (
            <Line key={index} left={payment.label} right={payment.amount} />
          ))}
          {sale.changeDue ? <Line left="Change" right={sale.changeDue} /> : null}
        </div>

        {sale.note ? (
          <>
            <Divider />
            <p className="break-words">{sale.note}</p>
          </>
        ) : null}

        {/* The QR goes last, where a customer's phone can reach it without the paper curling. */}
        {zatca ? (
          <>
            <Divider />
            <ReceiptQr qr={zatca.qr} />
          </>
        ) : null}

        <Divider />
        <p className="text-center">{company.footer || "Thank you"}</p>
      </div>
    </div>
  );
}

/**
 * The ZATCA QR, drawn from the path the server built.
 *
 * `shape-rendering="crispEdges"` matters on a thermal printer: anti-aliased module edges turn into
 * grey smears at 203 dpi and stop the code scanning.
 */
function ReceiptQr({ qr }: { qr: { size: number; path: string } }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className="h-[34mm] w-[34mm]" shapeRendering="crispEdges" role="img" aria-label="Tax invoice QR code">
        <rect width={qr.size} height={qr.size} fill="#ffffff" />
        <path d={qr.path} fill="#000000" />
      </svg>
      <p className="text-[9px]">Scan to verify · امسح للتحقق</p>
    </div>
  );
}

function Line({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="min-w-0 break-words">{left}</span>
      <span className="shrink-0 tabular-nums">{right}</span>
    </div>
  );
}

function Divider() {
  return <div className="my-2 border-t border-dashed" />;
}
