"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, MoreHorizontal, Pencil, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { useUrlFilters } from "@/components/shared/use-url-filters";
import { useFormat } from "@/components/providers/format-provider";
import type { ExpenseEntry, IncomeEntry } from "@/lib/business/finance";
import type { FinanceCategoryOption, FinanceEntryDetail } from "@/lib/data/finance";
import { EntryDialog, type AccountOption } from "./entry-dialog";

type Entry = IncomeEntry | ExpenseEntry;

type Props = {
  kind: "income" | "expense";
  entries: Entry[];
  categories: FinanceCategoryOption[];
  accounts: AccountOption[];
  today: string;
  canCreate: boolean;
  canEdit: boolean;
  // Entry being edited/viewed (loaded server-side from ?entry=).
  activeEntry?: FinanceEntryDetail | null;
};

const ALL = "__all__";

export function EntriesTable({ kind, entries, categories, accounts, today, canCreate, canEdit, activeEntry }: Props) {
  const format = useFormat();
  const { get, set } = useUrlFilters();
  const [createOpen, setCreateOpen] = useState(false);
  // ?new=1 (e.g. from the dashboard quick action) opens the create dialog straight away.
  const openCreate = createOpen || get("new") === "1";
  const isIncome = kind === "income";
  const editing = Boolean(get("entry")) && activeEntry ? activeEntry : undefined;

  const typeOptions = isIncome
    ? [
        { value: "customer-payment", label: "Customer payments" },
        { value: "other-income", label: "Other income" },
      ]
    : [
        { value: "supplier-payment", label: "Supplier payments" },
        { value: "general-expense", label: "General expenses" },
      ];

  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  const isDocumentPayment = (e: Entry) => e.kind === "CUSTOMER_PAYMENT" || e.kind === "SUPPLIER_PAYMENT";
  const documentHref = (e: Entry) =>
    "invoiceId" in e && e.invoiceId ? `/sales/invoices/${e.invoiceId}` : "purchaseId" in e && e.purchaseId ? `/procurement/purchases/${e.purchaseId}` : "#";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter today={today} defaultPreset="this-month" />
          <Select value={get("type") || ALL} onValueChange={(v) => set({ type: v === ALL ? null : v })}>
            <SelectTrigger className="w-44" aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {typeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isIncome ? (
            <Select value={get("category") || ALL} onValueChange={(v) => set({ category: v === ALL ? null : v })}>
              <SelectTrigger className="w-44" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select value={get("account") || ALL} onValueChange={(v) => set({ account: v === ALL ? null : v })}>
            <SelectTrigger className="w-44" aria-label="Account">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canCreate ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            {isIncome ? "New Other Income" : "New Expense"}
          </Button>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={isIncome ? "No income in this period" : "No expenses in this period"}
          description={isIncome ? "Customer payments and other income will appear here." : "Supplier payments and general expenses will appear here."}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                {!isIncome ? <TableHead className="hidden md:table-cell">Category</TableHead> : null}
                <TableHead>Description</TableHead>
                <TableHead className="hidden lg:table-cell">Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={`${e.kind}-${e.id}`}>
                  <TableCell className="whitespace-nowrap">{format.date(e.date)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusBadge tone={isDocumentPayment(e) ? "info" : "neutral"}>
                      {e.kind === "CUSTOMER_PAYMENT" ? "Customer payment" : e.kind === "OTHER_INCOME" ? "Other income" : e.kind === "SUPPLIER_PAYMENT" ? "Supplier payment" : "General expense"}
                    </StatusBadge>
                  </TableCell>
                  {!isIncome ? <TableCell className="hidden text-muted-foreground md:table-cell">{e.category}</TableCell> : null}
                  <TableCell>
                    <p className="line-clamp-2">{e.description}</p>
                    <p className="text-xs text-muted-foreground">{e.number}</p>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{e.accountName}</TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${isIncome ? "text-success" : ""}`}>{format.money(e.amount)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isDocumentPayment(e) ? (
                          <DropdownMenuItem asChild>
                            <Link href={documentHref(e)}>
                              <Eye />
                              View {e.kind === "CUSTOMER_PAYMENT" ? "invoice" : "purchase"}
                            </Link>
                          </DropdownMenuItem>
                        ) : (
                          <>
                            <DropdownMenuItem onSelect={() => set({ entry: e.id })}>
                              <Eye />
                              View
                            </DropdownMenuItem>
                            {canEdit ? (
                              <DropdownMenuItem onSelect={() => set({ entry: e.id })}>
                                <Pencil />
                                Edit
                              </DropdownMenuItem>
                            ) : null}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={isIncome ? 4 : 5} className="font-medium">
                  Total for this selection
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{format.money(total)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      <EntryDialog
        kind={kind}
        open={openCreate}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o && get("new")) set({ new: null });
        }} categories={categories} accounts={accounts} today={today} canCreateCategory={canCreate} />
      {editing ? (
        <EntryDialog
          kind={kind}
          open
          onOpenChange={(o) => !o && set({ entry: null })}
          categories={categories}
          accounts={accounts}
          today={today}
          entry={editing}
          canCreateCategory={canCreate}
          readOnly={!canEdit}
        />
      ) : null}
    </div>
  );
}
