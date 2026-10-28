"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { stopActingAsCompany } from "@/actions/companies";
import { actionErrorLines } from "@/lib/action-error";
import type { OperatorContext } from "@/lib/data/companies";

/**
 * Which customer the BigHawk operator is working on, on **every** screen.
 *
 * The companies screen already said this, which was no help at all: the danger is not on the
 * screen where you pick a company, it is three clicks later on an invoice list that looks
 * exactly like everybody else's. Everything the operator touches from here belongs to a real
 * business, so the answer follows them around.
 *
 * Two states, deliberately told apart:
 *
 *  - **Chosen** — they picked this company. Informational, and one click to leave.
 *  - **Not chosen** — nothing was picked and the deployment fell back to its first company.
 *    That is a guess, so it is marked as one; with several customers the right move is to go and
 *    choose.
 *
 * Nobody but the operator ever sees this: a customer's own staff have exactly one company and
 * telling them which would be noise.
 */
export function ActingAsBar({ context }: { context: OperatorContext }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);

  async function stop() {
    setLeaving(true);
    try {
      const result = await stopActingAsCompany();
      if (!result.success) {
        toast.error(actionErrorLines(result).join(" "));
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setLeaving(false);
    }
  }

  if (!context.chosen) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 md:px-6 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
        <TriangleAlert className="size-3.5 shrink-0" />
        <span>
          No company chosen, so you are seeing <span className="font-medium">{context.companyName}</span> by default.
        </span>
        <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs text-amber-900 underline dark:text-amber-200">
          <Link href="/settings/companies">Choose one</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/60 px-4 py-1.5 text-xs text-muted-foreground md:px-6">
      <Building2 className="size-3.5 shrink-0" />
      <span>
        Working on <span className="font-medium text-foreground">{context.companyName}</span>. Everything you change belongs to them.
      </span>
      <Button
        type="button"
        size="sm"
        variant="link"
        className="h-auto p-0 text-xs underline"
        disabled={leaving || pending}
        onClick={() => void stop()}
      >
        Leave
      </Button>
    </div>
  );
}
