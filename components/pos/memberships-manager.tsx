"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Loader2, Pencil, Plus, Ban } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Combobox } from "@/components/shared/combobox";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { SettingSwitchRow } from "@/components/settings/setting-switch-row";
import { useFormat } from "@/components/providers/format-provider";
import { cancelMembership, createMembershipPlan, updateMembershipPlan } from "@/actions/memberships";
import { MEMBERSHIP_STATUS_LABELS } from "@/lib/validation/memberships";
import { cn } from "@/lib/utils";

export type PlanView = {
  id: string;
  name: string;
  description: string | null;
  variantId: string;
  soldAs: string;
  price: number;
  durationDays: number;
  sessionCount: number;
  discountPercent: number;
  isActive: boolean;
  memberCount: number;
  services: { variantId: string; name: string }[];
};

export type MemberView = {
  id: string;
  customerName: string;
  planName: string;
  startLabel: string;
  endLabel: string;
  sessionsIncluded: number;
  sessionsUsed: number;
  sessionsLeft: number | null;
  discountPercent: number;
  status: keyof typeof MEMBERSHIP_STATUS_LABELS;
  saleNumber: string | null;
};

type Props = {
  plans: PlanView[];
  members: MemberView[];
  services: { variantId: string; name: string }[];
  canCreate: boolean;
  canEdit: boolean;
};

/**
 * Plans the shop offers, and who is on one. A membership is sold at the till like anything else,
 * which is why there is no "sell" button here.
 */
