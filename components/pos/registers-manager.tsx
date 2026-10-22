"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Monitor, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { SettingSwitchRow } from "@/components/settings/setting-switch-row";
import { createRegister, updateRegister } from "@/actions/pos";

export type RegisterListItem = {
  id: string;
  name: string;
  isActive: boolean;
  cashAccountId: string | null;
  cashAccountName: string | null;
  hasOpenShift: boolean;
};

type Props = {
  registers: RegisterListItem[];
  accounts: { id: string; name: string }[];
  branchName: string;
  canCreate: boolean;
  canEdit: boolean;
};

export function RegistersManager({ registers, accounts, branchName, canCreate, canEdit }: Props) {
  const [editing, setEditing] = useState<RegisterListItem | null>(null);
  const [open, setOpen] = useState(false);

  const newButton = canCreate ? (
    <Button
      onClick={() => {
        setEditing(null);
        setOpen(true);
      }}
    >
      <Plus />
      New Register
    </Button>
  ) : null;

  return (
    <>
      {registers.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title="No registers yet"
          description={`Add a till for ${branchName} so shifts and drawer counts can be tracked.`}
          action={newButton}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Registers</CardTitle>
            <CardDescription>Cash taken at a register is recorded in the account you choose here.</CardDescription>
            {newButton ? <div className="row-start-1 justify-self-end">{newButton}</div> : null}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Register</TableHead>
                  <TableHead className="hidden sm:table-cell">Cash account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registers.map((register) => (
                  <TableRow key={register.id}>
                    <TableCell className="font-medium">{register.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{register.cashAccountName ?? "Company cash account"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={register.isActive ? "success" : "neutral"}>{register.isActive ? "In use" : "Out of use"}</StatusBadge>
                        {register.hasOpenShift ? <StatusBadge tone="info">Shift open</StatusBadge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {canEdit ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit register"
                            onClick={() => {
                              setEditing(register);
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit register" : "New register"}</DialogTitle>
            <DialogDescription>{editing ? "Change this till's name or cash account." : `Add a till for ${branchName}.`}</DialogDescription>
          </DialogHeader>
          {open ? <RegisterForm register={editing} accounts={accounts} onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RegisterForm({ register, accounts, onClose }: { register: RegisterListItem | null; accounts: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(register?.name ?? "");
  const [cashAccountId, setCashAccountId] = useState(register?.cashAccountId ?? "");
  const [isActive, setIsActive] = useState(register?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("name", name);
      formData.set("cashAccountId", cashAccountId);
      formData.set("isActive", String(isActive));
      const result = register ? await updateRegister(register.id, formData) : await createRegister(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(register ? "Register saved" : "Register added");
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
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <FormField label="Name" htmlFor="register-name" required description="What the cashiers call it — Till 1, Front counter…">
          <Input id="register-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </FormField>
        <FormField label="Cash account" htmlFor="register-account" description="Where cash taken here is recorded in Finance.">
          <Select value={cashAccountId || "default"} onValueChange={(v) => setCashAccountId(v === "default" ? "" : v)}>
            <SelectTrigger id="register-account" className="w-full">
              <SelectValue placeholder="Company cash account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Company cash account</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <SettingSwitchRow
          label="In use"
          description="A register with an open shift cannot be taken out of use."
          checked={isActive}
          onCheckedChange={setIsActive}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {register ? "Save changes" : "Add register"}
        </Button>
      </DialogFooter>
    </>
  );
}
