"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Scissors } from "lucide-react";
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
import { useFormat } from "@/components/providers/format-provider";
import { createStaff, updateStaff } from "@/actions/staff";

export type StaffListItem = {
  id: string;
  name: string;
  phone: string | null;
  userId: string | null;
  userEmail: string | null;
  commissionPercent: number;
  colour: string | null;
  isActive: boolean;
};

export type CommissionRow = { staffId: string | null; name: string; services: number; sales: number; earned: number; reversed: number; net: number };

type Props = {
  staff: StaffListItem[];
  users: { id: string; name: string; email: string }[];
  commission: { people: CommissionRow[]; totals: { sales: number; earned: number; reversed: number; net: number } };
  rangeLabel: string;
  branchName: string;
  canCreate: boolean;
  canEdit: boolean;
};

/** The team, what they are owed, and the rate each one is on. */
export function StaffManager({ staff, users, commission, rangeLabel, branchName, canCreate, canEdit }: Props) {
  const format = useFormat();
  const [editing, setEditing] = useState<StaffListItem | null>(null);
  const [open, setOpen] = useState(false);

  const newButton = canCreate ? (
    <Button
      onClick={() => {
        setEditing(null);
        setOpen(true);
      }}
    >
      <Plus />
      New Staff Member
    </Button>
  ) : null;

  return (
    <>
      {staff.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="No staff yet"
          description={`Add the people who perform services at ${branchName}, and the share each one earns.`}
          action={newButton}
        />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Commission {rangeLabel}</CardTitle>
              <CardDescription>
                Earned on services actually paid for, before VAT. What came back with a refund is shown separately, never netted away quietly.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Who</TableHead>
                    <TableHead className="text-right">Services</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Sold</TableHead>
                    <TableHead className="text-right">Earned</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Taken back</TableHead>
                    <TableHead className="text-right">Owed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commission.people.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        No services were sold in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    commission.people.map((person) => (
                      <TableRow key={person.staffId ?? person.name}>
                        <TableCell className="font-medium">{person.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{person.services}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{format.money(person.sales)}</TableCell>
                        <TableCell className="text-right tabular-nums">{format.money(person.earned)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">
                          {person.reversed > 0 ? `−${format.money(person.reversed)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{format.money(person.net)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  {commission.people.length > 0 ? (
                    <TableRow>
                      <TableCell className="font-medium">Total</TableCell>
                      <TableCell />
                      <TableCell className="hidden text-right font-medium tabular-nums sm:table-cell">{format.money(commission.totals.sales)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{format.money(commission.totals.earned)}</TableCell>
                      <TableCell className="hidden text-right font-medium tabular-nums sm:table-cell">
                        {commission.totals.reversed > 0 ? `−${format.money(commission.totals.reversed)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{format.money(commission.totals.net)}</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>The team</CardTitle>
              <CardDescription>A rate change applies to work from then on; what is already earned keeps the rate it was earned at.</CardDescription>
              {newButton ? <div className="row-start-1 justify-self-end">{newButton}</div> : null}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Phone</TableHead>
                    <TableHead className="hidden md:table-cell">App user</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-16">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((person) => (
                    <TableRow key={person.id}>
                      <TableCell className="font-medium">{person.name}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{person.phone ?? "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{person.userEmail ?? "No login"}</TableCell>
                      <TableCell className="text-right tabular-nums">{person.commissionPercent}%</TableCell>
                      <TableCell>
                        <StatusBadge tone={person.isActive ? "success" : "neutral"}>{person.isActive ? "Working" : "Left"}</StatusBadge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          {canEdit ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit ${person.name}`}
                              onClick={() => {
                                setEditing(person);
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
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New staff member"}</DialogTitle>
            <DialogDescription>{editing ? "Change their details or their rate." : `Add someone who performs services at ${branchName}.`}</DialogDescription>
          </DialogHeader>
          {open ? <StaffForm staff={editing} users={users} onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StaffForm({ staff, users, onClose }: { staff: StaffListItem | null; users: { id: string; name: string; email: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(staff?.name ?? "");
  const [phone, setPhone] = useState(staff?.phone ?? "");
  const [userId, setUserId] = useState(staff?.userId ?? "");
  const [commission, setCommission] = useState(String(staff?.commissionPercent ?? 0));
  const [isActive, setIsActive] = useState(staff?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("name", name);
      formData.set("phone", phone);
      formData.set("userId", userId);
      formData.set("commissionPercent", commission);
      formData.set("isActive", String(isActive));
      const result = staff ? await updateStaff(staff.id, formData) : await createStaff(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(staff ? "Saved" : "Added to the team");
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
        <FormField label="Name" htmlFor="staff-name" required>
          <Input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Phone" htmlFor="staff-phone">
            <Input id="staff-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" />
          </FormField>
          <FormField label="Commission" htmlFor="staff-commission" description="Share of each service, before VAT.">
            <div className="relative">
              <Input id="staff-commission" value={commission} onChange={(e) => setCommission(e.target.value)} inputMode="decimal" className="pr-8" />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </FormField>
        </div>
        <FormField label="App user" htmlFor="staff-user" description="Link them if they also sign in to BigHawk.">
          <Select value={userId || "none"} onValueChange={(v) => setUserId(v === "none" ? "" : v)}>
            <SelectTrigger id="staff-user" className="w-full">
              <SelectValue placeholder="No login" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No login</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name} · {user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <SettingSwitchRow
          label="Still working here"
          description="Someone with bookings in the diary cannot be switched off until those are moved."
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
          {staff ? "Save changes" : "Add to the team"}
        </Button>
      </DialogFooter>
    </>
  );
}
