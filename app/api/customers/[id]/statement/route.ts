import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getCustomerStatement } from "@/lib/data/statements";
import { today } from "@/lib/data/sales";
import { pdfResponse } from "@/lib/pdf/response";
import { renderCustomerStatementPdf } from "@/lib/pdf/sales";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/customers/[id]/statement">) {
  // A statement is a summary of what Sales already issued, so it is Sales to read.
  const auth = await getAuthContext();
  if (!auth?.can("SALES", "view")) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;

  const search = request.nextUrl.searchParams;
  const dateOnly = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
  const statement = await getCustomerStatement(id, { from: dateOnly(search.get("from")), to: dateOnly(search.get("to")) }, await today());
  if (!statement) return new NextResponse("Not found", { status: 404 });

  const pdf = await renderCustomerStatementPdf(statement);
  const name = `Statement ${statement.customer.name}`.replace(/[^\w\s-]/g, "").trim();
  return pdfResponse(pdf, `${name}.pdf`, search.get("download") === "1");
}
