"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { resetDemoCompany } from "@/actions/demo";
import { actionErrorLines } from "@/lib/action-error";

/**
 * The strip that says none of this is real.
 *
 * Shown to everyone inside the demonstration company, because the person it most needs to reach
 * is not the user — it is the prospect watching over their shoulder. A demo that looks like a
 * live business is a demo somebody can misremember as one.
 *
 * The **Reset** button is BigHawk's own: a salesperson between meetings can put the shop back
 * the way it was without waiting for midnight. Everybody else sees the banner without it, since
 * throwing away the data is not a prospect's decision to make.
 */
export function DemoBar({ canReset }: { canReset: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reset() {
    setBusy(true);
    try {
      const result = await resetDemoCompany();
      if (!result.success) {
        toast.error(actionErrorLines(result).join(" "));
        return;
      }
      toast.success("Rebuilding the demo. It takes a few minutes — reload the page then.");
      router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-purple-200 bg-purple-50 px-4 py-1.5 text-xs text-purple-900 md:px-6 dark:border-purple-900/50 dark:bg-purple-950/40 dark:text-purple-200">
        <FlaskConical className="size-3.5 shrink-0" />
        <span>
          <span className="font-medium">Demonstration company.</span> Nothing here is a real business, and it is rebuilt every night.
        </span>
        {canReset ? (
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto gap-1 p-0 text-xs text-purple-900 underline dark:text-purple-200"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Reset now
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Rebuild the demo?"
        description="Everything in the demonstration company is deleted and created again, including anything you have just shown a client. It runs in the background and takes a few minutes. No other company is touched."
        confirmLabel="Rebuild it"
        onConfirm={reset}
      />
    </>
  );
}
