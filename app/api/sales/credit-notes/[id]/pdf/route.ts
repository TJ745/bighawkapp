import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getCreditNote } from "@/lib/data/credit-notes";
import { pdfResponse } from "@/lib/pdf/response";
import { renderCreditNotePdf } from "@/lib/pdf/sales";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/sales/credit-notes/[id]/pdf">) {
  const auth = await getAuthContext();
  if (!auth?.can("SALES", "view")) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const note = await getCreditNote(id);
  if (!note) return new NextResponse("Not found", { status: 404 });
  const pdf = await renderCreditNotePdf(note);
  return pdfResponse(pdf, `${note.number}.pdf`, request.nextUrl.searchParams.get("download") === "1");
}
