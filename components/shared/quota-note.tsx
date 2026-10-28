import { cn } from "@/lib/utils";

/**
 * What a company has used of what it bought — seats, branches.
 *
 * Shown beside the button that spends one. The limit is enforced in the Server Action, which
 * refuses with a sentence; this exists so nobody meets that sentence by surprise, having already
 * filled in a form. A count that only appears at the moment of refusal is a count shown too late.
 *
 * The figure comes from the same query the refusal counts with, so the two can never disagree.
 * Only BigHawk can change the limit, so there is no button here — just the number and, when it
 * is reached, who to ask.
 */
export function QuotaNote({ used, limit, noun, className }: { used: number; limit: number; noun: string; className?: string }) {
  const full = used >= limit;
  return (
    <p className={cn("text-sm", full ? "font-medium text-amber-600 dark:text-amber-500" : "text-muted-foreground", className)}>
      <span className="tabular-nums">
        {used} of {limit}
      </span>{" "}
      {noun}
      {full ? " — contact BigHawk to add more" : null}
    </p>
  );
}
