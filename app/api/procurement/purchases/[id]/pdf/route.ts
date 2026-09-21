import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getPurchase } from "@/lib/data/procurement";
import { renderPurchasePdf } from "@/lib/pdf/procurement";
import { pdfResponse } from "@/lib/pdf/response";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/procurement/purchases/[id]/pdf">) {
  const auth = await getAuthContext();
  if (!auth?.can("PROCUREMENT", "view")) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const purchase = await getPurchase(id);
  if (!purchase) return new NextResponse("Not found", { status: 404 });
  const pdf = await renderPurchasePdf(purchase);
  return pdfResponse(pdf, `${purchase.number}.pdf`, request.nextUrl.searchParams.get("download") === "1");
}
