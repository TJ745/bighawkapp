"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { SettingSwitchRow } from "@/components/settings/setting-switch-row";
import { createTable, updateTable } from "@/actions/tables";

export type TableListItem = {
  id: string;
  name: string;
  area: string | null;
  seats: number;
  sortOrder: number;
  isActive: boolean;
  openOrders: number;
};

type Props = {
  tables: TableListItem[];
  branchName: string;
  canCreate: boolean;
  canEdit: boolean;
};

export function TablesManager({ tables, branchName, canCreate, canEdit }: Props) {
  const [editing, setEditing] = useState<TableListItem | null>(null);
  const [open, setOpen] = useState(false);

  const newButton = canCreate ? (
    <Button
      onClick={() => {
        setEditing(null);
        setOpen(true);
      }}
    >
      <Plus />
      New Table
    </Button>
  ) : null;

  return (
    <>
      {tables.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No tables yet"
          description={`Add the tables at ${branchName} so orders can be opened on them.`}
          action={newButton}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Tables</CardTitle>
            <CardDescription>Sections keep the floor plan readable; the order decides where each table sits in its section.</CardDescription>
            {newButton ? <div className="row-start-1 justify-self-end">{newButton}</div> : null}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead className="hidden sm:table-cell">Section</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((table) => (
                  <TableRow key={table.id}>
                    <TableCell className="font-medium">{table.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{table.area ?? "Floor"}</TableCell>
                    <TableCell className="tabular-nums">{table.seats}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={table.isActive ? "success" : "neutral"}>{table.isActive ? "In use" : "Out of use"}</StatusBadge>
                        {table.openOrders > 0 ? <StatusBadge tone="info">{table.openOrders === 1 ? "Order open" : `${table.openOrders} bills`}</StatusBadge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {canEdit ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${table.name}`}
                            onClick={() => {
                              setEditing(table);
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
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit table" : "New table"}</DialogTitle>
            <DialogDescription>{editing ? "Change this table's name, section or seats." : `Add a table for ${branchName}.`}</DialogDescription>
          </DialogHeader>
          {open ? <TableForm table={editing} onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TableForm({ table, onClose }: { table: TableListItem | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(table?.name ?? "");
  const [area, setArea] = useState(table?.area ?? "");
  const [seats, setSeats] = useState(String(table?.seats ?? 2));
  const [sortOrder, setSortOrder] = useState(String(table?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(table?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("name", name);
      formData.set("area", area);
      formData.set("seats", seats);
      formData.set("sortOrder", sortOrder);
      formData.set("isActive", String(isActive));
      const result = table ? await updateTable(table.id, formData) : await createTable(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(table ? "Table saved" : "Table added");
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
        <FormField label="Name" htmlFor="table-name" required description="What the staff call it — Table 4, Booth 2, Terrace 1…">
          <Input id="table-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </FormField>
        <FormField label="Section" htmlFor="table-area" description="Groups the floor plan. Leave blank to keep it under Floor.">
          <Input id="table-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ground floor" autoComplete="off" />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Seats" htmlFor="table-seats" required>
            <Input id="table-seats" value={seats} onChange={(e) => setSeats(e.target.value)} inputMode="numeric" />
          </FormField>
          <FormField label="Shown in position" htmlFor="table-order" description="Lower comes first.">
            <Input id="table-order" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" />
          </FormField>
        </div>
        <SettingSwitchRow
          label="In use"
          description="A table with an open order cannot be taken out of use."
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
          {table ? "Save changes" : "Add table"}
        </Button>
      </DialogFooter>
    </>
  );
}
