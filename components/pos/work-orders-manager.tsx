"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Receipt, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/shared/combobox";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { moveWorkOrder, openWorkOrder, saveWorkOrderDetails } from "@/actions/industries";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/validation/industries";
import { cn } from "@/lib/utils";

export type JobCard = {
  id: string;
  number: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  itemName: string;
  serialNumber: string | null;
  faultReported: string;
  diagnosis: string | null;
  estimate: number | null;
  status: keyof typeof WORK_ORDER_STATUS_LABELS;
  staffId: string | null;
  staffName: string | null;
  promisedLabel: string | null;
  note: string | null;
  saleNumber: string | null;
  /** The steps this job may take next, worked out server-side from the same rule the action re-checks. */
  nextSteps: { status: keyof typeof WORK_ORDER_STATUS_LABELS; label: string }[];
};

type Props = {
  jobs: JobCard[];
  staff: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  canCreate: boolean;
  canEdit: boolean;
};

/** The workshop: what is in, what it is waiting for, and what it will cost. */
export function WorkOrdersManager({ jobs, staff, customers, canCreate, canEdit }: Props) {
  const router = useRouter();
  const format = useFormat();
  const [intake, setIntake] = useState(false);
  const [editing, setEditing] = useState<JobCard | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const newButton = canCreate ? (
    <Button onClick={() => setIntake(true)}>
      <Plus />
      Take Something In
    </Button>
  ) : null;

  async function move(job: JobCard, status: JobCard["status"]) {
    setBusy(job.id);
    try {
      const result = await moveWorkOrder({ workOrderId: job.id, status });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.data.number}: ${WORK_ORDER_STATUS_LABELS[status].label.toLowerCase()}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {jobs.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Nothing in the workshop"
          description="Take something in and it appears here, from received to handed back."
          action={newButton}
        />
      ) : (
        <>
          <div className="flex justify-end">{newButton}</div>
          <div className="grid gap-3 lg:grid-cols-2">
            {jobs.map((job) => (
              <Card key={job.id} className={cn((job.status === "DELIVERED" || job.status === "CANCELLED") && "opacity-60")}>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{job.itemName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {job.number} · {job.customerName}
                        {job.customerPhone ? ` · ${job.customerPhone}` : ""}
                        {job.serialNumber ? ` · ${job.serialNumber}` : ""}
                      </p>
                    </div>
                    <StatusBadge tone={WORK_ORDER_STATUS_LABELS[job.status].tone}>{WORK_ORDER_STATUS_LABELS[job.status].label}</StatusBadge>
                  </div>

                  <p className="text-sm">{job.faultReported}</p>
                  {job.diagnosis ? <p className="rounded-md bg-muted px-2 py-1.5 text-xs">{job.diagnosis}</p> : null}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {job.estimate !== null ? <span className="font-medium text-foreground">Quoted {format.money(job.estimate)}</span> : <span>Not quoted yet</span>}
                    {job.staffName ? <span>{job.staffName}</span> : null}
                    {job.promisedLabel ? <span>Promised {job.promisedLabel}</span> : null}
                    {job.saleNumber ? <span>Paid · {job.saleNumber}</span> : null}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {canEdit ? (
                      <Button size="sm" variant="outline" onClick={() => setEditing(job)}>
                        <Pencil />
                        Details
                      </Button>
                    ) : null}
                    {canCreate && !job.saleNumber && job.status !== "CANCELLED" ? (
                      <Button size="sm" onClick={() => router.push(`/pos/register?job=${job.id}`)}>
                        <Receipt />
                        Take payment
                      </Button>
                    ) : null}
                    {canEdit
                      ? job.nextSteps.map((step) => (
                          <Button key={step.status} size="sm" variant="ghost" disabled={busy === job.id} onClick={() => move(job, step.status)}>
                            {busy === job.id ? <Loader2 className="animate-spin" /> : null}
                            {step.label}
                          </Button>
                        ))
                      : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={intake} onOpenChange={setIntake}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Take something in</DialogTitle>
            <DialogDescription>The job number is the customer&apos;s receipt for leaving it with you.</DialogDescription>
          </DialogHeader>
          {intake ? (
            <IntakeForm
              staff={staff}
              customers={customers}
              onClose={() => setIntake(false)}
              onDone={() => {
                setIntake(false);
                router.refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.number}</DialogTitle>
            <DialogDescription>What you found, what it will cost, and who is doing it.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <DetailsForm
              job={editing}
              staff={staff}
              onClose={() => setEditing(null)}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IntakeForm({
  staff,
  customers,
  onClose,
  onDone,
}: {
  staff: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [itemName, setItemName] = useState("");
  const [serial, setSerial] = useState("");
  const [fault, setFault] = useState("");
  const [staffId, setStaffId] = useState("");
  const [promised, setPromised] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await openWorkOrder({
        customerId: customerId || null,
        customerName: customerName.trim() || customers.find((c) => c.id === customerId)?.name || "",
        customerPhone: phone,
        itemName,
        serialNumber: serial,
        faultReported: fault,
        staffId: staffId || null,
        promisedDate: promised || null,
        note,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(`Taken in as ${result.data.number}`);
      onDone();
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

        <FormField label="Customer" htmlFor="job-customer" description="Pick a regular, or just type a name below.">
          <Combobox
            options={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
            value={customerId}
            onChange={(value) => {
              setCustomerId(value);
              const found = customers.find((customer) => customer.id === value);
              if (found) setCustomerName(found.name);
            }}
            placeholder="Walk-in"
            searchPlaceholder="Search customers…"
          />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Name on the job" htmlFor="job-name" required>
            <Input id="job-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="off" />
          </FormField>
          <FormField label="Phone" htmlFor="job-phone">
            <Input id="job-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" />
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="What was brought in" htmlFor="job-item" required>
            <Input id="job-item" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="iPhone 12, blue" autoComplete="off" />
          </FormField>
          <FormField label="Serial / IMEI" htmlFor="job-serial">
            <Input id="job-serial" value={serial} onChange={(e) => setSerial(e.target.value)} autoComplete="off" />
          </FormField>
        </div>

        <FormField label="What is wrong with it" htmlFor="job-fault" required description="In the customer's words.">
          <Textarea id="job-fault" value={fault} onChange={(e) => setFault(e.target.value)} rows={2} />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Technician" htmlFor="job-staff">
            <Select value={staffId || "none"} onValueChange={(v) => setStaffId(v === "none" ? "" : v)}>
              <SelectTrigger id="job-staff" className="w-full">
                <SelectValue placeholder="Nobody yet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nobody yet</SelectItem>
                {staff.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Promised for" htmlFor="job-promised">
            <Input id="job-promised" type="date" value={promised} onChange={(e) => setPromised(e.target.value)} />
          </FormField>
        </div>

        <FormField label="Note" htmlFor="job-note">
          <Textarea id="job-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || !customerName.trim() || !itemName.trim() || !fault.trim()}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Take it in
        </Button>
      </DialogFooter>
    </>
  );
}

function DetailsForm({ job, staff, onClose, onDone }: { job: JobCard; staff: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [diagnosis, setDiagnosis] = useState(job.diagnosis ?? "");
  const [estimate, setEstimate] = useState(job.estimate === null ? "" : String(job.estimate));
  const [staffId, setStaffId] = useState(job.staffId ?? "");
  const [note, setNote] = useState(job.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await saveWorkOrderDetails({
        workOrderId: job.id,
        diagnosis,
        estimate: estimate.trim() === "" ? null : Number(estimate),
        staffId: staffId || null,
        promisedDate: null,
        note,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(`${result.data.number} updated`);
      onDone();
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
        <FormField label="What you found" htmlFor="job-diagnosis">
          <Textarea id="job-diagnosis" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={3} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Quote" htmlFor="job-estimate" description="Approving a job means approving this figure.">
            <Input id="job-estimate" value={estimate} onChange={(e) => setEstimate(e.target.value)} inputMode="decimal" />
          </FormField>
          <FormField label="Technician" htmlFor="job-tech">
            <Select value={staffId || "none"} onValueChange={(v) => setStaffId(v === "none" ? "" : v)}>
              <SelectTrigger id="job-tech" className="w-full">
                <SelectValue placeholder="Nobody yet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nobody yet</SelectItem>
                {staff.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <FormField label="Note" htmlFor="job-note-edit">
          <Textarea id="job-note-edit" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
