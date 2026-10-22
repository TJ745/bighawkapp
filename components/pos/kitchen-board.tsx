"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChefHat, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { moveTicket } from "@/actions/kitchen";
import { KITCHEN_STATUS_LABELS } from "@/lib/validation/kitchen";
import { cn } from "@/lib/utils";

export type KitchenCard = {
  id: string;
  round: number;
  status: keyof typeof KITCHEN_STATUS_LABELS;
  note: string | null;
  orderNote: string | null;
  saleNumber: string;
  /** Quick service: the number the counter calls out, shown instead of the table name. */
  orderNumber: number | null;
  tableName: string | null;
  customerName: string | null;
  guestCount: number | null;
  billChanged: boolean;
  /** Minutes since it was sent, worked out server-side so every cook sees the same number. */
  waitingMinutes: number;
  items: { id: string; name: string; quantity: number; unit: string; options: string | null }[];
};

type Column = { status: KitchenCard["status"]; title: string; next: KitchenCard["status"] | null; nextLabel: string };

const COLUMNS: Column[] = [
  { status: "NEW", title: "New", next: "PREPARING", nextLabel: "Start cooking" },
  { status: "PREPARING", title: "Preparing", next: "READY", nextLabel: "Ready" },
  { status: "READY", title: "Ready to serve", next: "SERVED", nextLabel: "Served" },
];

/**
 * The kitchen display: three columns a cook works left to right, refreshed on its own so a screen
 * on the wall stays current without anyone touching it.
 */
export function KitchenBoard({ tickets, canCook, served }: { tickets: KitchenCard[]; canCook: boolean; served: KitchenCard[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(timer);
  }, [router]);

  async function move(ticket: KitchenCard, status: KitchenCard["status"]) {
    setBusy(ticket.id);
    try {
      const result = await moveTicket({ ticketId: ticket.id, status });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (tickets.length === 0 && served.length === 0) {
    return <EmptyState icon={ChefHat} title="Nothing in the kitchen" description="Tickets appear here the moment an order is sent through." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const inColumn = tickets.filter((ticket) => ticket.status === column.status);
          return (
            <section key={column.status} className="space-y-3">
              <h2 className="flex items-center justify-between text-sm font-medium tracking-wide text-muted-foreground uppercase">
                {column.title}
                <span className="tabular-nums">{inColumn.length}</span>
              </h2>
              {inColumn.length === 0 ? (
                <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">Nothing here</p>
              ) : (
                inColumn.map((ticket) => (
                  <Card
                    key={ticket.id}
                    className={cn(
                      "overflow-hidden",
                      ticket.waitingMinutes >= 20 && ticket.status !== "READY" && "border-tint-red-foreground/40",
                      ticket.status === "READY" && "border-tint-green-foreground/40",
                    )}
                  >
                    <CardContent className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold">
                            {ticket.tableName ?? (ticket.orderNumber ? `Order ${ticket.orderNumber}` : null) ?? ticket.customerName ?? "Counter"}
                            {ticket.round > 1 ? ` · round ${ticket.round}` : ""}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {ticket.saleNumber}
                            {ticket.guestCount ? ` · ${ticket.guestCount} guests` : ""}
                          </p>
                        </div>
                        <StatusBadge tone={ticket.waitingMinutes >= 20 && ticket.status !== "READY" ? "danger" : "neutral"}>
                          <Clock className="size-3" />
                          {ticket.waitingMinutes}m
                        </StatusBadge>
                      </div>

                      <ul className="space-y-1.5">
                        {ticket.items.map((item) => (
                          <li key={item.id} className="flex items-start gap-2 text-sm">
                            <span className="min-w-8 shrink-0 font-semibold tabular-nums">{item.quantity}×</span>
                            <span className="min-w-0">
                              <span className="block font-medium">{item.name}</span>
                              {item.options ? <span className="block text-xs text-muted-foreground">{item.options}</span> : null}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {ticket.note || ticket.orderNote ? (
                        <p className="rounded-md bg-muted px-2 py-1.5 text-xs">{ticket.note ?? ticket.orderNote}</p>
                      ) : null}

                      {ticket.billChanged ? (
                        <p className="flex items-center gap-1.5 text-xs font-medium text-tint-amber-foreground">
                          <AlertTriangle className="size-3.5" />
                          The bill changed after this was sent — check with the floor.
                        </p>
                      ) : null}

                      {canCook ? (
                        <div className="flex gap-2">
                          {column.next ? (
                            <Button className="flex-1" disabled={busy === ticket.id} onClick={() => move(ticket, column.next!)}>
                              {busy === ticket.id ? <Loader2 className="animate-spin" /> : null}
                              {column.nextLabel}
                            </Button>
                          ) : null}
                          <Button variant="ghost" disabled={busy === ticket.id} onClick={() => move(ticket, "CANCELLED")}>
                            Cancel
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))
              )}
            </section>
          );
        })}
      </div>

      {served.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Just left the kitchen</h2>
          <div className="flex flex-wrap gap-2">
            {served.map((ticket) => (
              <span key={ticket.id} className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground">
                {ticket.tableName ?? ticket.customerName ?? "Counter"} · {ticket.saleNumber}
                {ticket.round > 1 ? ` · round ${ticket.round}` : ""} · {KITCHEN_STATUS_LABELS[ticket.status].label}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
