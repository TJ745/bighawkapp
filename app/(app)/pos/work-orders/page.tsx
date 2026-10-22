import type { Metadata } from "next";
import { WorkOrdersManager, type JobCard } from "@/components/pos/work-orders-manager";
import { PageHeader } from "@/components/shared/page-header";
import { requirePosCapability } from "@/lib/auth/session";
import { workOrderTransitions } from "@/lib/business/work-orders";
import { listWorkOrders } from "@/lib/data/industries";
import { listCustomerOptions } from "@/lib/data/parties";
import { getCurrentBranch } from "@/lib/data/platform";
import { listStaff } from "@/lib/data/staff";
import { getFormatters } from "@/lib/settings/formatters";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/validation/industries";

export const metadata: Metadata = { title: "Work orders" };

/** The workshop. A job is the work; the money for it is an ordinary sale. */
export default async function WorkOrdersPage() {
  const auth = await requirePosCapability("WORK_ORDERS", "POS", "view");
  const [branch, format] = await Promise.all([getCurrentBranch(), getFormatters()]);
  const [jobs, staff, customers] = await Promise.all([listWorkOrders(branch.id), listStaff(branch.id, { activeOnly: true }), listCustomerOptions()]);

  const cards: JobCard[] = jobs.map((job) => ({
    id: job.id,
    number: job.number,
    customerId: job.customerId,
    customerName: job.customerName,
    customerPhone: job.customerPhone,
    itemName: job.itemName,
    serialNumber: job.serialNumber,
    faultReported: job.faultReported,
    diagnosis: job.diagnosis,
    estimate: job.estimate,
    status: job.status,
    staffId: job.staffId,
    staffName: job.staffName,
    promisedLabel: job.promisedAt ? format.date(job.promisedAt) : null,
    note: job.note,
    saleNumber: job.saleNumber,
    // The steps on screen come from the same helper the action re-checks, so they cannot disagree.
    nextSteps: workOrderTransitions(job.status).map((status) => ({ status, label: WORK_ORDER_STATUS_LABELS[status].label })),
  }));

  return (
    <>
      <PageHeader title="Work orders" description={`Repairs at ${branch.name}, from taken in to handed back. Nothing leaves unpaid.`} />
      <WorkOrdersManager
        jobs={cards}
        staff={staff.map((person) => ({ id: person.id, name: person.name }))}
        customers={customers}
        canCreate={auth.can("POS", "create")}
        canEdit={auth.can("POS", "edit")}
      />
    </>
  );
}
