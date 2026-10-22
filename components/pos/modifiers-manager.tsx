"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatusMenu } from "@/components/shared/status-menu";
import { SettingSwitchRow } from "@/components/settings/setting-switch-row";
import { useFormat } from "@/components/providers/format-provider";
import { createModifierGroup, setModifierGroupActive, updateModifierGroup } from "@/actions/modifiers";
import type { ModifierGroupRow } from "@/lib/data/modifiers";

type OptionDraft = { id?: string; name: string; priceDelta: string; isDefault: boolean; isActive: boolean };

type Props = { groups: ModifierGroupRow[]; canCreate: boolean; canEdit: boolean };

export function ModifiersManager({ groups, canCreate, canEdit }: Props) {
  const format = useFormat();
  const [editing, setEditing] = useState<ModifierGroupRow | null>(null);
  const [open, setOpen] = useState(false);

  const newButton = canCreate ? (
    <Button
      onClick={() => {
        setEditing(null);
        setOpen(true);
      }}
    >
      <Plus />
      New Group
    </Button>
  ) : null;

  return (
    <>
      {groups.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="No modifier groups yet"
          description="A group is a question asked when an item is ordered — Milk? Size? Extras? — and its options can change the price."
          action={newButton}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Modifier groups</CardTitle>
            <CardDescription>Define a question once and attach it to any item that should ask it.</CardDescription>
            {newButton ? <div className="row-start-1 justify-self-end">{newButton}</div> : null}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead className="hidden lg:table-cell">Options</TableHead>
                  <TableHead>Choice</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>
                      <p className="font-medium">{group.name}</p>
                      {group.prompt ? <p className="text-xs text-muted-foreground">{group.prompt}</p> : null}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1.5">
                        {group.options
                          .filter((option) => option.isActive)
                          .slice(0, 6)
                          .map((option) => (
                            <span key={option.id} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {option.name}
                              {option.priceDelta !== 0 ? ` ${option.priceDelta > 0 ? "+" : "−"}${format.money(Math.abs(option.priceDelta))}` : ""}
                            </span>
                          ))}
                        {group.options.filter((o) => o.isActive).length > 6 ? (
                          <span className="text-xs text-muted-foreground">+{group.options.filter((o) => o.isActive).length - 6} more</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {group.minSelect === 0 ? "Optional" : "Required"}
                      {group.maxSelect === 1 ? ", one" : `, up to ${group.maxSelect}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{group.itemCount}</TableCell>
                    <TableCell>
                      <StatusMenu
                        current={group.isActive ? { label: "Active", tone: "success" } : { label: "Inactive", tone: "neutral" }}
                        choices={
                          canEdit
                            ? [
                                group.isActive
                                  ? { value: "inactive", label: "Inactive", tone: "neutral" as const, description: "Stops being asked at the till" }
                                  : { value: "active", label: "Active", tone: "success" as const, description: "Asked again at the till" },
                              ]
                            : []
                        }
                        onSelect={(value) => setModifierGroupActive(group.id, value === "active")}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {canEdit ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit group"
                            onClick={() => {
                              setEditing(group);
                              setOpen(true);
                            }}
                          >
                            <Pencil />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New modifier group"}</DialogTitle>
            <DialogDescription>
              {editing ? "Change the question, its options or their prices." : "A question asked at the till, with the options that answer it."}
            </DialogDescription>
          </DialogHeader>
          {open ? <GroupForm group={editing} onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function GroupForm({ group, onClose }: { group: ModifierGroupRow | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(group?.name ?? "");
  const [prompt, setPrompt] = useState(group?.prompt ?? "");
  const [minSelect, setMinSelect] = useState(String(group?.minSelect ?? 0));
  const [maxSelect, setMaxSelect] = useState(String(group?.maxSelect ?? 1));
  const [sortOrder, setSortOrder] = useState(String(group?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(group?.isActive ?? true);
  const [options, setOptions] = useState<OptionDraft[]>(
    group?.options.map((option) => ({
      id: option.id,
      name: option.name,
      priceDelta: String(option.priceDelta),
      isDefault: option.isDefault,
      isActive: option.isActive,
    })) ?? [{ name: "", priceDelta: "0", isDefault: false, isActive: true }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null);

  function setOption(index: number, patch: Partial<OptionDraft>) {
    setOptions((prev) => prev.map((option, i) => (i === index ? { ...option, ...patch } : option)));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        prompt,
        minSelect,
        maxSelect,
        sortOrder,
        isActive,
        options: options.map((option) => ({
          id: option.id,
          name: option.name,
          priceDelta: option.priceDelta || "0",
          isDefault: option.isDefault,
          isActive: option.isActive,
        })),
      };
      const result = group ? await updateModifierGroup(group.id, payload) : await createModifierGroup(payload);
      if (!result.success) {
        const details = Object.entries(result.fieldErrors ?? {}).flatMap(([field, messages]) => messages.map((m) => `${field}: ${m}`));
        setError({ message: result.error, details });
        return;
      }
      toast.success(group ? "Group saved" : "Group created");
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-5">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription className="grid gap-1">
              <span>{error.message}</span>
              {error.details.length > 0 ? (
                <ul className="list-disc pl-4">
                  {error.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Name" htmlFor="group-name" required description="What the question is about — Milk, Size, Extras.">
            <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </FormField>
          <FormField label="Prompt" htmlFor="group-prompt" description="Shown above the options at the till.">
            <Input id="group-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Choose a milk" autoComplete="off" />
          </FormField>
          <FormField label="Must choose at least" htmlFor="group-min" required description="0 makes the group optional.">
            <Input id="group-min" type="number" inputMode="numeric" value={minSelect} onChange={(e) => setMinSelect(e.target.value)} />
          </FormField>
          <FormField label="May choose up to" htmlFor="group-max" required description="1 is a single choice.">
            <Input id="group-max" type="number" inputMode="numeric" value={maxSelect} onChange={(e) => setMaxSelect(e.target.value)} />
          </FormField>
          <FormField label="Sort order" htmlFor="group-sort" description="Lower groups are asked first.">
            <Input id="group-sort" type="number" inputMode="numeric" className="max-w-28" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </FormField>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Options</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setOptions((prev) => [...prev, { name: "", priceDelta: "0", isDefault: false, isActive: true }])}>
              <Plus />
              Add option
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-left font-medium">Option</th>
                  <th className="p-2 text-left font-medium">Price change</th>
                  <th className="p-2 text-left font-medium">Default</th>
                  <th className="p-2 text-left font-medium">Active</th>
                  <th className="w-10 p-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {options.map((option, index) => (
                  <tr key={option.id ?? index}>
                    <td className="p-2">
                      <Input value={option.name} onChange={(e) => setOption(index, { name: e.target.value })} className="h-9 min-w-36" />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={option.priceDelta}
                        onChange={(e) => setOption(index, { priceDelta: e.target.value })}
                        className="h-9 w-28"
                        aria-label={`Price change for ${option.name || "option"}`}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={option.isDefault}
                        onChange={(e) => setOption(index, { isDefault: e.target.checked })}
                        aria-label={`${option.name || "Option"} pre-selected`}
                        className="size-4 accent-primary"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={option.isActive}
                        onChange={(e) => setOption(index, { isActive: e.target.checked })}
                        aria-label={`${option.name || "Option"} active`}
                        className="size-4 accent-primary"
                      />
                    </td>
                    <td className="p-2">
                      {options.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove option"
                          onClick={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">An option that has already been sold is kept and deactivated, so old receipts still read correctly.</p>
        </div>

        <SettingSwitchRow label="Active" description="Inactive groups stop being asked at the till." checked={isActive} onCheckedChange={setIsActive} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {group ? "Save changes" : "Create group"}
        </Button>
      </DialogFooter>
    </>
  );
}
