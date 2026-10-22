"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CsvExport } from "@/actions/export";
import { actionErrorText } from "@/lib/action-error";
import type { ActionResult } from "@/lib/actions";

/**
 * "Export" on a list screen.
 *
 * It hands the action the screen's own query string, so the file matches the search and filter in
 * front of the person rather than the whole table — then saves whatever comes back.
 *
 * The file is built server-side: the browser never assembles it from what happens to be on this
 * page, which is both why it covers every page and why the figures agree with the screen.
 */
export function ExportButton({
  action,
  label = "Export",
}: {
  /** The server action for this list. */
  action: (search: Record<string, string | string[] | undefined>) => Promise<ActionResult<CsvExport>>;
  label?: string;
}) {
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const result = await action(Object.fromEntries(searchParams.entries()));
      if (!result.success) {
        // Refusals here are worth reading — "too many rows, narrow the filter" is actionable.
        toast.error(actionErrorText(result));
        return;
      }

      /**
       * Saved through an object URL rather than a link to a route, so the download inherits this
       * request's session and nothing has to be exposed at a guessable address. The type carries
       * `charset=utf-8` to go with the byte-order mark the server wrote.
       */
      const blob = new Blob([result.data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.data.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success(`${result.data.rows} ${result.data.rows === 1 ? "row" : "rows"} exported`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={download} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Download />}
      {label}
    </Button>
  );
}
