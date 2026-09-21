"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";

export type StatusChoice = { value: string; label: string; tone: StatusTone; description?: string };

type Props = {
  /** How the current status reads. */
  current: { label: string; tone: StatusTone };
  /** Statuses this record may be moved to right now; empty means the badge is read-only. */
  choices: StatusChoice[];
  onSelect: (value: string) => Promise<ActionResult<unknown>>;
  /** Shown in the menu when there is nothing to choose — e.g. the status is derived. */
  note?: string;
  className?: string;
};

/** Turns a list of status values plus the module's label/tone map into menu choices. */
export function statusChoices<T extends string>(values: T[], labels: Record<T, { label: string; tone: StatusTone }>): StatusChoice[] {
  return values.map((value) => ({ value, label: labels[value].label, tone: labels[value].tone }));
}

const DOT_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-tint-blue-foreground",
  success: "bg-tint-green-foreground",
  warning: "bg-tint-amber-foreground",
  danger: "bg-tint-red-foreground",
  purple: "bg-tint-purple-foreground",
};

/**
 * A status badge you can click to change the status. Only the transitions the Server Action
 * allows are offered — derived statuses (Paid, Overdue, Expired…) are never in the list, and the
 * action checks the rules again on the server.
 */
export function StatusMenu({ current, choices, onSelect, note, className }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (choices.length === 0) {
    return (
      <StatusBadge tone={current.tone} title={note} className={className}>
        {current.label}
      </StatusBadge>
    );
  }

  function choose(choice: StatusChoice) {
    startTransition(async () => {
      const result = await onSelect(choice.value);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Status changed to ${choice.label}`);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={pending}>
        <button type="button" aria-label={`Status: ${current.label}. Change status`} className={cn("rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", className)}>
          <StatusBadge tone={current.tone} className="gap-1 pr-1.5 transition-opacity hover:opacity-80">
            {current.label}
            {pending ? <Loader2 className="size-3 animate-spin" /> : <ChevronDown className="size-3 opacity-60" />}
          </StatusBadge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Change status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {choices.map((choice) => (
          <DropdownMenuItem key={choice.value} onSelect={() => choose(choice)} className="gap-2">
            <span className={cn("size-2 shrink-0 rounded-full", DOT_CLASSES[choice.tone])} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{choice.label}</span>
              {choice.description ? <span className="block truncate text-xs text-muted-foreground">{choice.description}</span> : null}
            </span>
            {choice.label === current.label ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
        {note ? (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{note}</p>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
