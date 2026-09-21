import "server-only";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { BusinessError } from "@/lib/auth/errors";

/**
 * Local-disk file storage. Files live under STORAGE_DIR (default ./storage, outside /public)
 * and are served only through the authenticated /api/files route.
 * Swapping to object storage later means replacing the three functions below.
 */
const STORAGE_ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage"));

// Limits live in ./limits so the client and next.config.ts can read the same numbers.
export { DOCUMENT_TYPES, IMAGE_TYPES, MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES } from "./limits";

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};
const TYPE_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSION_BY_TYPE).map(([type, ext]) => [ext, type]),
);

const SAFE_KEY = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*\/[a-f0-9-]+\.[a-z0-9]+$/;

export type StoredFile = {
  key: string;
  url: string;
  name: string;
  size: number;
  mimeType: string;
};

export function fileUrl(key: string) {
  return `/api/files/${key}`;
}

export async function storeFile(
  file: File,
  folder: string,
  options: { allowedTypes: string[]; maxBytes: number },
): Promise<StoredFile> {
  if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(folder)) throw new Error(`Invalid storage folder: ${folder}`);
  if (!options.allowedTypes.includes(file.type)) {
    throw new BusinessError("This file type is not supported. Allowed: PDF, JPG, PNG, WEBP.");
  }
  if (file.size > options.maxBytes) {
    throw new BusinessError(`File is too large. Maximum size is ${Math.round(options.maxBytes / 1024 / 1024)} MB.`);
  }

  const key = `${folder}/${randomUUID()}${EXTENSION_BY_TYPE[file.type]}`;
  const target = resolveKey(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(target), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ target, Buffer.from(await file.arrayBuffer()));

  return { key, url: fileUrl(key), name: file.name, size: file.size, mimeType: file.type };
}

export async function readStoredFile(key: string): Promise<{ data: Buffer; mimeType: string } | null> {
  if (!SAFE_KEY.test(key)) return null;
  try {
    const data = await readFile(/*turbopackIgnore: true*/ resolveKey(key));
    return { data, mimeType: TYPE_BY_EXTENSION[path.extname(key)] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

export async function deleteStoredFile(key: string) {
  if (!SAFE_KEY.test(key)) return;
  try {
    await unlink(/*turbopackIgnore: true*/ resolveKey(key));
  } catch {
    // Already gone — nothing to do.
  }
}

function resolveKey(key: string) {
  if (!SAFE_KEY.test(key)) throw new Error("Invalid storage key");
  const target = path.resolve(/*turbopackIgnore: true*/ STORAGE_ROOT, key);
  if (!target.startsWith(STORAGE_ROOT + path.sep)) throw new Error("Invalid storage key");
  return target;
}

/** Extracts a File from FormData, treating empty file inputs as "no file". */
export function fileFromFormData(formData: FormData, field: string): File | null {
  const value = formData.get(field);
  if (!(value instanceof File) || value.size === 0 || !value.name) return null;
  return value;
}
