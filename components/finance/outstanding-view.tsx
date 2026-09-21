"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Mail, MoreHorizontal, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Combobox } from "@/components/shared/combobox";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCards } from "@/components/shared/stat-cards";
import { StatusBadge } from "@/components/shared/status-badge";
import { useUrlFilters } from "@/components/shared/use-url-filters";
import { useFormat } from "@/components/providers/format-provider";
import { RecordPaymentDialog, type PaymentAccountOption } from "@/components/documents/record-payment-dialog";
import { SendDialog } from "@/components/documents/send-dialog";
import { recordInvoicePayment } from "@/actions/invoices";
import { recordPurchasePayment } from "@/actions/purchases";
import { prepareInvoiceReminder, preparePurchaseReminder, sendInvoiceReminder, sendPurchaseReminder } from "@/actions/finance";
import type { PartyOutstanding } from "@/lib/business/finance";
import { INVOICE_STATUS } from "@/lib/business/sales-status";
import { PURCHASE_STATUS } from "@/lib/business/procurement-status";
import type { InvoiceStatus, PurchaseStatus } from "@/lib/generated/prisma/enums";

export type OutstandingDoc = {
  id: string;
  number: string;
  dueDate: Date;
  status: string;
  grandTotal: number;
  paidTotal: number;
  remaining: number;
  party: { id: string; name: string; email: string | null };
};

type Props = {
  kind: "receivables" | "payables";
  docs: OutstandingDoc[];
  parties: PartyOutstanding[];
  partyOptions: { id: string; name: string }[];
  accounts: PaymentAccountOption[];
  today: string;
  canEdit: boolean;
  emailConfigured: boolean;
};

