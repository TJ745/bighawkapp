"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import type { PermissionModule } from "@/lib/generated/prisma/enums";
import { BusinessError } from "@/lib/auth/errors";
import { authorize } from "@/lib/auth/session";
import { formDataToObject, parseInput, runAction, type ActionResult } from "@/lib/actions";
import type { PartyKind } from "@/lib/data/parties";
import { deleteStoredFile, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, storeFile } from "@/lib/storage";
import { partyDocumentCategorySchema, partySchema, type PartyValues } from "@/lib/validation/parties";

// Customers live under the Customers module, suppliers under Procurement.
const MODULE: Record<PartyKind, PermissionModule> = { customer: "CUSTOMERS", supplier: "PROCUREMENT" };
const BASE_PATH: Record<PartyKind, string> = { customer: "/customers", supplier: "/procurement/suppliers" };
const kindSchema = z.enum(["customer", "supplier"]);

function revalidate(kind: PartyKind, id?: string) {
  revalidatePath(BASE_PATH[kind]);
  if (id) revalidatePath(`${BASE_PATH[kind]}/${id}`);
}

async function findParty(kind: PartyKind, id: string) {
  const row = kind === "customer" ? await db.customer.findUnique({ where: { id } }) : await db.supplier.findUnique({ where: { id } });
  if (!row) throw new BusinessError(kind === "customer" ? "Customer not found." : "Supplier not found.");
  return row;
}

/** Reads document files from FormData ("documents" + matching "documentCategories" entries). */
function documentUploads(formData: FormData) {
  const files = formData.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0 && Boolean(f.name));
  const categories = formData.getAll("documentCategories").map((c) => partyDocumentCategorySchema.catch("OTHER").parse(c));
  return files.map((file, i) => ({ file, category: categories[i] ?? "OTHER" }));
}

async function storeDocuments(kind: PartyKind, partyId: string, uploads: { file: File; category: z.infer<typeof partyDocumentCategorySchema> }[], userId: string) {
  if (uploads.length === 0) return;
  const stored = [];
  for (const { file, category } of uploads) {
    const saved = await storeFile(file, `${kind}s/${partyId}`.replace(/[^a-z0-9/-]/gi, "-").toLowerCase(), {
      allowedTypes: DOCUMENT_TYPES,
      maxBytes: MAX_DOCUMENT_BYTES,
    });
    stored.push({ category, name: saved.name, fileKey: saved.key, mimeType: saved.mimeType, size: saved.size, uploadedById: userId });
  }
  if (kind === "customer") {
    await db.customerDocument.createMany({ data: stored.map((s) => ({ ...s, customerId: partyId })) });
  } else {
    await db.supplierDocument.createMany({ data: stored.map((s) => ({ ...s, supplierId: partyId })) });
  }
}

export async function createParty(kindInput: PartyKind, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const kind = kindSchema.parse(kindInput);
    const auth = await authorize(MODULE[kind], "create");
    const input: PartyValues = parseInput(partySchema, formDataToObject(formData));
    const uploads = documentUploads(formData);

    const row = kind === "customer" ? await db.customer.create({ data: input }) : await db.supplier.create({ data: input });
    await storeDocuments(kind, row.id, uploads, auth.user.id);

    revalidate(kind);
    return { id: row.id };
  });
}

export async function updateParty(kindInput: PartyKind, id: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const kind = kindSchema.parse(kindInput);
    const auth = await authorize(MODULE[kind], "edit");
    await findParty(kind, id);
    const input: PartyValues = parseInput(partySchema, formDataToObject(formData));
    const uploads = documentUploads(formData);

    if (kind === "customer") await db.customer.update({ where: { id }, data: input });
    else await db.supplier.update({ where: { id }, data: input });
    await storeDocuments(kind, id, uploads, auth.user.id);

    revalidate(kind, id);
  });
}

export async function setPartyActive(kindInput: PartyKind, id: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const kind = kindSchema.parse(kindInput);
    await authorize(MODULE[kind], "edit");
    await findParty(kind, id);
    if (kind === "customer") await db.customer.update({ where: { id }, data: { isActive } });
    else await db.supplier.update({ where: { id }, data: { isActive } });
    revalidate(kind, id);
  });
}

export async function uploadPartyDocuments(kindInput: PartyKind, id: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const kind = kindSchema.parse(kindInput);
    const auth = await authorize(MODULE[kind], "edit");
    await findParty(kind, id);
    const uploads = documentUploads(formData);
    if (uploads.length === 0) throw new BusinessError("Choose at least one file to upload.");
    await storeDocuments(kind, id, uploads, auth.user.id);
    revalidate(kind, id);
  });
}

export async function deletePartyDocument(kindInput: PartyKind, id: string, documentId: string): Promise<ActionResult> {
  return runAction(async () => {
    const kind = kindSchema.parse(kindInput);
    await authorize(MODULE[kind], "edit");
    const doc =
      kind === "customer"
        ? await db.customerDocument.findFirst({ where: { id: documentId, customerId: id } })
        : await db.supplierDocument.findFirst({ where: { id: documentId, supplierId: id } });
    if (!doc) throw new BusinessError("Document not found.");

    if (kind === "customer") await db.customerDocument.delete({ where: { id: documentId } });
    else await db.supplierDocument.delete({ where: { id: documentId } });
    await deleteStoredFile(doc.fileKey);

    revalidate(kind, id);
  });
}
