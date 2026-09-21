"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DATE_PRESETS, detectPreset, presetRange, type DatePreset } from "@/lib/date-range";
import { useUrlFilters } from "./use-url-filters";

// Writes ?from=&to= to the URL. Used by Finance and the Dashboard.
export function DateRangeFilter({ today, defaultPreset = "all" }: { today: string; defaultPreset?: DatePreset }) {
  const { get, set } = useUrlFilters();
  const from = get("from");
  const to = get("to");
  const hasParams = Boolean(from || to) || get("range") === "all";
  const preset = hasParams ? detectPreset(from, to, today) : defaultPreset;

  function choose(value: DatePreset) {
    if (value === "custom") {
      const month = presetRange("this-month", today);
      set({ from: from || month.from, to: to || month.to, range: null });
      return;
    }
    const r = presetRange(value, today);
    // "all" must be remembered explicitly when the page defaults to another preset.
    set({ from: r.from, to: r.to, range: value === "all" && defaultPreset !== "all" ? "all" : null });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={(v) => choose(v as DatePreset)}>
        <SelectTrigger className="w-40" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATE_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {preset === "custom" ? (
        <>
          <Input type="date" aria-label="From" value={from} onChange={(e) => set({ from: e.target.value })} className="w-40" />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="date" aria-label="To" value={to} onChange={(e) => set({ to: e.target.value })} className="w-40" />
        </>
      ) : null}
    </div>
  );
}