const ALL = "__all__";
const STATUS_OPTIONS = [
  { value: "unpaid", label: "Unpaid" },
  { value: "partially-paid", label: "Partially Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
];

export function OutstandingView({ kind, docs, parties, partyOptions, accounts, today, canEdit, emailConfigured }: Props) {
  const format = useFormat();
  const { get, set } = useUrlFilters();
  const [paying, setPaying] = useState<OutstandingDoc | undefined>();
  const [reminding, setReminding] = useState<OutstandingDoc | undefined>();
  const isReceivable = kind === "receivables";
  const docLabel = isReceivable ? "Invoice" : "Purchase";
  const partyLabel = isReceivable ? "Customer" : "Supplier";
  const docHref = (id: string) => (isReceivable ? `/sales/invoices/${id}` : `/procurement/purchases/${id}`);
  const partyHref = (id: string) => (isReceivable ? `/customers/${id}` : `/procurement/suppliers/${id}`);
  const statusOf = (s: string) => (isReceivable ? INVOICE_STATUS[s as InvoiceStatus] : PURCHASE_STATUS[s as PurchaseStatus]);

  const totalOutstanding = docs.reduce((sum, d) => sum + d.remaining, 0);
  const totalOverdue = docs.filter((d) => d.status === "OVERDUE").reduce((sum, d) => sum + d.remaining, 0);

  return (
    <div className="space-y-6">
      <StatCards
        stats={[
          { label: isReceivable ? "Total owed to us" : "Total we owe", value: totalOutstanding, hint: "For the current filters" },
          { label: "Overdue", value: totalOverdue, tone: totalOverdue > 0 ? "danger" : "default" },
          { label: `${partyLabel}s with balance`, value: parties.length, hint: `${docs.filter((d) => d.remaining > 0).length} open ${docLabel.toLowerCase()}s` },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Combobox
            options={[{ value: ALL, label: `All ${partyLabel.toLowerCase()}s` }, ...partyOptions.map((p) => ({ value: p.id, label: p.name }))]}
            value={get("party") || ALL}
            onChange={(v) => set({ party: v === ALL ? null : v })}
            placeholder={`All ${partyLabel.toLowerCase()}s`}
            searchPlaceholder={`Search ${partyLabel.toLowerCase()}s…`}
          />
        </div>
        <Select value={get("status") || ALL} onValueChange={(v) => set({ status: v === ALL ? null : v, overdue: null })}>
          <SelectTrigger className="w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All open</SelectItem>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangeFilter today={today} />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={get("overdue") === "1"} onCheckedChange={(v) => set({ overdue: v === true ? "1" : null, status: null })} />
          Overdue only
        </label>
      </div>

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">By {docLabel.toLowerCase()}</TabsTrigger>
          <TabsTrigger value="parties">By {partyLabel.toLowerCase()}</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="pt-4">
          {docs.length === 0 ? (
            <EmptyState icon={Wallet} title="Nothing outstanding" description={isReceivable ? "No customer balances match these filters." : "No supplier balances match these filters."} />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{docLabel}</TableHead>
                    <TableHead>{partyLabel}</TableHead>
                    <TableHead className="hidden md:table-cell">Due date</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Total</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Paid</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map((d) => {
                    const status = statusOf(d.status);
                    return (
                      <TableRow key={d.id}>
                        <TableCell>
                          <Link href={docHref(d.id)} className="font-medium hover:underline">
                            {d.number}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={partyHref(d.party.id)} className="hover:underline">
                            {d.party.name}
                          </Link>
                        </TableCell>
                        <TableCell className={`hidden md:table-cell ${d.status === "OVERDUE" ? "text-destructive" : ""}`}>{format.date(d.dueDate)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{format.money(d.grandTotal)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">{format.money(d.paidTotal)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{format.money(d.remaining)}</TableCell>
                        <TableCell>
                          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Actions">
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={docHref(d.id)}>
                                  <Eye />
                                  View
                                </Link>
                              </DropdownMenuItem>
                              {canEdit && d.remaining > 0 ? (
                                <DropdownMenuItem onSelect={() => setPaying(d)}>
                                  <Wallet />
                                  Record Payment
                                </DropdownMenuItem>
                              ) : null}
                              {canEdit && d.remaining > 0 ? (
                                <DropdownMenuItem onSelect={() => setReminding(d)}>
                                  <Mail />
                                  Send Reminder
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="parties" className="pt-4">
          {parties.length === 0 ? (
            <EmptyState icon={Wallet} title="Nothing outstanding" description="No balances match these filters." />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{partyLabel}</TableHead>
                    <TableHead className="hidden sm:table-cell">Open {docLabel.toLowerCase()}s</TableHead>
                    <TableHead className="text-right">Total outstanding</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parties.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={partyHref(p.id)} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                        {p.email ? <p className="text-xs text-muted-foreground">{p.email}</p> : null}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{p.count}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{format.money(p.outstanding)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${p.overdue > 0 ? "font-medium text-destructive" : "text-muted-foreground"}`}>{format.money(p.overdue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {paying ? (
        <RecordPaymentDialog
          open
          onOpenChange={(o) => !o && setPaying(undefined)}
          documentNumber={paying.number}
          remaining={paying.remaining}
          today={today}
          accounts={accounts}
          direction={isReceivable ? "received" : "paid"}
          record={(values) => (isReceivable ? recordInvoicePayment(paying.id, values) : recordPurchasePayment(paying.id, values))}
        />
      ) : null}
      {reminding ? (
        <SendDialog
          open
          onOpenChange={(o) => !o && setReminding(undefined)}
          title={`${isReceivable ? "Payment reminder" : "Payment notice"} for ${reminding.number}`}
          attachmentName={`${reminding.number}.pdf`}
          prepare={() => (isReceivable ? prepareInvoiceReminder(reminding.id) : preparePurchaseReminder(reminding.id))}
          send={(values) => (isReceivable ? sendInvoiceReminder(reminding.id, values) : sendPurchaseReminder(reminding.id, values))}
          emailConfigured={emailConfigured}
        />
      ) : null}
    </div>
  );
}
