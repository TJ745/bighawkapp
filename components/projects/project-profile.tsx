"use client";

import Link from "next/link";
import { ArrowLeft, Download, Eye, FolderKanban, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import type { ProjectDetail } from "@/lib/data/projects";
import { PROJECT_STATUS, projectTypeLabel } from "@/lib/validation/projects";
import { ProjectDocuments } from "./project-documents";

type Props = {
  project: ProjectDetail;
  canEdit: boolean;
  initialTab?: string;
  sales: React.ReactNode;
  purchases: React.ReactNode;
};

export function ProjectProfile({ project, canEdit, initialTab, sales, purchases }: Props) {
  const format = useFormat();
  const status = PROJECT_STATUS[project.status];
  const f = project.financials;
  const pdfUrl = `/api/projects/${project.id}/pdf`;
  const tabs = ["overview", "sales", "purchases", "documents"];
  const defaultTab = initialTab && tabs.includes(initialTab) ? initialTab : "overview";

  const summary = [
    { label: "Project value", value: f.value },
    { label: "Total sales", value: f.totalSales, hint: "Invoiced" },
    { label: "Total purchases", value: f.totalPurchases },
    { label: "Total paid", value: f.totalPaid, hint: "Received from customer", tone: "text-success" },
    { label: "Outstanding", value: f.outstanding, tone: f.outstanding > 0 ? "text-warning-foreground dark:text-warning" : "" },
    { label: "Estimated profit", value: f.estimatedProfit, hint: "Value − purchases", tone: f.estimatedProfit < 0 ? "text-destructive" : "text-success" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href="/projects">
              <ArrowLeft />
              All projects
            </Link>
          </Button>
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FolderKanban className="size-6" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </div>
              <p className="text-sm text-muted-foreground">
                {project.code} · {projectTypeLabel(project.type)} ·{" "}
                <Link href={`/customers/${project.customer.id}`} className="hover:underline">
                  {project.customer.name}
                </Link>
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              <Eye />
              Print
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`${pdfUrl}?download=1`}>
              <Download />
              Download PDF
            </a>
          </Button>
          {canEdit ? (
            <Button asChild>
              <Link href={`/projects/${project.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summary.map((s) => (
          <Card key={s.label} size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-semibold tabular-nums ${s.tone ?? ""}`}>{format.money(s.value)}</p>
              {s.hint ? <p className="text-xs text-muted-foreground">{s.hint}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="no-scrollbar h-auto w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <Item label="Project code" value={project.code} />
                  <Item label="Type" value={projectTypeLabel(project.type)} />
                  <Item label="Start date" value={format.date(project.startDate)} />
                  <Item label="Expected completion" value={project.expectedCompletionDate ? format.date(project.expectedCompletionDate) : "—"} />
                </dl>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-base">Customer</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <Item label="Name" value={project.customer.name} />
                  <Item label="Contact" value={project.customer.contactPerson ?? "—"} />
                  <Item label="Phone" value={project.customer.phone} />
                  <Item label="Email" value={project.customer.email ?? "—"} />
                </dl>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{project.notes || <span className="text-muted-foreground">No notes.</span>}</CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="sales" className="pt-4">
          {sales}
        </TabsContent>
        <TabsContent value="purchases" className="pt-4">
          {purchases}
        </TabsContent>
        <TabsContent value="documents" className="pt-4">
          <ProjectDocuments projectId={project.id} documents={project.documents} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
