"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, MapPin, Store } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { SettingSwitchRow } from "@/components/settings/setting-switch-row";
import { savePosConfiguration, setModuleEnabled } from "@/actions/platform";
import type { AppModule, PosBusinessType, ScaleBarcodeMode } from "@/lib/generated/prisma/enums";
import { describeScaleLayout } from "@/lib/business/scale-barcode";
import { APP_MODULES } from "@/lib/platform/modules";
import { CAPABILITY_LABELS, POS_BUSINESS_TYPES, POS_INDUSTRY_GROUPS, posTypeInfo } from "@/lib/platform/pos-types";

export type ModuleBranch = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  isDefault: boolean;
  pos: {
    businessType: PosBusinessType;
    isActive: boolean;
    receiptHeader: string;
    receiptFooter: string;
    scaleBarcodeEnabled: boolean;
    scaleBarcodePrefix: string;
    scaleCodeDigits: number;
    scaleBarcodeMode: ScaleBarcodeMode;
  } | null;
};

type Props = { enabled: Record<AppModule, boolean>; branches: ModuleBranch[] };

export function ModulesForm({ enabled, branches }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOff, setConfirmOff] = useState<AppModule | null>(null);

  function apply(module: AppModule, next: boolean) {
    startTransition(async () => {
      const result = await setModuleEnabled({ module, enabled: next });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(next ? "Module enabled" : "Module disabled");
      router.refresh();
    });
  }

  function toggle(module: AppModule, next: boolean) {
    // Switching a module off removes whole sections of the app, so it is confirmed first.
    if (!next) {
      setConfirmOff(module);
      return;
    }
    apply(module, true);
  }

  const confirmModule = APP_MODULES.find((m) => m.value === confirmOff);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Modules</CardTitle>
          <CardDescription>
            What this company has access to. A disabled module disappears from the navigation and its pages and actions are refused server-side.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {APP_MODULES.map((module) => (
            <div key={module.value} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{module.label}</h3>
                    <StatusBadge tone={enabled[module.value] ? "success" : "neutral"}>{enabled[module.value] ? "Enabled" : "Disabled"}</StatusBadge>
                  </div>
                  <p className="text-sm text-muted-foreground">{module.description}</p>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                    {module.includes.map((item) => (
                      <li key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Check className="size-3 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <Switch
                  aria-label={`${module.label} enabled`}
                  checked={enabled[module.value]}
                  disabled={pending}
                  onCheckedChange={(v) => toggle(module.value, v)}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {enabled.POS ? (
        <Card>
          <CardHeader>
            <CardTitle>POS industry per branch</CardTitle>
            <CardDescription>
              Each branch runs one industry, and that decides which POS features exist there. A company can run a restaurant in one branch and a grocery in another.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {branches.length === 0 ? (
              <Alert>
                <AlertDescription>
                  No branches yet. <Link href="/settings/branches">Add a branch</Link> to configure POS.
                </AlertDescription>
              </Alert>
            ) : (
              branches.map((branch) => <BranchPosCard key={branch.id} branch={branch} disabled={pending} />)
            )}
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmOff)}
        onOpenChange={(open) => !open && setConfirmOff(null)}
        title={`Disable ${confirmModule?.label}?`}
        description={`${confirmModule?.label} disappears for every user in this company and its pages stop working. Existing data is kept and comes back if you enable it again.`}
        confirmLabel="Disable"
        destructive
        onConfirm={async () => {
          if (confirmOff) apply(confirmOff, false);
        }}
      />
    </div>
  );
}

function BranchPosCard({ branch, disabled }: { branch: ModuleBranch; disabled: boolean }) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [businessType, setBusinessType] = useState<PosBusinessType>(branch.pos?.businessType ?? "RETAIL");
  const [isActive, setIsActive] = useState(branch.pos?.isActive ?? true);
  const [receiptHeader, setReceiptHeader] = useState(branch.pos?.receiptHeader ?? "");
  const [receiptFooter, setReceiptFooter] = useState(branch.pos?.receiptFooter ?? "");
  const [scaleEnabled, setScaleEnabled] = useState(branch.pos?.scaleBarcodeEnabled ?? false);
  const [scalePrefix, setScalePrefix] = useState(branch.pos?.scaleBarcodePrefix ?? "2");
  const [scaleDigits, setScaleDigits] = useState(String(branch.pos?.scaleCodeDigits ?? 6));
  const [scaleMode, setScaleMode] = useState<ScaleBarcodeMode>(branch.pos?.scaleBarcodeMode ?? "WEIGHT");
  const info = posTypeInfo(businessType);
  // The question only makes sense where the industry weighs things.
  const weighs = info.capabilities.includes("WEIGHT");
  const layout = describeScaleLayout({ enabled: scaleEnabled, prefix: scalePrefix, codeDigits: Number(scaleDigits) || 6, mode: scaleMode });

  function save() {
    startSaving(async () => {
      const result = await savePosConfiguration({
        branchId: branch.id,
        businessType,
        isActive,
        receiptHeader,
        receiptFooter,
        scaleBarcodeEnabled: weighs && scaleEnabled,
        scaleBarcodePrefix: scalePrefix || "2",
        scaleCodeDigits: scaleDigits || "5",
        scaleBarcodeMode: scaleMode,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${branch.name} POS saved`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-tint-blue text-tint-blue-foreground">
            <MapPin className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium">{branch.name}</p>
            <p className="text-xs text-muted-foreground">{branch.code}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!branch.isActive ? <StatusBadge tone="neutral">Branch inactive</StatusBadge> : null}
          {branch.pos ? null : <StatusBadge tone="warning">Not configured</StatusBadge>}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Industry" htmlFor={`pos-type-${branch.id}`} required description={info.description}>
          <Select value={businessType} onValueChange={(v) => setBusinessType(v as PosBusinessType)} disabled={disabled || saving}>
            <SelectTrigger id={`pos-type-${branch.id}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POS_INDUSTRY_GROUPS.map((group) => {
                const types = POS_BUSINESS_TYPES.filter((t) => t.group === group);
                if (types.length === 0) return null;
                return (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {types.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Receipt header" htmlFor={`pos-head-${branch.id}`} description="Printed above the items on this branch's receipts.">
          <Input id={`pos-head-${branch.id}`} value={receiptHeader} onChange={(e) => setReceiptHeader(e.target.value)} disabled={disabled || saving} />
        </FormField>
        <FormField label="Receipt footer" htmlFor={`pos-foot-${branch.id}`} description="Thank-you line, return policy, VAT note." className="sm:col-span-2">
          <Input id={`pos-foot-${branch.id}`} value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} disabled={disabled || saving} />
        </FormField>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Features this industry unlocks</p>
        {info.capabilities.length === 0 ? (
          <p className="text-sm text-muted-foreground">The common POS engine only — selling, payments, receipts, shifts.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {info.capabilities.map((capability) => (
              <span key={capability} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {CAPABILITY_LABELS[capability]}
              </span>
            ))}
          </div>
        )}
      </div>

      {weighs ? (
        <div className="space-y-4 rounded-lg border p-3">
          <SettingSwitchRow
            label="Scanning scale labels"
            description="A shop scale prints a barcode carrying the item's PLU and its weight or price."
            checked={scaleEnabled}
            disabled={disabled || saving}
            onCheckedChange={setScaleEnabled}
          />
          {scaleEnabled ? (
            <>
              <div className="grid gap-5 sm:grid-cols-3">
                <FormField label="Label prefix" htmlFor={`scale-prefix-${branch.id}`} required description="Digits that mark a scale label.">
                  <Input id={`scale-prefix-${branch.id}`} value={scalePrefix} onChange={(e) => setScalePrefix(e.target.value)} inputMode="numeric" />
                </FormField>
                <FormField label="PLU digits" htmlFor={`scale-digits-${branch.id}`} required description="How many digits identify the item.">
                  <Input id={`scale-digits-${branch.id}`} value={scaleDigits} onChange={(e) => setScaleDigits(e.target.value)} inputMode="numeric" />
                </FormField>
                <FormField label="The last 5 digits are" htmlFor={`scale-mode-${branch.id}`} required>
                  <Select value={scaleMode} onValueChange={(v) => setScaleMode(v as ScaleBarcodeMode)} disabled={disabled || saving}>
                    <SelectTrigger id={`scale-mode-${branch.id}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WEIGHT">A weight (1.250)</SelectItem>
                      <SelectItem value="PRICE">A price (12.50)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
              <p className="text-xs text-muted-foreground">
                A label like <span className="font-mono">{layout.example}</span> means PLU <span className="font-mono">{layout.plu}</span> and {layout.meaning}. Your
                scale should print <strong>{layout.expectedLength}</strong> digits ({layout.withoutCheck} without a check digit) — adjust the PLU digits until that
                matches. Give each loose item its PLU on the product form.
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      <SettingSwitchRow
        label="POS active at this branch"
        description="Turn off to keep the branch without POS while other branches keep selling."
        checked={isActive}
        disabled={disabled || saving}
        onCheckedChange={setIsActive}
      />

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={disabled || saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Store />}
          Save POS settings
        </Button>
      </div>
    </div>
  );
}
