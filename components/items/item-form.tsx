"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Package, Plus, Trash2, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { SettingSwitchRow } from "@/components/settings/setting-switch-row";
import { createItem, updateItem } from "@/actions/items";
import { setItemModifierGroups } from "@/actions/modifiers";
import type { ItemCategoryRow, ItemDetail } from "@/lib/data/items";
import type { ItemKind } from "@/lib/generated/prisma/enums";
import { UNIT_OPTIONS } from "@/lib/validation/items";
import { cn } from "@/lib/utils";

/** One row of the variant table while editing; `id` is present for variants that already exist. */
type VariantRow = {
  id?: string;
  name: string;
  sku: string;
  barcode: string;
  plu: string;
  attributes: Record<string, string> | null;
  salePrice: string;
  costPrice: string;
  minStock: string;
  isActive: boolean;
};

type AttributeGroup = { name: string; values: string[] };

type Props = {
  item?: ItemDetail;
  categories: ItemCategoryRow[];
  branchName: string;
  defaultVatRate: number;
  /** Groups to offer, and the ones already attached. Empty where the industry has no modifiers. */
  modifierGroups?: { id: string; name: string; minSelect: number; maxSelect: number; optionCount: number }[];
  attachedGroupIds?: string[];
  /**
   * What this branch's industry needs from an item, decided server-side from the capability
   * registry. A salon has no use for a barcode and a cafe has no use for a size matrix; showing
   * them anyway is a longer form for every shop so that one kind of shop is served.
   */
  scansCodes?: boolean;
  weighsGoods?: boolean;
  sellsVariants?: boolean;
  /**
   * The company's open branches, for pinning an item to one.
   *
   * Empty, or a single branch, and the field is not shown at all: "sold at our only shop" is
   * not a choice anybody should have to make.
   */
  branches?: { id: string; name: string }[];
};

function emptyVariant(name: string): VariantRow {
  return { name, sku: "", barcode: "", plu: "", attributes: null, salePrice: "", costPrice: "", minStock: "0", isActive: true };
}

/** Cartesian product of the attribute groups: Colour × Size → "Black / M". */
function buildMatrix(groups: AttributeGroup[]): { name: string; attributes: Record<string, string> }[] {
  const usable = groups.filter((g) => g.name.trim() && g.values.length > 0);
  if (usable.length === 0) return [];
  return usable.reduce<{ name: string; attributes: Record<string, string> }[]>(
    (rows, group) =>
      rows.flatMap((row) =>
        group.values.map((value) => ({
          name: row.name ? `${row.name} / ${value}` : value,
          attributes: { ...row.attributes, [group.name.trim()]: value },
        })),
      ),
    [{ name: "", attributes: {} }],
  );
}

