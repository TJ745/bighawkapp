"use client";

import { LockKeyhole } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import type { ShiftRow } from "@/lib/data/pos";
import { cn } from "@/lib/utils";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

export function ShiftsTable({ shifts, total, page }: { shifts: ShiftRow[]; total: number; page: number }) {
  const format = useFormat();

  return (
    <div className="space-y-4">
      <ListToolbar filters={FILTERS} />

      {shifts.length === 0 ? (
        <EmptyState icon={LockKeyhole} title="No shifts yet" description="Opening a shift at the register starts the drawer for a cashier." />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Register</TableHead>
                <TableHead className="hidden sm:table-cell">Opened</TableHead>
                <TableHead className="hidden lg:table-cell">Closed</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="hidden text-right md:table-cell">Expected</TableHead>
                <TableHead className="text-right">Counted</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell>
                    <p className="font-medium">{shift.registerName}</p>
                    <p className="text-xs text-muted-foreground">Float {format.money(shift.openingCash)}</p>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    <p>{format.dateTime(shift.openedAt)}</p>
                    <p className="text-xs">{shift.openedByName}</p>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {shift.closedAt ? (
                      <>
                        <p>{format.dateTime(shift.closedAt)}</p>
                        <p className="text-xs">{shift.closedByName}</p>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{shift.saleCount}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {shift.expectedCash === null ? "—" : format.money(shift.expectedCash)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{shift.closingCash === null ? "—" : format.money(shift.closingCash)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {shift.variance === null ? (
                      "—"
                    ) : (
                      <span className={cn("font-medium", shift.variance === 0 ? "text-tint-green-foreground" : "text-tint-red-foreground")}>
                        {shift.variance > 0 ? "+" : ""}
                        {format.money(shift.variance)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={shift.status === "OPEN" ? "info" : "neutral"}>{shift.status === "OPEN" ? "Open" : "Closed"}</StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={page} total={total} />
    </div>
  );
}
