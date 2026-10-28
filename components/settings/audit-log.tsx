"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { useUrlFilters } from "@/components/shared/use-url-filters";
import { useFormat } from "@/components/providers/format-provider";
import { AUDIT_AREAS, type AuditEntry } from "@/lib/platform/audit-areas";
import { ScrollText } from "lucide-react";

/**
 * Settings → Activity: who did what, and when.
 *
 * Every consequential change in the app has been writing itself down since the beginning; this
 * is the first screen that reads any of it back. Deliberately plain — a log is read when
 * something has gone wrong or somebody is being asked to account for a change, and neither is a
 * moment for a clever layout.
 *
 * The same component serves a company's own administrator and the BigHawk operator looking
 * across every customer. The only difference is a Company column, which appears when the rows
 * carry one.
 */
export function AuditLog({
  entries,
  total,
  page,
  users,
  today,
  acrossCompanies,
}: {
  entries: AuditEntry[];
  total: number;
  page: number;
  users: { id: string; name: string }[];
  /** The company's own today, so the date presets agree with every other screen. */
  today: string;
  /** True on the operator's view: rows come from more than one customer. */
  acrossCompanies: boolean;
}) {
  const format = useFormat();
  const { get, set } = useUrlFilters();
  const userId = get("userId") || "all";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>
            {acrossCompanies
              ? "Every change made across every customer, newest first."
              : "Every change made in this company, newest first. Records are never edited or removed."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ListToolbar filters={[...AUDIT_AREAS]} searchPlaceholder="Search what happened…">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={userId} onValueChange={(value) => set({ userId: value === "all" ? null : value, page: null })}>
                <SelectTrigger className="w-52" aria-label="Who">
                  <SelectValue placeholder="Anyone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Anyone</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DateRangeFilter today={today} />
            </div>
          </ListToolbar>

          {entries.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="Nothing to show"
              description="No activity matches what you are looking for. Try a wider date range."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">When</TableHead>
                    <TableHead className="w-40">Who</TableHead>
                    {acrossCompanies ? <TableHead className="w-40">Company</TableHead> : null}
                    <TableHead>What happened</TableHead>
                    <TableHead className="w-44">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {format.dateTime(entry.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">{entry.userName}</TableCell>
                      {acrossCompanies ? <TableCell className="text-muted-foreground">{entry.companyName ?? "—"}</TableCell> : null}
                      <TableCell>{entry.summary}</TableCell>
                      <TableCell>
                        <StatusBadge tone="neutral">{entry.action}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <Pagination page={page} total={total} />
        </CardContent>
      </Card>
    </div>
  );
}
