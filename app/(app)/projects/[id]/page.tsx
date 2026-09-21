import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectProfile } from "@/components/projects/project-profile";
import { ProjectPurchasesTab, ProjectSalesTab } from "@/components/projects/project-tabs";
import { requirePermission } from "@/lib/auth/session";
import { getProject } from "@/lib/data/projects";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const auth = await requirePermission("PROJECTS", "view");
  const project = await getProject(id);
  if (!project) notFound();
  return (
    <ProjectProfile
      project={project}
      canEdit={auth.can("PROJECTS", "edit")}
      initialTab={typeof tab === "string" ? tab : undefined}
      sales={<ProjectSalesTab projectId={project.id} auth={auth} />}
      purchases={<ProjectPurchasesTab projectId={project.id} auth={auth} />}
    />
  );
}
