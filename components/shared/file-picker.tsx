"use client";

import { useRef } from "react";
import { FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatFileSize, MAX_DOCUMENT_BYTES, MAX_UPLOAD_BYTES } from "@/lib/storage/limits";

export type PendingFile<C extends string = string> = { file: File; category: C };

type FilePickerProps<C extends string> = {
  files: PendingFile<C>[];
  onChange: (files: PendingFile<C>[]) => void;
  categories?: { value: C; label: string }[];
  defaultCategory?: C;
  accept?: string;
  hint?: string;
  disabled?: boolean;
  /** Per-file limit; must match the limit the Server Action enforces. */
  maxFileBytes?: number;
  /** Limit for everything sent in one upload. */
  maxTotalBytes?: number;
};

export { formatFileSize };

// Picks one or more files before upload; each file can be tagged with a category.
export function FilePicker<C extends string>({
  files,
  onChange,
  categories,
  defaultCategory,
  accept = "application/pdf,image/png,image/jpeg,image/webp",
  hint = `PDF, JPG, PNG or WEBP, up to ${formatFileSize(MAX_DOCUMENT_BYTES)} each.`,
  disabled,
  maxFileBytes = MAX_DOCUMENT_BYTES,
  maxTotalBytes = MAX_UPLOAD_BYTES,
}: FilePickerProps<C>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const total = files.reduce((sum, item) => sum + item.file.size, 0);

  // Refused here rather than on the server, so the person sees which file is the problem
  // instead of a failed upload.
  function addFiles(list: FileList | null) {
    if (!list) return;
    const accepted: PendingFile<C>[] = [];
    let running = total;
    for (const file of Array.from(list)) {
      if (file.size > maxFileBytes) {
        toast.error(`"${file.name}" is ${formatFileSize(file.size)}. The limit is ${formatFileSize(maxFileBytes)} per file.`);
        continue;
      }
      if (running + file.size > maxTotalBytes) {
        toast.error(`"${file.name}" does not fit — one upload can total ${formatFileSize(maxTotalBytes)}. Send the rest separately.`);
        continue;
      }
      running += file.size;
      accepted.push({ file, category: (defaultCategory ?? categories?.[0]?.value) as C });
    }
    if (accepted.length > 0) onChange([...files, ...accepted]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      <input ref={inputRef} type="file" multiple accept={accept} className="hidden" disabled={disabled} onChange={(e) => addFiles(e.target.files)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <Upload />
          Choose files
        </Button>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      {files.length > 0 ? (
        <>
          <ul className="divide-y rounded-lg border">
            {files.map((item, index) => (
              <li key={`${item.file.name}-${index}`} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{item.file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(item.file.size)}</span>
                </div>
                {categories ? (
                  <Select
                    value={item.category}
                    onValueChange={(v) => onChange(files.map((f, i) => (i === index ? { ...f, category: v as C } : f)))}
                  >
                    <SelectTrigger size="sm" className="w-full sm:w-48" aria-label="Document category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove file" onClick={() => onChange(files.filter((_, i) => i !== index))}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {files.length} {files.length === 1 ? "file" : "files"} · {formatFileSize(total)} of {formatFileSize(maxTotalBytes)}
          </p>
        </>
      ) : null}
    </div>
  );
}
