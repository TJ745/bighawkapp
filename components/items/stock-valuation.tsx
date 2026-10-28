"use client";

import { Boxes, Layers, Wallet } from "lucide-react";
import { StatCards } from "@/components/shared/stat-cards";
import type { StockValuation } from "@/lib/data/items";

/**
 * What is on the shelf, and what it is worth.
 *
 * At **cost**, because that is what the business has tied up and what an accountant asks for.
 * Counted across the whole branch rather than the page on screen, which is why it comes from its
 * own query.
 */
export function StockValuationCards({ valuation, branchName }: { valuation: StockValuation; branchName: string }) {
  return (
    <StatCards
      stats={[
        { label: "Stock at cost", value: valuation.value, icon: Wallet, tint: "green", hint: `What ${branchName} is holding` },
        { label: "Units on hand", value: valuation.units, as: "number", icon: Boxes, tint: "blue" },
        { label: "Lines in stock", value: valuation.lines, as: "number", icon: Layers, tint: "purple", hint: "Different things with something left" },
      ]}
    />
  );
}
