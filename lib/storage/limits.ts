/**
 * Upload limits, shared by the Server Actions that store files, the client-side file picker
 * and next.config.ts. Deliberately free of server-only imports so all three can read it.
 */

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const DOCUMENT_TYPES = [...IMAGE_TYPES, "application/pdf"];

/** Photos and logos. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
/** Customer/supplier/project documents and attachments. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

/** Several documents can go in one upload; this caps the whole request. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Next.js rejects Server Action requests above this size before any of our code runs, and its
 * default is only 1 MB — which failed uploads well under the 10 MB document limit. The extra
 * megabyte covers the boundaries and part headers that multipart/form-data adds. Expressed as a
 * string ("26mb") because Next only reports a readable "Body exceeded …" error for that form.
 */
export const SERVER_ACTION_BODY_LIMIT = `${MAX_UPLOAD_BYTES / 1024 / 1024 + 1}mb`;

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
