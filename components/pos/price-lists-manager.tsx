"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Tags, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/shared/combobox";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { SettingSwitchRow } from "@/components/settings/setting-switch-row";
import { useFormat } from "@/components/providers/format-provider";
import { createPriceList, savePriceEntry, setCustomerPriceList, updatePriceList } from "@/actions/pricing";
import { cn } from "@/lib/utils";

export type ListEntry = {
  variantId: string;
  name: string;
  unit: string;
  catalogue: number;
  price: number | null;
  discountPercent: number;
  effective: number;
  tiers: { minQuantity: number; price: number }[];
};

export type ListView = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  customers: { id: string; name: string }[];
  items: ListEntry[];
};

type Props = {
  lists: ListView[];
  products: { variantId: string; name: string; price: number; unit: string }[];
  customers: { id: string; name: string; listId: string | null; listName: string | null }[];
  canCreate: boolean;
  canEdit: boolean;
};

/**
 * Price lists: who pays what. The till shows these prices and the sale engine charges them, so
 * this screen is the one place a wholesale price is decided.
 */
export function PriceListsManager({ lists, products, customers, canCreate, canEdit }: Props) {
  const format = useFormat();
  const [editingList, setEditingList] = useState<ListView | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [entry, setEntry] = useState<{ list: ListView; existing: ListEntry | null } | null>(null);
  const [assigning, setAssigning] = useState(false);

  const newButton = canCreate ? (
    <Button
      onClick={() => {
        setEditingList(null);
        setListOpen(true);
      }}
    >
      <Plus />
      New Price List
    </Button>
  ) : null;

  return (
    <div className="space-y-4">
      {lists.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No price lists yet"
          description="A list holds the prices a group of customers pays — trade, distributor, staff — with quantity breaks for buying in bulk."
          action={newButton}
        />
      ) : (
        <>
          <div className="flex flex-wrap justify-end gap-2">
            {canEdit ? (
              <Button variant="outline" onClick={() => setAssigning(true)}>
                <Users />
                Who is on a list
              </Button>
            ) : null}
            {newButton}
          </div>

          {lists.map((list) => (
            <Card key={list.id} className={cn(!list.isActive && "opacity-60")}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {list.name}
                  {list.isDefault ? <StatusBadge tone="info">Default</StatusBadge> : null}
                  {!list.isActive ? <StatusBadge tone="neutral">Out of use</StatusBadge> : null}
                </CardTitle>
                <CardDescription>
                  {list.description ? `${list.description} · ` : ""}
                  {list.customers.length} {list.customers.length === 1 ? "customer" : "customers"}
                  {list.isDefault ? " named, plus everyone without a list" : ""}
                </CardDescription>
                <div className="row-start-1 flex justify-self-end gap-1">
                  {canEdit ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setEntry({ list, existing: null })}>
                        <Plus />
                        Price an item
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${list.name}`}
                        onClick={() => {
                          setEditingList(list);
                          setListOpen(true);
                        }}
                      >
                        <Pencil />
                      </Button>
                    </>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {list.items.length === 0 ? (
                  <p className="px-6 pb-6 text-sm text-muted-foreground">Nothing priced yet — this list charges catalogue prices.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Catalogue</TableHead>
                        <TableHead className="text-right">On this list</TableHead>
                        <TableHead>Quantity breaks</TableHead>
                        <TableHead className="w-16">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.items.map((item) => (
                        <TableRow key={item.variantId}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">{format.money(item.catalogue)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {format.money(item.effective)}
                            {item.price === null && item.discountPercent > 0 ? (
                              <span className="block text-xs text-muted-foreground">{item.discountPercent}% off</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.tiers.length === 0
                              ? "—"
                              : item.tiers.map((tier) => `${format.number(tier.minQuantity)}+ → ${format.money(tier.price)}`).join(" · ")}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              {canEdit ? (
                                <Button variant="ghost" size="icon" aria-label={`Edit ${item.name} on ${list.name}`} onClick={() => setEntry({ list, existing: item })}>
                                  <Pencil />
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))}
        </>
      )}

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingList ? `Edit ${editingList.name}` : "New price list"}</DialogTitle>
            <DialogDescription>One list can be the default: what a customer with no list of their own pays.</DialogDescription>
          </DialogHeader>
          {listOpen ? <ListForm list={editingList} onClose={() => setListOpen(false)} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={entry !== null} onOpenChange={(open) => !open && setEntry(null)}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{entry?.existing ? entry.existing.name : "Price an item"}</DialogTitle>
            <DialogDescription>
              A fixed price, or a percentage off the catalogue — then quantity breaks for buying more. Saving it empty puts the item back on catalogue prices.
            </DialogDescription>
          </DialogHeader>
          {entry ? <EntryForm list={entry.list} existing={entry.existing} products={products} onClose={() => setEntry(null)} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={assigning} onOpenChange={setAssigning}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Who is on a list</DialogTitle>
            <DialogDescription>A customer with no list pays the default list, or the catalogue when there is no default.</DialogDescription>
          </DialogHeader>
          {assigning ? <AssignBody lists={lists} customers={customers} onClose={() => setAssigning(false)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ListForm({ list, onClose }: { list: ListView | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(list?.name ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [isDefault, setIsDefault] = useState(list?.isDefault ?? false);
  const [isActive, setIsActive] = useState(list?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("name", name);
      formData.set("description", description);
      formData.set("isDefault", String(isDefault));
      formData.set("isActive", String(isActive));
      const result = list ? await updatePriceList(list.id, formData) : await createPriceList(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(list ? "Price list saved" : "Price list added");
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
        <FormField label="Name" htmlFor="list-name" required>
          <Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Trade" autoComplete="off" />
        </FormField>
        <FormField label="Description" htmlFor="list-description">
          <Textarea id="list-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </FormField>
        <SettingSwitchRow
          label="Default list"
          description="What a customer with no list of their own pays. Only one list can be the default."
          checked={isDefault}
          onCheckedChange={setIsDefault}
        />
        <SettingSwitchRow
          label="In use"
          description="Taking a list out of use puts its customers back on the default."
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
          {list ? "Save changes" : "Add the list"}
        </Button>
      </DialogFooter>
    </>
  );
}

type TierRow = { key: string; minQuantity: string; price: string };

function EntryForm({
  list,
  existing,
  products,
  onClose,
}: {
  list: ListView;
  existing: ListEntry | null;
  products: { variantId: string; name: string; price: number; unit: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const format = useFormat();
  const [variantId, setVariantId] = useState(existing?.variantId ?? "");
  const [price, setPrice] = useState(existing?.price === null || existing === null ? "" : String(existing.price));
  const [discount, setDiscount] = useState(String(existing?.discountPercent ?? 0));
  const [tiers, setTiers] = useState<TierRow[]>(
    existing?.tiers.map((tier, index) => ({ key: `tier-${index}`, minQuantity: String(tier.minQuantity), price: String(tier.price) })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const product = products.find((item) => item.variantId === variantId);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await savePriceEntry({
        listId: list.id,
        variantId,
        price: price.trim() === "" ? null : Number(price),
        discountPercent: Number(discount) || 0,
        tiers: tiers
          .filter((tier) => tier.minQuantity.trim() !== "" && tier.price.trim() !== "")
          .map((tier) => ({ minQuantity: Number(tier.minQuantity), price: Number(tier.price) })),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(result.data.removed ? "Back on catalogue prices" : "Price saved");
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

        <FormField label="Item" htmlFor="entry-item" required>
          <Combobox
            options={products.map((item) => ({ value: item.variantId, label: item.name }))}
            value={variantId}
            onChange={setVariantId}
            placeholder="Choose an item"
            searchPlaceholder="Search the catalogue…"
            disabled={Boolean(existing)}
          />
        </FormField>

        {product ? <p className="text-xs text-muted-foreground">Catalogue price {format.money(product.price)} per {product.unit}.</p> : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Price on this list" htmlFor="entry-price" description="Leave blank to discount the catalogue price instead.">
            <Input id="entry-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
          </FormField>
          <FormField label="Or discount" htmlFor="entry-discount" description="Off the catalogue price.">
            <div className="relative">
              <Input id="entry-discount" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" className="pr-8" />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </FormField>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Quantity breaks</p>
          <p className="text-xs text-muted-foreground">Buy this many or more, pay this each. Breaks must get cheaper as the quantity goes up.</p>
          {tiers.map((tier) => (
            <div key={tier.key} className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  value={tier.minQuantity}
                  onChange={(e) => setTiers((prev) => prev.map((t) => (t.key === tier.key ? { ...t, minQuantity: e.target.value } : t)))}
                  inputMode="decimal"
                  placeholder="From quantity"
                  aria-label="From quantity"
                />
              </div>
              <div className="flex-1">
                <Input
                  value={tier.price}
                  onChange={(e) => setTiers((prev) => prev.map((t) => (t.key === tier.key ? { ...t, price: e.target.value } : t)))}
                  inputMode="decimal"
                  placeholder="Price each"
                  aria-label="Price each"
                />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove break" onClick={() => setTiers((prev) => prev.filter((t) => t.key !== tier.key))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setTiers((prev) => [...prev, { key: `tier-${Date.now()}`, minQuantity: "", price: "" }])}>
            <Plus />
            Add a break
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || !variantId}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

function AssignBody({
  lists,
  customers,
  onClose,
}: {
  lists: ListView[];
  customers: { id: string; name: string; listId: string | null; listName: string | null }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function assign(customerId: string, listId: string) {
    setBusy(customerId);
    setError(null);
    try {
      const result = await setCustomerPriceList({ customerId, listId: listId === "none" ? null : listId });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(`${result.data.customerName} updated`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {customers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No customers yet.</p>
        ) : (
          customers.map((customer) => (
            <div key={customer.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm">{customer.name}</span>
              <Select value={customer.listId ?? "none"} onValueChange={(value) => assign(customer.id, value)} disabled={busy === customer.id}>
                <SelectTrigger className="w-44" aria-label={`Price list for ${customer.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default prices</SelectItem>
                  {lists
                    .filter((list) => list.isActive)
                    .map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ))
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