export function MembershipsManager({ plans, members, services, canCreate, canEdit }: Props) {
  const format = useFormat();
  const [editing, setEditing] = useState<PlanView | null>(null);
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState<MemberView | null>(null);

  const newButton = canCreate ? (
    <Button
      onClick={() => {
        setEditing(null);
        setOpen(true);
      }}
    >
      <Plus />
      New Plan
    </Button>
  ) : null;

  return (
    <div className="space-y-4">
      {plans.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title="No plans yet"
          description="A plan gives a customer included sessions, a member discount, or both — for a period. Selling one happens at the till."
          action={newButton}
        />
      ) : (
        <>
          <div className="flex justify-end">{newButton}</div>
          <div className="grid gap-4 lg:grid-cols-2">
            {plans.map((plan) => (
              <Card key={plan.id} className={cn(!plan.isActive && "opacity-60")}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {plan.name}
                    {!plan.isActive ? <StatusBadge tone="neutral">Withdrawn</StatusBadge> : null}
                  </CardTitle>
                  <CardDescription>
                    {format.money(plan.price)} · {plan.durationDays} days ·{" "}
                    {plan.sessionCount === 0 ? "unlimited use" : `${plan.sessionCount} session${plan.sessionCount === 1 ? "" : "s"}`}
                    {plan.discountPercent > 0 ? ` · then ${plan.discountPercent}% off` : ""}
                  </CardDescription>
                  {canEdit ? (
                    <div className="row-start-1 justify-self-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${plan.name}`}
                        onClick={() => {
                          setEditing(plan);
                          setOpen(true);
                        }}
                      >
                        <Pencil />
                      </Button>
                    </div>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {plan.description ? <p className="text-muted-foreground">{plan.description}</p> : null}
                  <p className="text-muted-foreground">
                    Rung up as <span className="font-medium text-foreground">{plan.soldAs}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Covers {plan.services.length === 0 ? "every service" : plan.services.map((service) => service.name).join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {plan.memberCount} {plan.memberCount === 1 ? "member" : "members"} so far
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>What each member has left. A session comes back if the visit is refunded or the sale is voided.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">Plan</TableHead>
                <TableHead className="hidden md:table-cell">Runs to</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Nobody is on a plan yet.
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.customerName}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{member.planName}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{member.endLabel}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {member.sessionsLeft === null ? "Unlimited" : `${member.sessionsLeft} of ${member.sessionsIncluded}`}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={MEMBERSHIP_STATUS_LABELS[member.status].tone}>{MEMBERSHIP_STATUS_LABELS[member.status].label}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {canEdit && member.status === "ACTIVE" ? (
                          <Button variant="ghost" size="icon" aria-label={`Cancel ${member.customerName}'s membership`} onClick={() => setCancelling(member)}>
                            <Ban />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New plan"}</DialogTitle>
            <DialogDescription>The plan decides what a member gets; the till decides when they get it.</DialogDescription>
          </DialogHeader>
          {open ? <PlanForm plan={editing} services={services} onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>

      <CancelDialog member={cancelling} onClose={() => setCancelling(null)} />
    </div>
  );
}

function PlanForm({ plan, services, onClose }: { plan: PlanView | null; services: { variantId: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [variantId, setVariantId] = useState(plan?.variantId ?? "");
  const [durationDays, setDurationDays] = useState(String(plan?.durationDays ?? 30));
  const [sessionCount, setSessionCount] = useState(String(plan?.sessionCount ?? 0));
  const [discount, setDiscount] = useState(String(plan?.discountPercent ?? 0));
  const [covered, setCovered] = useState<string[]>(plan?.services.map((service) => service.variantId) ?? []);
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        description,
        variantId,
        durationDays: Number(durationDays),
        sessionCount: Number(sessionCount),
        discountPercent: Number(discount),
        serviceVariantIds: covered,
        isActive,
      };
      const result = plan ? await updateMembershipPlan(plan.id, payload) : await createMembershipPlan(payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(plan ? "Plan saved" : "Plan added");
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <FormField label="Name" htmlFor="plan-name" required>
          <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Monthly unlimited" autoComplete="off" />
        </FormField>

        <FormField label="Sold as" htmlFor="plan-item" required description="The service rung up at the till when someone joins. Its price is the plan's price.">
          <Combobox
            options={services.map((service) => ({ value: service.variantId, label: service.name }))}
            value={variantId}
            onChange={setVariantId}
            placeholder="Choose a service"
            searchPlaceholder="Search services…"
          />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-3">
          <FormField label="Runs for" htmlFor="plan-days" required description="Days.">
            <Input id="plan-days" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} inputMode="numeric" />
          </FormField>
          <FormField label="Sessions" htmlFor="plan-sessions" description="0 = unlimited.">
            <Input id="plan-sessions" value={sessionCount} onChange={(e) => setSessionCount(e.target.value)} inputMode="numeric" />
          </FormField>
          <FormField label="Member discount" htmlFor="plan-discount" description="Once sessions run out.">
            <div className="relative">
              <Input id="plan-discount" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" className="pr-8" />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </FormField>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">What it covers</p>
          <p className="text-xs text-muted-foreground">Tick nothing to cover every service.</p>
          <div className="space-y-1.5">
            {services
              .filter((service) => service.variantId !== variantId)
              .map((service) => {
                const on = covered.includes(service.variantId);
                return (
                  <button
                    key={service.variantId}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCovered((prev) => (on ? prev.filter((id) => id !== service.variantId) : [...prev, service.variantId]))}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg border p-2.5 text-left text-sm transition-colors",
                      on ? "border-primary bg-sidebar-accent" : "hover:bg-muted/60",
                    )}
                  >
                    <span className="truncate">{service.name}</span>
                    {on ? <span className="shrink-0 text-xs font-medium text-sidebar-accent-foreground">Covered</span> : null}
                  </button>
                );
              })}
          </div>
        </div>

        <FormField label="Description" htmlFor="plan-description">
          <Textarea id="plan-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </FormField>

        <SettingSwitchRow
          label="Offered"
          description="Withdrawing a plan stops new members; the people already on it keep what they paid for."
          checked={isActive}
          onCheckedChange={setIsActive}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || !name.trim() || !variantId}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {plan ? "Save changes" : "Add the plan"}
        </Button>
      </DialogFooter>
    </>
  );
}

function CancelDialog({ member, onClose }: { member: MemberView | null; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!member) return;
    setBusy(true);
    setError(null);
    try {
      const result = await cancelMembership({ membershipId: member.id, reason });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(`${result.data.customerName}'s membership cancelled`);
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={member !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancel {member?.customerName}&apos;s membership</DialogTitle>
          <DialogDescription>
            The record stays — it was paid for, and what was used is history. Refund anything owed at the till, like any other refund.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <FormField label="Reason" htmlFor="cancel-reason" required>
          <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy || !reason.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Cancel the membership
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
