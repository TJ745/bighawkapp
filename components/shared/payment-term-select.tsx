"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAYMENT_TERM_OPTIONS } from "@/lib/settings/defaults";

const CUSTOM = "custom";

type Props = {
  id?: string;
  value: number;
  disabled?: boolean;
  onChange: (days: number) => void;
};

// Preset payment terms (due immediately, 7/15/30/60 days) plus a custom number of days.
// Reused by Settings, invoices and purchases.
export function PaymentTermSelect({ id, value, disabled, onChange }: Props) {
  const isPreset = PAYMENT_TERM_OPTIONS.some((o) => o.value === value);
  const [custom, setCustom] = useState(!isPreset);
  const selected = custom ? CUSTOM : String(value);

  return (
    <div className="flex gap-2">
      <Select
        value={selected}
        disabled={disabled}
        onValueChange={(v) => {
          if (v === CUSTOM) {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(Number(v));
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAYMENT_TERM_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={String(o.value)}>
              {o.label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Custom…</SelectItem>
        </SelectContent>
      </Select>
      {custom ? (
        <Input
          type="number"
          min={0}
          max={365}
          aria-label="Custom number of days"
          className="w-24"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
      ) : null}
    </div>
  );
}
