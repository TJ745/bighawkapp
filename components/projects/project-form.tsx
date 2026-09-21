"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/shared/combobox";
import { FilePicker, type PendingFile } from "@/components/shared/file-picker";
import { FormField } from "@/components/shared/form-field";
import { createProject, updateProject } from "@/actions/projects";
import type { PartyOption } from "@/lib/data/parties";
import type { ProjectDetail } from "@/lib/data/projects";
import type { ProjectStatus, ProjectType } from "@/lib/generated/prisma/enums";
import { toDateOnly } from "@/lib/dates";
import { applyFieldErrors } from "@/lib/form-errors";
import { PROJECT_STATUS, PROJECT_TYPES, projectSchema, type ProjectFormValues, type ProjectValues } from "@/lib/validation/projects";

type ProjectFormProps = {
  customers: PartyOption[];
  today: string;
  project?: ProjectDetail;
  customerId?: string;
};

export function ProjectForm({ customers, today, project, customerId }: ProjectFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);

  const form = useForm<ProjectFormValues, unknown, ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      customerId: project?.customerId ?? customerId ?? "",
      name: project?.name ?? "",
      type: project?.type ?? "IT_INFRASTRUCTURE",
      startDate: project ? toDateOnly(project.startDate) : today,
      expectedCompletionDate: project?.expectedCompletionDate ? toDateOnly(project.expectedCompletionDate) : "",
      value: project?.value ?? 0,
      status: project?.status ?? "NOT_STARTED",
      notes: project?.notes ?? "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const [watchCustomer, watchType, watchStatus] = useWatch({ control: form.control, name: ["customerId", "type", "status"] });

  async function onSubmit(values: ProjectValues) {
    setFormError(null);
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) formData.set(key, value === null || value === undefined ? "" : String(value));
    for (const f of files) formData.append("documents", f.file);

    let id = project?.id;
    if (project) {
      const result = await updateProject(project.id, formData);
      if (!result.success) {
        applyFieldErrors(form, result.fieldErrors);
        setFormError(result.error);
        return;
      }
    } else {
      const result = await createProject(formData);
      if (!result.success) {
        applyFieldErrors(form, result.fieldErrors);
        setFormError(result.error);
        return;
      }
      id = result.data.id;
    }
    toast.success(project ? "Project saved" : "Project created");
    router.push(`/projects/${id}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
          <CardDescription>{project ? project.code : "The project code is assigned automatically when you save."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <FormField label="Customer" htmlFor="project-customer" required error={errors.customerId?.message}>
            <Combobox
              id="project-customer"
              options={customers.map((c) => ({ value: c.id, label: c.name, description: c.email ?? undefined }))}
              value={watchCustomer}
              onChange={(v) => form.setValue("customerId", v, { shouldDirty: true, shouldValidate: true })}
              placeholder="Choose a customer"
              searchPlaceholder="Search customers…"
              emptyText="No active customers found."
              invalid={Boolean(errors.customerId)}
            />
          </FormField>
          <FormField label="Project name" htmlFor="project-name" required error={errors.name?.message}>
            <Input id="project-name" {...form.register("name")} />
          </FormField>
          <FormField label="Project type" htmlFor="project-type" required error={errors.type?.message}>
            <Select value={watchType} onValueChange={(v) => form.setValue("type", v as ProjectType, { shouldDirty: true })}>
              <SelectTrigger id="project-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Status" htmlFor="project-status" required error={errors.status?.message}>
            <Select value={watchStatus} onValueChange={(v) => form.setValue("status", v as ProjectStatus, { shouldDirty: true })}>
              <SelectTrigger id="project-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PROJECT_STATUS) as ProjectStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {PROJECT_STATUS[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Start date" htmlFor="project-start" required error={errors.startDate?.message}>
            <Input id="project-start" type="date" {...form.register("startDate")} />
          </FormField>
          <FormField label="Expected completion" htmlFor="project-end" error={errors.expectedCompletionDate?.message}>
            <Input id="project-end" type="date" {...form.register("expectedCompletionDate")} />
          </FormField>
          <FormField label="Project value (SAR)" htmlFor="project-value" required description="The agreed value of the project." error={errors.value?.message}>
            <Input id="project-value" type="number" step="0.01" min={0} {...form.register("value")} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes & documents</CardTitle>
          <CardDescription>{project ? "Existing documents are managed from the Documents tab." : "Contracts, scope documents and other files."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <FormField label="Notes" htmlFor="project-notes" error={errors.notes?.message}>
            <Textarea id="project-notes" rows={4} {...form.register("notes")} />
          </FormField>
          <FilePicker files={files} onChange={setFiles} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={project ? `/projects/${project.id}` : "/projects"}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {project ? "Save changes" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
