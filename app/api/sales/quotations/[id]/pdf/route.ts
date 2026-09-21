import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getQuotation } from "@/lib/data/sales";
import { pdfResponse } from "@/lib/pdf/response";
import { renderQuotationPdf } from "@/lib/pdf/sales";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/sales/quotations/[id]/pdf">) {
  const auth = await getAuthContext();
  if (!auth?.can("SALES", "view")) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const quotation = await getQuotation(id);
  if (!quotation) return new NextResponse("Not found", { status: 404 });
  const pdf = await renderQuotationPdf(quotation);
  return pdfResponse(pdf, `${quotation.number}.pdf`, request.nextUrl.searchParams.get("download") === "1");
}
