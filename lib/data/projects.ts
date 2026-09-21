import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { ProjectStatus } from "@/lib/generated/prisma/enums";
import { getProjectFinancials } from "@/lib/business/project-financials";
import { num } from "@/lib/decimal";
import { paginate, type ListParams } from "@/lib/list-params";
import { fileUrl } from "@/lib/storage";

const FILTERS: Record<string, ProjectStatus> = {
  "not-started": "NOT_STARTED",
  "in-progress": "IN_PROGRESS",
  completed: "COMPLETED",
  "on-hold": "ON_HOLD",
  cancelled: "CANCELLED",
};

function projectWhere(params: ListParams, customerId?: string): Prisma.ProjectWhereInput {
  const status = FILTERS[params.filter];
  return {
    ...(customerId ? { customerId } : {}),
    ...(status ? { status } : {}),
    ...(params.q
      ? {
          OR: [
            { code: { contains: params.q, mode: "insensitive" } },
            { name: { contains: params.q, mode: "insensitive" } },
            { customer: { name: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export async function listProjects(params: ListParams, customerId?: string) {
  const where = projectWhere(params, customerId);
  const [rows, total] = await Promise.all([
    db.project.findMany({
      where,
      orderBy: [{ startDate: "desc" }, { code: "desc" }],
      ...paginate(params.page),
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        startDate: true,
        expectedCompletionDate: true,
        value: true,
        status: true,
        customer: { select: { id: true, name: true } },
      },
    }),
    db.project.count({ where }),
  ]);
  return { items: rows.map((r) => ({ ...r, value: num(r.value) })), total };
}

export type ProjectListItem = Awaited<ReturnType<typeof listProjects>>["items"][number];

export async function getProject(id: string) {
  const row = await db.project.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true, contactPerson: true } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!row) return null;
  const value = num(row.value);
  const financials = (await getProjectFinancials([id], new Map([[id, value]]))).get(id)!;
  return {
    ...row,
    value,
    financials,
    documents: row.documents.map((d) => ({ ...d, url: fileUrl(d.fileKey) })),
  };
}

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProject>>>;
export type ProjectDocumentRow = ProjectDetail["documents"][number];

/** Options for pickers. Sales documents only link projects of the same customer. */
export async function listProjectOptions(customerId?: string) {
  return db.project.findMany({
    where: { status: { notIn: ["CANCELLED"] }, ...(customerId ? { customerId } : {}) },
    orderBy: [{ startDate: "desc" }],
    select: { id: true, code: true, name: true, customerId: true },
  });
}

export type ProjectOption = Awaited<ReturnType<typeof listProjectOptions>>[number];
