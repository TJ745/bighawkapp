import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getProject } from "@/lib/data/projects";
import { renderProjectPdf } from "@/lib/pdf/project";
import { pdfResponse } from "@/lib/pdf/response";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/projects/[id]/pdf">) {
  const auth = await getAuthContext();
  if (!auth?.can("PROJECTS", "view")) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return new NextResponse("Not found", { status: 404 });
  const pdf = await renderProjectPdf(project);
  return pdfResponse(pdf, `${project.code}.pdf`, request.nextUrl.searchParams.get("download") === "1");
}
