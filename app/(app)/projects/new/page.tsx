import type { Metadata } from "next";
import { ProjectForm } from "@/components/projects/project-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";
import { listCustomerOptions } from "@/lib/data/parties";
import { today } from "@/lib/data/sales";

export const metadata: Metadata = { title: "New Project" };

export default async function NewProjectPage({ searchParams }: PageProps<"/projects/new">) {
  await requirePermission("PROJECTS", "create");
  const { customer } = await searchParams;
  const [customers, todayDate] = await Promise.all([listCustomerOptions(), today()]);
  return (
    <>
      <PageHeader title="New Project" />
      <ProjectForm customers={customers} today={todayDate} customerId={typeof customer === "string" ? customer : undefined} />
    </>
  );
}
