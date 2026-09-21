import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getInvoice } from "@/lib/data/sales";
import { pdfResponse } from "@/lib/pdf/response";
import { renderInvoicePdf } from "@/lib/pdf/sales";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/sales/invoices/[id]/pdf">) {
  const auth = await getAuthContext();
  if (!auth?.can("SALES", "view")) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) return new NextResponse("Not found", { status: 404 });
  const pdf = await renderInvoicePdf(invoice);
  return pdfResponse(pdf, `${invoice.number}.pdf`, request.nextUrl.searchParams.get("download") === "1");
}
