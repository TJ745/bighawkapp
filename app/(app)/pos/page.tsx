import type { Metadata } from "next";
import Link from "next/link";
import { Check, MapPin, Settings2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireModule } from "@/lib/auth/session";
import { getCurrentBranch, listActiveBranches } from "@/lib/data/platform";
import { posTodaySummary } from "@/lib/data/pos";
import { today } from "@/lib/data/sales";
import { CAPABILITY_LABELS, posTypeHasCapability, posTypeInfo } from "@/lib/platform/pos-types";
import { getFormatters } from "@/lib/settings/formatters";

export const metadata: Metadata = { title: "Point of Sale" };

/**
 * Where a branch's POS day stands, and how it is configured.
 *
 * The figures are today's at the branch in use; the lines that appear follow the branch's
 * industry, so a salon is never told about kitchen tickets and a cafe is never asked about rooms.
 */
export default async function PosPage() {
  // Module first, then permission: the chain refuses before anything is read.
  const auth = await requireModule("POS", "POS", "view");
  const [branch, branches, todayDate, format] = await Promise.all([getCurrentBranch(), listActiveBranches(), today(), getFormatters()]);
  const config = branch?.posConfig ?? null;
  const info = config ? posTypeInfo(config.businessType) : null;
  const summary = branch ? await posTodaySummary(branch.id, todayDate) : null;
  const type = config?.businessType ?? "RETAIL";
  const has = (capability: Parameters<typeof posTypeHasCapability>[1]) => posTypeHasCapability(type, capability);

  /** Only what this branch actually does, so the page never reports on features it does not have. */
  const openWork = [
    ...(has("TABLES") ? [{ label: "Tables with an open bill", value: summary?.openTables ?? 0, href: "/pos/tables" }] : []),
    ...(has("TABS") ? [{ label: "Open tabs", value: summary?.openTabs ?? 0, href: "/pos/tabs" }] : []),
    ...(has("KITCHEN") ? [{ label: "In the kitchen", value: summary?.kitchenTickets ?? 0, href: "/pos/kitchen" }] : []),
    ...(has("APPOINTMENTS") ? [{ label: "Booked today", value: summary?.bookingsToday ?? 0, href: "/pos/appointments" }] : []),
    ...(has("WORK_ORDERS") ? [{ label: "Jobs in the workshop", value: summary?.openJobs ?? 0, href: "/pos/work-orders" }] : []),
    ...(has("ROOMS") ? [{ label: "Guests checked in", value: summary?.guestsIn ?? 0, href: "/pos/rooms" }] : []),
    ...(has("RENTALS") ? [{ label: "Out on rental", value: summary?.rentalsOut ?? 0, href: "/pos/rentals" }] : []),
    ...((summary?.heldSales ?? 0) > 0 ? [{ label: "Held sales", value: summary?.heldSales ?? 0, href: "/pos/register" }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Point of Sale"
        description={branch ? `Today at ${branch.name}.` : "No branch available yet."}
        actions={
          <div className="flex flex-wrap gap-2">
            {auth.can("POS", "create") ? (
              <Button asChild>
                <Link href="/pos/register">Open the register</Link>
              </Button>
            ) : null}
            {auth.user.isSuperAdmin ? (
              <Button asChild variant="outline">
                <Link href="/settings/modules">
                  <Settings2 />
                  POS settings
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      {!config ? (
        <Alert>
          <AlertDescription>
            This branch has no POS industry yet.{" "}
            {auth.user.isSuperAdmin ? (
              <>
                Choose one in <Link href="/settings/modules">Settings → Modules</Link>.
              </>
            ) : (
              "Ask your BigHawk administrator to configure it."
            )}
          </AlertDescription>
        </Alert>
      ) : !config.isActive ? (
        <Alert>
          <AlertDescription>POS is switched off for this branch. Other branches can still sell.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Today</CardTitle>
            <CardDescription>Takings at this branch for {format.date(todayDate)}, and what is still open.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Figure label="Taken" value={format.money(summary?.takings ?? 0)} hint={`${summary?.saleCount ?? 0} ${summary?.saleCount === 1 ? "sale" : "sales"}`} />
              <Figure label="Refunded" value={summary?.refunds ? `− ${format.money(summary.refunds)}` : "—"} hint="Given back today" />
              <Figure label="Kept" value={format.money(summary?.netTakings ?? 0)} hint="Takings less refunds" />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Still open</p>
              {openWork.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing is waiting — no held bills or unfinished work at this branch.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {openWork.map((row) => (
                    <li key={row.label} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                      <Link href={row.href} className="truncate hover:underline">
                        {row.label}
                      </Link>
                      <span className="font-medium tabular-nums">{row.value}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1 border-t pt-4 text-sm">
              {summary?.openShift ? (
                <p>
                  <span className="font-medium">{summary.openShift.register}</span> is open — {summary.openShift.by} since{" "}
                  {format.dateTime(summary.openShift.since)}. <Link href="/pos/shifts" className="hover:underline">Shifts</Link>
                </p>
              ) : (
                <p className="text-muted-foreground">
                  No shift is open. Sales still work, but they will not be tied to a drawer.{" "}
                  <Link href="/pos/register" className="hover:underline">
                    Open one at the register
                  </Link>
                  .
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This branch</CardTitle>
            <CardDescription>Registers, shifts and sales are recorded against the branch you are working in.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tint-blue text-tint-blue-foreground">
                <MapPin className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">{branch?.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {branch?.code}
                  {branch?.city ? ` · ${branch.city}` : ""}
                </p>
              </div>
              {info ? <StatusBadge tone={config?.isActive ? "success" : "neutral"}>{info.label}</StatusBadge> : null}
            </div>

            {info ? (
              <div className="space-y-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What this industry adds</p>
                {info.capabilities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">The common POS engine only — selling, payments, receipts, shifts and returns.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {info.capabilities.map((capability) => (
                      <li key={capability} className="flex items-center gap-2 text-sm">
                        <Check className="size-4 shrink-0 text-tint-green-foreground" />
                        {CAPABILITY_LABELS[capability]}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {branches.length > 1 ? (
              <p className="text-xs text-muted-foreground">
                {branches.length} active branches. Switch branch from the header to see its POS day.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
