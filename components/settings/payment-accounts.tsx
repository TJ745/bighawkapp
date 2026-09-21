"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MoreHorizontal, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { createPaymentAccount, setPaymentAccountActive, updatePaymentAccount } from "@/actions/settings";
import type { PaymentAccountRow } from "@/lib/data/settings";
import { applyFieldErrors } from "@/lib/form-errors";
import { PAYMENT_ACCOUNT_TYPES } from "@/lib/settings/defaults";
import { paymentAccountSchema, type PaymentAccountInput, type PaymentAccountValues } from "@/lib/validation/settings";

export function PaymentAccountsCard({ accounts, balances, canEdit }: { accounts: PaymentAccountRow[]; balances: Record<string, number>; canEdit: boolean }) {
  const router = useRouter();
  const format = useFormat();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentAccountRow | undefined>();
  const [toggling, setToggling] = useState<PaymentAccountRow | undefined>();

  const totalBalance = accounts.filter((a) => a.isActive).reduce((sum, a) => sum + (balances[a.id] ?? a.openingBalance), 0);

  async function confirmToggle() {
    if (!toggling) return;
    const result = await setPaymentAccountActive(toggling.id, !toggling.isActive);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(toggling.isActive ? "Account deactivated" : "Account activated");
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Payment accounts</CardTitle>
          <CardDescription>
            Where money is received and paid from. Customer payments increase the chosen account; expenses and supplier payments decrease it.
          </CardDescription>
          {canEdit ? (
            <CardAction>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(undefined);
                  setFormOpen(true);
                }}
              >
                <Plus />
                Add account
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Account</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Opening balance</TableHead>
                <TableHead className="text-right">Current balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 pr-6">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="pl-6">
                    <p className="font-medium">{account.name}</p>
                    {account.notes ? <p className="text-xs text-muted-foreground">{account.notes}</p> : null}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {PAYMENT_ACCOUNT_TYPES.find((t) => t.value === account.type)?.label}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{format.money(account.openingBalance)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{format.money(balances[account.id] ?? account.openingBalance)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={account.isActive ? "success" : "neutral"}>{account.isActive ? "Active" : "Inactive"}</StatusBadge>
                  </TableCell>
                  <TableCell className="pr-6">
                    {canEdit ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Actions">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(account);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setToggling(account)} variant={account.isActive ? "destructive" : "default"}>
                            {account.isActive ? <PowerOff /> : <Power />}
                            {account.isActive ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="hover:bg-transparent">
                <TableCell className="pl-6 font-medium" colSpan={3}>
                  Total balance (active accounts)
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{format.money(totalBalance)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit account" : "Add account"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the account details." : "Add a bank or cash account you receive money into or pay from."}
            </DialogDescription>
          </DialogHeader>
          {formOpen ? <AccountForm account={editing} onClose={() => setFormOpen(false)} /> : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(toggling)}
        onOpenChange={(o) => !o && setToggling(undefined)}
        title={toggling?.isActive ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
        description={
          toggling?.isActive
            ? "It will no longer be offered when recording payments. Existing transactions are kept."
            : "It will be available again when recording payments."
        }
        confirmLabel={toggling?.isActive ? "Deactivate" : "Activate"}
        destructive={toggling?.isActive}
        onConfirm={confirmToggle}
      />
    </>
  );
}

function AccountForm({ account, onClose }: { account?: PaymentAccountRow; onClose: () => void }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<PaymentAccountInput, unknown, PaymentAccountValues>({
    resolver: zodResolver(paymentAccountSchema),
    defaultValues: {
      name: account?.name ?? "",
      type: account?.type ?? "COMPANY_BANK",
      openingBalance: account?.openingBalance ?? 0,
      notes: account?.notes ?? "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const type = useWatch({ control: form.control, name: "type" });

  async function onSubmit(values: PaymentAccountValues) {
    setFormError(null);
    const result = account ? await updatePaymentAccount(account.id, values) : await createPaymentAccount(values);
    if (!result.success) {
      applyFieldErrors(form, result.fieldErrors);
      setFormError(result.error);
      return;
    }
    toast.success(account ? "Account updated" : "Account added");
    onClose();
    router.refresh();
  }

  return (
    <>
    <form id="payment-account-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <FormField label="Account name" htmlFor="account-name" required error={errors.name?.message}>
        <Input id="account-name" autoFocus {...form.register("name")} />
      </FormField>
      <FormField label="Type" htmlFor="account-type" required error={errors.type?.message}>
        <Select value={type} onValueChange={(v) => form.setValue("type", v as PaymentAccountInput["type"], { shouldValidate: true })}>
          <SelectTrigger id="account-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_ACCOUNT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField
        label="Opening balance (SAR)"
        htmlFor="account-opening"
        required
        description="The balance before any transactions were recorded in this app."
        error={errors.openingBalance?.message}
      >
        <Input id="account-opening" type="number" step="0.01" {...form.register("openingBalance")} />
      </FormField>
      <FormField label="Notes" htmlFor="account-notes" error={errors.notes?.message}>
        <Input id="account-notes" {...form.register("notes")} />
      </FormField>
    </form>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button type="submit" form="payment-account-form" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" /> : null}
        {account ? "Save changes" : "Add account"}
      </Button>
    </DialogFooter>
    </>
  );
}
