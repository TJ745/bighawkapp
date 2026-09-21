import { NextResponse, type NextRequest } from "next/server";
import type { PermissionModule } from "@/lib/generated/prisma/enums";
import { getAuthContext } from "@/lib/auth/session";
import { readStoredFile } from "@/lib/storage";

// Uploads are stored under a folder that says which module they belong to,
// so access follows the same permissions as the screens that show them.
const MODULE_BY_FOLDER: Record<string, PermissionModule> = {
  customers: "CUSTOMERS",
  quotations: "SALES",
  invoices: "SALES",
  suppliers: "PROCUREMENT",
  "supplier-quotations": "PROCUREMENT",
  purchases: "PROCUREMENT",
  projects: "PROJECTS",
  income: "FINANCE",
  expenses: "FINANCE",
};

/** Serves uploaded files (logos, photos, documents) to users allowed to see that module. */
export async function GET(_request: NextRequest, { params }: RouteContext<"/api/files/[...key]">) {
  const auth = await getAuthContext();
  if (!auth) return new NextResponse("Unauthorized", { status: 401 });

  const { key } = await params;
  // "avatars" and "branding" are visible to every signed-in user (they appear in the shell).
  const requiredModule = MODULE_BY_FOLDER[key[0] ?? ""];
  if (requiredModule && !auth.can(requiredModule, "view")) return new NextResponse("Forbidden", { status: 403 });

  const file = await readStoredFile(key.join("/"));
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.data.byteLength),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
