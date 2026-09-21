import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectForm } from "@/components/projects/project-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";
import { listCustomerOptions } from "@/lib/data/parties";
import { getProject } from "@/lib/data/projects";
import { today } from "@/lib/data/sales";

export const metadata: Metadata = { title: "Edit Project" };

export default async function EditProjectPage({ params }: PageProps<"/projects/[id]/edit">) {
  const { id } = await params;
  await requirePermission("PROJECTS", "edit");
  const project = await getProject(id);
  if (!project) notFound();
  const [customers, todayDate] = await Promise.all([listCustomerOptions(), today()]);
  return (
    <>
      <PageHeader title={`Edit ${project.code}`} description={project.name} />
      <ProjectForm customers={customers} today={todayDate} project={project} />
    </>
  );
}
