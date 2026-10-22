"use client";

import { useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFormat } from "@/components/providers/format-provider";
import { round2 } from "@/lib/business/totals";
import type { RegisterModifierGroup } from "@/lib/data/modifiers";
import { cn } from "@/lib/utils";

export type ModifierChoice = { optionId: string; groupName: string; optionName: string; priceDelta: number };

type Props = {
  /** The item being added, or null when the dialog is closed. */
  item: { name: string; price: number; groups: RegisterModifierGroup[] } | null;
  onCancel: () => void;
  onConfirm: (choices: ModifierChoice[]) => void;
};

/**
 * Asks the item's questions before it joins the cart. The same min/max rules are enforced again on
 * the server, so this dialog is about speed at the till, not about trust.
 */
export function ModifierDialog({ item, onCancel, onConfirm }: Props) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item?.name}</DialogTitle>
          <DialogDescription>Choose the options for this one.</DialogDescription>
        </DialogHeader>
        {item ? <ModifierBody item={item} onCancel={onCancel} onConfirm={onConfirm} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ModifierBody({
  item,
  onCancel,
  onConfirm,
}: {
  item: { name: string; price: number; groups: RegisterModifierGroup[] };
  onCancel: () => void;
  onConfirm: (choices: ModifierChoice[]) => void;
}) {
  const format = useFormat();
  // Defaults are pre-selected, which is what makes a till fast: tap, tap, done.
  const [selected, setSelected] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(item.groups.map((group) => [group.id, group.options.filter((option) => option.isDefault).map((option) => option.id)])),
  );

  function toggle(group: RegisterModifierGroup, optionId: string) {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (current.includes(optionId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }
      // A single-choice group replaces; a multi-choice one fills up to its maximum.
      if (group.maxSelect <= 1) return { ...prev, [group.id]: [optionId] };
      if (current.length >= group.maxSelect) return { ...prev, [group.id]: [...current.slice(1), optionId] };
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  const choices: ModifierChoice[] = item.groups.flatMap((group) =>
    (selected[group.id] ?? []).flatMap((optionId) => {
      const option = group.options.find((o) => o.id === optionId);
      return option ? [{ optionId, groupName: group.name, optionName: option.name, priceDelta: option.priceDelta }] : [];
    }),
  );
  const delta = round2(choices.reduce((sum, choice) => sum + choice.priceDelta, 0));
  const unmet = item.groups.filter((group) => (selected[group.id] ?? []).length < group.minSelect);

  return (
    <>
      <div className="space-y-4">
        {item.groups.map((group) => {
          const chosen = selected[group.id] ?? [];
          return (
            <div key={group.id} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{group.prompt || group.name}</p>
                <p className="text-xs text-muted-foreground">
                  {group.minSelect > 0 ? "Required" : "Optional"}
                  {group.maxSelect > 1 ? ` · up to ${group.maxSelect}` : ""}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.options.map((option) => {
                  const active = chosen.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggle(group, option.id)}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        active ? "border-primary bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "hover:bg-muted",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {active ? <Check className="size-3.5 shrink-0" /> : null}
                        <span className="truncate">{option.name}</span>
                      </span>
                      {option.priceDelta !== 0 ? (
                        <span className="shrink-0 text-xs tabular-nums">
                          {option.priceDelta > 0 ? "+" : "−"}
                          {format.money(Math.abs(option.priceDelta))}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
          <span className="text-muted-foreground">Each one costs</span>
          <span className="text-base font-semibold tabular-nums">{format.money(round2(item.price + delta))}</span>
        </div>

        {unmet.length > 0 ? (
          <p className="text-sm font-medium text-tint-red-foreground">
            Still to choose: {unmet.map((group) => group.prompt || group.name).join(", ")}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={() => onConfirm(choices)} disabled={unmet.length > 0}>
          <ShoppingCart />
          Add to sale
        </Button>
      </DialogFooter>
    </>
  );
}
