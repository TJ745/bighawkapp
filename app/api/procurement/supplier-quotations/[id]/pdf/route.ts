import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getSupplierQuotation } from "@/lib/data/procurement";
import { renderSupplierQuotationPdf } from "@/lib/pdf/procurement";
import { pdfResponse } from "@/lib/pdf/response";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/procurement/supplier-quotations/[id]/pdf">) {
  const auth = await getAuthContext();
  if (!auth?.can("PROCUREMENT", "view")) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const quotation = await getSupplierQuotation(id);
  if (!quotation) return new NextResponse("Not found", { status: 404 });
  const pdf = await renderSupplierQuotationPdf(quotation);
  return pdfResponse(pdf, `${quotation.number}.pdf`, request.nextUrl.searchParams.get("download") === "1");
}
