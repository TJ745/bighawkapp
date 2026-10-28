import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getPurchaseReturn } from "@/lib/data/purchase-returns";
import { pdfResponse } from "@/lib/pdf/response";
import { renderPurchaseReturnPdf } from "@/lib/pdf/procurement";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/procurement/returns/[id]/pdf">) {
  // Reading the paperwork is Procurement's, like the purchase it belongs to. Sending the goods
  // back needs more than that, and is checked in its own action.
  const auth = await getAuthContext();
  if (!auth?.can("PROCUREMENT", "view")) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const row = await getPurchaseReturn(id);
  if (!row) return new NextResponse("Not found", { status: 404 });
  const pdf = await renderPurchaseReturnPdf(row);
  return pdfResponse(pdf, `${row.number}.pdf`, request.nextUrl.searchParams.get("download") === "1");
}
