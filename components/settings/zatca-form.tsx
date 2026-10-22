"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingSwitchRow } from "@/components/settings/setting-switch-row";
import { updateZatcaSettings } from "@/actions/settings";
import { actionErrorLines } from "@/lib/action-error";
import type { ZatcaMode } from "@/lib/generated/prisma/enums";

/**
 * Settings → E-invoicing.
 *
 * Phase 1 is a switch rather than a wizard because nothing has to be arranged with ZATCA for it:
 * the fields, the Arabic and the QR code are all produced here. The one precondition is that the
 * company's own details are complete, which is why this screen lists what is missing and will not
 * let the switch move until the list is empty — a QR built from half-filled settings would scan
 * perfectly and state the wrong thing.
 */
export function ZatcaForm({ mode, problems, canEdit }: { mode: ZatcaMode; problems: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const ready = problems.length === 0;
  const active = mode !== "OFF";

  async function setMode(next: ZatcaMode) {
    setSaving(true);
    setErrors([]);
    try {
      const result = await updateZatcaSettings({ mode: next });
      if (!result.success) {
        setErrors(actionErrorLines(result));
        return;
      }
      toast.success(next === "OFF" ? "E-invoicing switched off" : "Phase 1 e-invoicing is on");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {errors.length > 0 ? (
        <Alert variant="destructive">
          <AlertDescription>
            {errors.length === 1 ? (
              errors[0]
            ) : (
              <ul className="list-inside list-disc">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Saudi e-invoicing (ZATCA)</CardTitle>
          <CardDescription>
            Phase 1 — &ldquo;Generation&rdquo;. Invoices and till receipts are issued with the fields a Saudi tax invoice must carry, in Arabic and
            English, with the TLV QR code a verifier scans. Everything is produced here; nothing is sent to ZATCA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <SettingSwitchRow
            label="Issue Saudi tax invoices"
            description="Adds the Arabic title and seller name, the required fields and the QR code to invoices, credit notes and receipts."
            checked={active}
            disabled={!canEdit || saving || (!ready && !active)}
            onCheckedChange={(value) => setMode(value ? "PHASE_1" : "OFF")}
          />

          {!ready ? (
            <Alert>
              <AlertDescription>
                <p className="font-medium">Settings → Company needs completing first:</p>
                <ul className="mt-1 list-inside list-disc">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/settings/company">Open company settings</Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : active ? (
            <Alert>
              <CheckCircle2 className="text-tint-green-foreground" />
              <AlertDescription>
                Invoices, credit notes and till receipts now carry the QR code. Scan one with ZATCA&apos;s verification app to read back the seller
                name, VAT number, timestamp and totals.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <CheckCircle2 className="text-tint-green-foreground" />
              <AlertDescription>The company&apos;s details are complete. Switch it on whenever you are ready.</AlertDescription>
            </Alert>
          )}
          {saving ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What is not built yet</CardTitle>
          <CardDescription>So nobody assumes more than the app does.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Phase 2 — &ldquo;Integration&rdquo;</span> is not implemented. That phase sends each
            invoice to ZATCA as signed UBL&nbsp;2.1 XML: business-to-business invoices are cleared before the buyer receives them, and till
            receipts are reported within 24 hours. It needs a certificate obtained from the Fatoora portal, an invoice hash chain, and a
            submission queue.
          </p>
          <p>
            Phase 1 turns this app into one that <span className="font-medium text-foreground">produces compliant tax invoices</span>. Whether a
            particular installation is compliant is settled by ZATCA&apos;s own checks against your certificate and your wave date — not by this
            screen.
          </p>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          Check your company&apos;s wave and obligations with ZATCA or your accountant.
        </CardFooter>
      </Card>
    </div>
  );
}
