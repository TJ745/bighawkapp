import type { Metadata } from "next";
import { ProjectsTable } from "@/components/projects/projects-table";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";
import { listProjects } from "@/lib/data/projects";
import { parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const auth = await requirePermission("PROJECTS", "view");
  const params = parseListParams(await searchParams);
  const { items, total } = await listProjects(params);
  return (
    <>
      <PageHeader title="Projects" description="Customer projects with their sales, purchases and documents." />
      <ProjectsTable
        items={items}
        total={total}
        page={params.page}
        hasQuery={Boolean(params.q) || params.filter !== "all"}
        canCreate={auth.can("PROJECTS", "create")}
        canEdit={auth.can("PROJECTS", "edit")}
      />
    </>
  );
}
