"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorize } from "@/lib/auth/session";
import { formDataToObject, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { nextDocumentNumber } from "@/lib/business/numbering";
import { assertCustomerUsable } from "@/lib/business/sales";
import { parseDateOnly } from "@/lib/dates";
import { deleteStoredFile, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, storeFile } from "@/lib/storage";
import { projectSchema } from "@/lib/validation/projects";
import { ProjectStatus } from "@/lib/generated/prisma/enums";
import { z } from "zod";

const LIST_PATH = "/projects";

function revalidate(id?: string, customerId?: string) {
  revalidatePath(LIST_PATH);
  if (id) revalidatePath(`${LIST_PATH}/${id}`);
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

function documentFiles(formData: FormData) {
  return formData.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0 && Boolean(f.name));
}

async function storeProjectDocuments(projectId: string, files: File[], userId: string) {
  if (files.length === 0) return;
  const rows = [];
  for (const file of files) {
    const saved = await storeFile(file, `projects/${projectId}`, { allowedTypes: DOCUMENT_TYPES, maxBytes: MAX_DOCUMENT_BYTES });
    rows.push({ projectId, name: saved.name, fileKey: saved.key, mimeType: saved.mimeType, size: saved.size, uploadedById: userId });
  }
  await db.projectDocument.createMany({ data: rows });
}

export async function createProject(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorize("PROJECTS", "create");
    const input = parseInput(projectSchema, formDataToObject(formData));
    await assertCustomerUsable(input.customerId);

    const project = await db.$transaction(async (tx) => {
      const code = await nextDocumentNumber(tx, "PROJECT", parseDateOnly(input.startDate));
      return tx.project.create({
        data: {
          code,
          customerId: input.customerId,
          name: input.name,
          type: input.type,
          startDate: parseDateOnly(input.startDate),
          expectedCompletionDate: input.expectedCompletionDate ? parseDateOnly(input.expectedCompletionDate) : null,
          value: input.value,
          status: input.status,
          notes: input.notes,
          createdById: auth.user.id,
        },
      });
    });
    await storeProjectDocuments(project.id, documentFiles(formData), auth.user.id);

    revalidate(project.id, input.customerId);
    return { id: project.id };
  });
}

export async function updateProject(id: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("PROJECTS", "edit");
    const existing = await db.project.findUnique({ where: { id }, select: { customerId: true } });
    if (!existing) throw new BusinessError("Project not found.");
    const input = parseInput(projectSchema, formDataToObject(formData));
    await assertCustomerUsable(input.customerId);
    if (input.customerId !== existing.customerId) {
      // Linked sales documents belong to the original customer; changing it would break the link.
      const linked = await db.invoice.count({ where: { projectId: id } });
      const linkedQuotes = await db.quotation.count({ where: { projectId: id } });
      if (linked + linkedQuotes > 0) throw new BusinessError("The customer cannot change while invoices or quotations are linked to this project.");
    }

    await db.project.update({
      where: { id },
      data: {
        customerId: input.customerId,
        name: input.name,
        type: input.type,
        startDate: parseDateOnly(input.startDate),
        expectedCompletionDate: input.expectedCompletionDate ? parseDateOnly(input.expectedCompletionDate) : null,
        value: input.value,
        status: input.status,
        notes: input.notes,
      },
    });
    await storeProjectDocuments(id, documentFiles(formData), auth.user.id);

    revalidate(id, input.customerId);
    if (existing.customerId !== input.customerId) revalidate(undefined, existing.customerId);
  });
}

/** Status-only change, for the pickers on the project list and profile. */
export async function setProjectStatus(id: string, status: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("PROJECTS", "edit");
    const value = parseInput(z.enum(ProjectStatus), status);
    const project = await db.project.findUnique({ where: { id }, select: { customerId: true, status: true } });
    if (!project) throw new BusinessError("Project not found.");
    if (project.status === value) return;
    await db.project.update({ where: { id }, data: { status: value } });
    revalidate(id, project.customerId);
  });
}

export async function uploadProjectDocuments(id: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("PROJECTS", "edit");
    const project = await db.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) throw new BusinessError("Project not found.");
    const files = documentFiles(formData);
    if (files.length === 0) throw new BusinessError("Choose at least one file to upload.");
    await storeProjectDocuments(id, files, auth.user.id);
    revalidate(id);
  });
}

export async function deleteProjectDocument(id: string, documentId: string): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("PROJECTS", "edit");
    const doc = await db.projectDocument.findFirst({ where: { id: documentId, projectId: id } });
    if (!doc) throw new BusinessError("Document not found.");
    await db.projectDocument.delete({ where: { id: documentId } });
    await deleteStoredFile(doc.fileKey);
    revalidate(id);
  });
}
