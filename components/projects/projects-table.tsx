"use client";

import Link from "next/link";
import { Download, Eye, FolderKanban, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination } from "@/components/shared/pagination";
import { StatusMenu, statusChoices } from "@/components/shared/status-menu";
import { useFormat } from "@/components/providers/format-provider";
import { setProjectStatus } from "@/actions/projects";
import type { ProjectListItem } from "@/lib/data/projects";
import { ProjectStatus } from "@/lib/generated/prisma/enums";
import { PROJECT_FILTERS, PROJECT_STATUS, projectTypeLabel } from "@/lib/validation/projects";

type Props = {
  items: ProjectListItem[];
  total: number;
  page: number;
  hasQuery: boolean;
  canCreate: boolean;
  canEdit: boolean;
  embedded?: boolean;
  customerId?: string;
};

export function ProjectsTable({ items, total, page, hasQuery, canCreate, canEdit, embedded, customerId }: Props) {
  const format = useFormat();
  const newHref = customerId ? `/projects/new?customer=${customerId}` : "/projects/new";
  const newButton = canCreate ? (
    <Button asChild>
      <Link href={newHref}>
        <Plus />
        New Project
      </Link>
    </Button>
  ) : null;

  return (
    <div className="space-y-4">
      {!embedded ? (
        <ListToolbar filters={PROJECT_FILTERS} searchPlaceholder="Search by code, name or customer">
          {newButton}
        </ListToolbar>
      ) : canCreate ? (
        <div className="flex justify-end">{newButton}</div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={hasQuery ? "No projects match" : "No projects yet"}
          description={hasQuery ? "Try a different search or filter." : "Create a project to track its sales, purchases and documents in one place."}
          action={!hasQuery && !embedded ? newButton : undefined}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                {!embedded ? <TableHead>Customer</TableHead> : null}
                <TableHead className="hidden lg:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Start</TableHead>
                <TableHead className="hidden lg:table-cell">Expected</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => {
                const status = PROJECT_STATUS[p.status];
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{p.code}</p>
                    </TableCell>
                    {!embedded ? (
                      <TableCell>
                        <Link href={`/customers/${p.customer.id}`} className="hover:underline">
                          {p.customer.name}
                        </Link>
                      </TableCell>
                    ) : null}
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{projectTypeLabel(p.type)}</TableCell>
                    <TableCell className="hidden md:table-cell">{format.date(p.startDate)}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{p.expectedCompletionDate ? format.date(p.expectedCompletionDate) : "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{format.money(p.value)}</TableCell>
                    <TableCell>
                      <StatusMenu
                        current={status}
                        choices={canEdit ? statusChoices(Object.values(ProjectStatus).filter((s) => s !== p.status), PROJECT_STATUS) : []}
                        onSelect={(value) => setProjectStatus(p.id, value)}
                        note={canEdit ? undefined : "You do not have permission to change project statuses."}
                      />
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
                            <Link href={`/projects/${p.id}`}>
                              <Eye />
                              View
                            </Link>
                          </DropdownMenuItem>
                          {canEdit ? (
                            <DropdownMenuItem asChild>
                              <Link href={`/projects/${p.id}/edit`}>
                                <Pencil />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem asChild>
                            <a href={`/api/projects/${p.id}/pdf`} target="_blank" rel="noreferrer">
                              <Eye />
                              Print
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={`/api/projects/${p.id}/pdf?download=1`}>
                              <Download />
                              Download PDF
                            </a>
                          </DropdownMenuItem>
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
      {!embedded ? <Pagination page={page} total={total} /> : null}
    </div>
  );
}