export function ItemForm({
  item,
  categories,
  branchName,
  defaultVatRate,
  modifierGroups = [],
  attachedGroupIds = [],
  scansCodes = false,
  weighsGoods = false,
  sellsVariants = false,
  branches = [],
}: Props) {
  const router = useRouter();
  const isEdit = Boolean(item);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<{ message: string; details: string[] } | null>(null);

  const [kind, setKind] = useState<ItemKind>(item?.kind ?? "PRODUCT");
  const [name, setName] = useState(item?.name ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [itemBranchId, setItemBranchId] = useState(item?.branchId ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "pcs");
  const [salePrice, setSalePrice] = useState(item ? String(item.salePrice) : "");
  const [costPrice, setCostPrice] = useState(item ? String(item.costPrice) : "");
  const [vatRate, setVatRate] = useState(item?.vatRate === null || item?.vatRate === undefined ? "" : String(item.vatRate));
  const [trackStock, setTrackStock] = useState(item ? item.trackStock : true);
  const [durationMinutes, setDurationMinutes] = useState(item?.durationMinutes ? String(item.durationMinutes) : "");
  const [isActive, setIsActive] = useState(item ? item.isActive : true);
  const [openingStock, setOpeningStock] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>(attachedGroupIds);

  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageKey, setImageKey] = useState(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);

  // Variants: an item sold in one form keeps a single hidden row; "Add variants" reveals the matrix.
  const existingVariants: VariantRow[] = (item?.variants ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    sku: v.sku ?? "",
    barcode: v.barcode ?? "",
    plu: v.plu ?? "",
    attributes: v.attributes,
    salePrice: v.salePrice === null ? "" : String(v.salePrice),
    costPrice: v.costPrice === null ? "" : String(v.costPrice),
    minStock: String(v.minStock),
    isActive: v.isActive,
  }));
  const [variants, setVariants] = useState<VariantRow[]>(existingVariants.length > 0 ? existingVariants : [emptyVariant("")]);
  /**
   * The matrix is offered where the industry sells one thing in several forms — but an item that
   * already has variants keeps its editor whatever the branch now sells, because the alternative is
   * hiding data someone can no longer reach.
   */
  const showVariantsCard = sellsVariants || existingVariants.length > 1;
  const [hasVariants, setHasVariants] = useState(existingVariants.length > 1);
  const [groups, setGroups] = useState<AttributeGroup[]>(() => {
    // Rebuild the attribute groups from the saved variants so editing is not a fresh start.
    const map = new Map<string, Set<string>>();
    for (const variant of existingVariants) {
      for (const [key, value] of Object.entries(variant.attributes ?? {})) {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key)!.add(value);
      }
    }
    const built = [...map.entries()].map(([groupName, values]) => ({ name: groupName, values: [...values] }));
    return built.length > 0 ? built : [{ name: "", values: [] }];
  });
  const [valueDrafts, setValueDrafts] = useState<Record<number, string>>({});

  const isService = kind === "SERVICE";
  const currentImage = removeImage ? null : (preview ?? item?.imageUrl ?? null);

  function setGroupName(index: number, value: string) {
    setGroups((prev) => prev.map((g, i) => (i === index ? { ...g, name: value } : g)));
  }

  function addValue(index: number) {
    const draft = (valueDrafts[index] ?? "").trim();
    if (!draft) return;
    setGroups((prev) => prev.map((g, i) => (i === index && !g.values.includes(draft) ? { ...g, values: [...g.values, draft] } : g)));
    setValueDrafts((prev) => ({ ...prev, [index]: "" }));
  }

  function removeValue(index: number, value: string) {
    setGroups((prev) => prev.map((g, i) => (i === index ? { ...g, values: g.values.filter((v) => v !== value) } : g)));
  }

  /** Generates the rows, keeping ids, SKUs and prices of combinations that already exist. */
  function generateVariants() {
    const matrix = buildMatrix(groups);
    if (matrix.length === 0) {
      toast.error("Add at least one option value first.");
      return;
    }
    setVariants((prev) =>
      matrix.map((row) => {
        const match = prev.find((v) => v.name === row.name || JSON.stringify(v.attributes ?? {}) === JSON.stringify(row.attributes));
        return match ? { ...match, name: row.name, attributes: row.attributes } : { ...emptyVariant(row.name), attributes: row.attributes };
      }),
    );
    toast.success(`${matrix.length} ${matrix.length === 1 ? "variant" : "variants"} ready`);
  }

  function setVariantField(index: number, field: keyof VariantRow, value: string | boolean) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const rows = hasVariants ? variants : [{ ...variants[0], name: variants[0]?.name?.trim() || name.trim() || "Default", attributes: null }];
      const formData = new FormData();
      formData.set("kind", kind);
      formData.set("name", name);
      formData.set("code", code);
      formData.set("categoryId", categoryId);
      formData.set("branchId", itemBranchId);
      formData.set("brand", brand);
      formData.set("description", description);
      formData.set("unit", unit);
      formData.set("salePrice", salePrice || "0");
      formData.set("costPrice", costPrice || "0");
      formData.set("vatRate", vatRate);
      formData.set("trackStock", String(!isService && trackStock));
      formData.set("durationMinutes", isService ? durationMinutes : "");
      formData.set("isActive", String(isActive));
      formData.set(
        "variants",
        JSON.stringify(
          rows.map((v) => ({
            id: v.id,
            name: v.name,
            sku: v.sku,
            barcode: v.barcode,
            plu: v.plu,
            attributes: v.attributes,
            salePrice: v.salePrice,
            costPrice: v.costPrice,
            minStock: v.minStock || "0",
            reorderLevel: "0",
            isActive: v.isActive,
          })),
        ),
      );
      if (!isEdit && !isService && trackStock && openingStock) formData.set("openingStock", openingStock);
      if (image) formData.set("image", image);
      if (removeImage) formData.set("removeImage", "true");

      const result = item ? await updateItem(item.id, formData) : await createItem(formData);
      // Modifier groups are a separate relation, saved once the item itself exists.
      if (result.success && modifierGroups.length > 0) {
        const itemId = item ? item.id : (result as { data: { id: string } }).data.id;
        const linked = await setItemModifierGroups({ itemId, groupIds });
        if (!linked.success) {
          setFormError({ message: linked.error, details: [] });
          return;
        }
      }
      if (!result.success) {
        const details = Object.entries(result.fieldErrors ?? {}).flatMap(([field, messages]) => messages.map((m) => `${field}: ${m}`));
        setFormError({ message: result.error, details });
        return;
      }
      toast.success(item ? "Item saved" : "Item created");
      router.push("/pos/products");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription className="grid gap-1">
            <span>{formError.message}</span>
            {formError.details.length > 0 ? (
              <ul className="list-disc pl-4">
                {formError.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>What are you selling?</CardTitle>
          <CardDescription>A product is stocked and counted; a service is work you perform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { value: "PRODUCT" as ItemKind, label: "Product", hint: "Stocked, counted, barcoded", icon: Package },
                { value: "SERVICE" as ItemKind, label: "Service", hint: "Time and labour, no stock", icon: Wrench },
              ] satisfies { value: ItemKind; label: string; hint: string; icon: typeof Package }[]
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setKind(option.value)}
                aria-pressed={kind === option.value}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  kind === option.value ? "border-primary bg-sidebar-accent" : "hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    kind === option.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  <option.icon className="size-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Name" htmlFor="item-name" required className="sm:col-span-2">
              <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            </FormField>
            <FormField label="Item code" htmlFor="item-code" description="Your internal reference. Variants carry their own SKU.">
              <Input id="item-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
            </FormField>
            <FormField label="Category" htmlFor="item-category">
              <Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}>
                <SelectTrigger id="item-category" className="w-full">
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {branches.length > 1 ? (
              <FormField
                label="Sold at"
                htmlFor="item-branch"
                description="Which till offers this. Leave as every branch unless only one shop sells it."
              >
                <Select value={itemBranchId || "all"} onValueChange={(v) => setItemBranchId(v === "all" ? "" : v)}>
                  <SelectTrigger id="item-branch" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Every branch</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} only
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            ) : null}
            {!isService ? (
              <FormField label="Brand" htmlFor="item-brand">
                <Input id="item-brand" value={brand} onChange={(e) => setBrand(e.target.value)} autoComplete="off" />
              </FormField>
            ) : (
              <FormField label="Duration" htmlFor="item-duration" description="Minutes, for booked services.">
                <Input id="item-duration" type="number" inputMode="numeric" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
              </FormField>
            )}
            <FormField label="Unit" htmlFor="item-unit" description="How it is measured and sold.">
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger id="item-unit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Description" htmlFor="item-description" className="sm:col-span-2">
              <Textarea id="item-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </FormField>
          </div>

          <div className="flex items-center gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
              {currentImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentImage} alt="" className="size-full object-cover" />
              ) : (
                <Package className="size-6 text-muted-foreground" />
              )}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                key={imageKey}
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  setImage(e.target.files?.[0] ?? null);
                  setRemoveImage(false);
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => imageInputRef.current?.click()}>
                {currentImage ? "Change image" : "Add image"}
              </Button>
              {currentImage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setImage(null);
                    setRemoveImage(true);
                    setImageKey((k) => k + 1);
                  }}
                >
                  <X />
                  Remove
                </Button>
              ) : null}
              <p className="w-full text-xs text-muted-foreground">JPG, PNG or WEBP, up to 2 MB.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Price</CardTitle>
          <CardDescription>Variants can override these; leave a variant blank to inherit.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <FormField label="Selling price" htmlFor="item-price" required>
            <Input id="item-price" type="number" step="0.01" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          </FormField>
          <FormField label="Cost price" htmlFor="item-cost" description="Used for profit and stock value.">
            <Input id="item-cost" type="number" step="0.01" inputMode="decimal" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
          </FormField>
          <FormField label="VAT rate" htmlFor="item-vat" description={`Blank uses the company rate (${defaultVatRate}%).`}>
            <Input id="item-vat" type="number" step="0.01" inputMode="decimal" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
          </FormField>
        </CardContent>
      </Card>

      {!isService ? (
        <Card>
          <CardHeader>
            <CardTitle>Stock</CardTitle>
            <CardDescription>Quantities are held per branch. Opening stock is recorded as a movement you can trace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <SettingSwitchRow
              label="Track stock for this product"
              description="Turn off for made-to-order goods you never count."
              checked={trackStock}
              onCheckedChange={setTrackStock}
            />
            {!isEdit && trackStock ? (
              <FormField label={`Opening stock in ${branchName}`} htmlFor="item-opening" description="Optional. Add stock for other branches from the Stock screen.">
                <Input
                  id="item-opening"
                  type="number"
                  step="0.001"
                  inputMode="decimal"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value)}
                  className="max-w-40"
                />
              </FormField>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/**
       * Codes for an item sold in one form.
       *
       * These live on the variant, and until now they could only be reached through the variant
       * matrix — so a shop that scans could not put a barcode on a plain product without pretending
       * it had variants. Each field appears only where its capability does: the barcode where the
       * industry scans, the PLU where it weighs.
       */}
      {!hasVariants && (scansCodes || weighsGoods) ? (
        <Card>
          <CardHeader>
            <CardTitle>Codes</CardTitle>
            <CardDescription>
              {scansCodes && weighsGoods
                ? "What the scanner reads and what the scale prints."
                : scansCodes
                  ? "What the scanner reads at the till."
                  : "The short code the scale and the keypad use."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {scansCodes ? (
              <>
                <FormField label="Barcode" htmlFor="item-barcode" description="Scanned at the till. Must be unique.">
                  <Input
                    id="item-barcode"
                    value={variants[0]?.barcode ?? ""}
                    onChange={(e) => setVariantField(0, "barcode", e.target.value)}
                    autoComplete="off"
                    inputMode="numeric"
                  />
                </FormField>
                <FormField label="SKU" htmlFor="item-sku" description="Your stock-keeping code. Also matched at the till.">
                  <Input id="item-sku" value={variants[0]?.sku ?? ""} onChange={(e) => setVariantField(0, "sku", e.target.value)} autoComplete="off" />
                </FormField>
              </>
            ) : null}
            {weighsGoods ? (
              <FormField label="PLU" htmlFor="item-plu" description="The number keyed on the scale for this item.">
                <Input
                  id="item-plu"
                  value={variants[0]?.plu ?? ""}
                  onChange={(e) => setVariantField(0, "plu", e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </FormField>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showVariantsCard ? (
      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
          <CardDescription>
            For anything sold in more than one form — size, colour, pack. Each variant keeps its own SKU, barcode, price and stock.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <SettingSwitchRow
            label="This item has variants"
            description="Off means one form only, with the item's own price and stock."
            checked={hasVariants}
            onCheckedChange={(next) => {
              setHasVariants(next);
              if (!next) setVariants((prev) => [prev[0] ?? emptyVariant(name)]);
            }}
          />

          {hasVariants ? (
            <>
              <div className="space-y-3">
                {groups.map((group, index) => (
                  <div key={index} className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <FormField label="Option name" htmlFor={`group-${index}`} className="min-w-40 flex-1">
                        <Input
                          id={`group-${index}`}
                          placeholder="Colour"
                          value={group.name}
                          onChange={(e) => setGroupName(index, e.target.value)}
                          autoComplete="off"
                        />
                      </FormField>
                      <FormField label="Add value" htmlFor={`value-${index}`} className="min-w-40 flex-1">
                        <Input
                          id={`value-${index}`}
                          placeholder="Black"
                          value={valueDrafts[index] ?? ""}
                          onChange={(e) => setValueDrafts((prev) => ({ ...prev, [index]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addValue(index);
                            }
                          }}
                          autoComplete="off"
                        />
                      </FormField>
                      <Button type="button" variant="outline" onClick={() => addValue(index)}>
                        <Plus />
                        Add
                      </Button>
                      {groups.length > 1 ? (
                        <Button type="button" variant="ghost" size="icon" aria-label="Remove option" onClick={() => setGroups((prev) => prev.filter((_, i) => i !== index))}>
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                    {group.values.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {group.values.map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => removeValue(index, value)}
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/70"
                          >
                            {value}
                            <X className="size-3" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setGroups((prev) => [...prev, { name: "", values: [] }])}>
                    <Plus />
                    Another option
                  </Button>
                  <Button type="button" size="sm" onClick={generateVariants}>
                    Generate variants
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left font-medium">Variant</th>
                      <th className="p-2 text-left font-medium">SKU</th>
                      {/* Same capabilities as the Codes card, so the matrix asks for no more. */}
                      {scansCodes ? <th className="p-2 text-left font-medium">Barcode</th> : null}
                      {weighsGoods ? <th className="p-2 text-left font-medium">PLU</th> : null}
                      <th className="p-2 text-left font-medium">Price</th>
                      <th className="p-2 text-left font-medium">Cost</th>
                      <th className="p-2 text-left font-medium">Min stock</th>
                      <th className="w-10 p-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {variants.map((variant, index) => (
                      <tr key={variant.id ?? `${variant.name}-${index}`} className={variant.isActive ? undefined : "opacity-50"}>
                        <td className="p-2">
                          <Input value={variant.name} onChange={(e) => setVariantField(index, "name", e.target.value)} className="h-9 min-w-36" />
                        </td>
                        <td className="p-2">
                          <Input value={variant.sku} onChange={(e) => setVariantField(index, "sku", e.target.value)} className="h-9 min-w-28" />
                        </td>
                        {scansCodes ? (
                          <td className="p-2">
                            <Input value={variant.barcode} onChange={(e) => setVariantField(index, "barcode", e.target.value)} className="h-9 min-w-32" />
                          </td>
                        ) : null}
                        {weighsGoods ? (
                          <td className="p-2">
                            <Input
                              value={variant.plu}
                              onChange={(e) => setVariantField(index, "plu", e.target.value)}
                              inputMode="numeric"
                              className="h-9 w-20"
                            />
                          </td>
                        ) : null}
                        <td className="p-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder={salePrice || "0"}
                            value={variant.salePrice}
                            onChange={(e) => setVariantField(index, "salePrice", e.target.value)}
                            className="h-9 w-24"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder={costPrice || "0"}
                            value={variant.costPrice}
                            onChange={(e) => setVariantField(index, "costPrice", e.target.value)}
                            className="h-9 w-24"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            step="0.001"
                            value={variant.minStock}
                            onChange={(e) => setVariantField(index, "minStock", e.target.value)}
                            className="h-9 w-24"
                          />
                        </td>
                        <td className="p-2">
                          {variants.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Remove variant"
                              onClick={() => setVariants((prev) => prev.filter((_, i) => i !== index))}
                            >
                              <Trash2 />
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      {modifierGroups.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Questions at the till</CardTitle>
            <CardDescription>
              Pick the modifier groups this item should ask about — milk, size, extras. Manage the groups themselves under POS → Modifiers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {modifierGroups.map((group) => {
              const attached = groupIds.includes(group.id);
              return (
                <button
                  key={group.id}
                  type="button"
                  aria-pressed={attached}
                  onClick={() => setGroupIds((prev) => (attached ? prev.filter((id) => id !== group.id) : [...prev, group.id]))}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors",
                    attached ? "border-primary bg-sidebar-accent" : "hover:bg-muted/60",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{group.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {group.optionCount} options · {group.minSelect > 0 ? "required" : "optional"}
                      {group.maxSelect > 1 ? `, up to ${group.maxSelect}` : ", one"}
                    </span>
                  </span>
                  {attached ? <span className="shrink-0 text-xs font-medium text-sidebar-accent-foreground">Asked</span> : null}
                </button>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <SettingSwitchRow
            label="Active"
            description="Inactive items stay in reports and history but cannot be sold."
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline" disabled={saving}>
          <Link href="/pos/products">Cancel</Link>
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {item ? "Save changes" : "Create item"}
        </Button>
      </div>
    </form>
  );
}
