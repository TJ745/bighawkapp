"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Loader2, LogIn, Plus, Power, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { actAsCompany, createCompany, renameCompany, setCompanyActive, stopActingAsCompany } from "@/actions/companies";
import { actionErrorLines } from "@/lib/action-error";
import type { ActionResult } from "@/lib/actions";
import type { CompanyRow } from "@/lib/data/companies";
import { cn } from "@/lib/utils";

/**
 * The customers this deployment serves.
 *
 * Only the BigHawk operator sees this, and it is the only screen in the app that looks across
 * companies. It is also where they land on every sign-in, because they belong to no company and
 * until they choose one, any figure the app showed them would be somebody's presented as if it
 * were theirs.
 *
 * Cards rather than a table: this is a screen for choosing, not for scanning a column, and each
 * card carries enough — seats and branches used against what was sold, how much trade, whether
 * it is switched on — to pick the right customer without opening anything.
 */
export function CompaniesManager({
  companies,
  actingId,
  baseDomain,
}: {
  companies: CompanyRow[];
  actingId: string | null;
  /** Set when subdomain routing is configured; null means this deployment serves one customer. */
  baseDomain: string | null;
}) {
  const router = useRouter();
  const format = useFormat();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const acting = companies.find((company) => company.id === actingId) ?? null;

  /**
   * Opens a company: chooses it, then goes to its dashboard.
   *
   * Choosing was never the task — working inside the company is — and leaving the operator on
   * this screen afterwards made them click twice to get anywhere. A company already open skips
   * the action and simply navigates.
   */
  async function openCompany(company: CompanyRow) {
    if (company.id === actingId) {
      router.push("/dashboard");
      return;
    }
    setBusy(company.id);
    try {
      const result = await actAsCompany({ companyId: company.id });
      if (!result.success) {
        toast.error(actionErrorLines(result).join(" "));
        return;
      }
      toast.success(`Working on ${company.name}`);
      router.push("/dashboard");
    } finally {
      setBusy(null);
    }
  }

  /** Runs one action, shows what happened, and keeps the buttons quiet while it is in flight. */
  async function run(id: string, work: () => Promise<ActionResult<unknown>>, done: string) {
    setBusy(id);
    try {
      const result = await work();
      if (!result.success) {
        toast.error(actionErrorLines(result).join(" "));
        return;
      }
      toast.success(done);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {acting ? (
        <Alert>
          <Building2 />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              You are working on <span className="font-medium text-foreground">{acting.name}</span>. Anything you change belongs to them.
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void run("stop", () => stopActingAsCompany(), "No longer working on a company")}
            >
              Leave
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Choose a company</h2>
          <p className="text-sm text-muted-foreground">
            Open one to work inside it. Everything you then see and change is theirs, and the bar at the top of every screen says so.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {baseDomain
            ? `Each company is reached at its own address — acme.${baseDomain} — and sees only its own data.`
            : "Every company's data is kept apart. Set TENANT_BASE_DOMAIN to give each one its own address."}
        </p>
        <Button type="button" onClick={() => setAddOpen(true)}>
          <Plus />
          Add a company
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {companies.map((company) => {
          const open = company.id === actingId;
          return (
            <Card key={company.id} className={cn("flex flex-col", open && "ring-2 ring-primary", !company.isActive && "opacity-70")}>
              <CardHeader className="gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{company.name}</CardTitle>
                  {open ? <StatusBadge tone="info">Open</StatusBadge> : null}
                  {!company.isActive ? <StatusBadge tone="neutral">Off</StatusBadge> : null}
                </div>
                <CardDescription className="truncate">{baseDomain ? `${company.slug}.${baseDomain}` : company.slug}</CardDescription>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col gap-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Figure label="Users" value={<Usage used={company.users} limit={company.userLimit} />} />
                  <Figure label="Branches" value={<Usage used={company.branches} limit={company.branchLimit} />} />
                  <Figure label="Invoices" value={<span className="tabular-nums">{company.invoices}</span>} />
                  <Figure label="Till sales" value={<span className="tabular-nums">{company.posSales}</span>} />
                </dl>
                <p className="text-xs text-muted-foreground">Customer since {format.date(company.createdAt)}</p>

                <div className="mt-auto flex items-center gap-2 pt-1">
                  {company.isActive ? (
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1"
                      variant={open ? "outline" : "default"}
                      disabled={busy !== null}
                      onClick={() => void openCompany(company)}
                    >
                      {busy === company.id ? <Loader2 className="animate-spin" /> : open ? <Check /> : <LogIn />}
                      {open ? "Go to it" : "Open"}
                    </Button>
                  ) : (
                    <span className="flex-1 text-xs text-muted-foreground">Switched off — nobody here can sign in.</span>
                  )}
                  <Button type="button" size="sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(company)} disabled={busy !== null}>
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={company.isActive ? "Switch off" : "Switch on"}
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        company.id,
                        () => setCompanyActive(company.id, !company.isActive),
                        `${company.name} switched ${company.isActive ? "off" : "on"}`,
                      )
                    }
                  >
                    <Power />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <CompanyDialog
        open={addOpen || editing !== null}
        company={editing}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function CompanyDialog({ open, company, onClose }: { open: boolean; company: CompanyRow | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [userLimit, setUserLimit] = useState("5");
  const [branchLimit, setBranchLimit] = useState("5");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [touchedSlug, setTouchedSlug] = useState(false);

  // Re-seed the fields whenever a different company is opened.
  const key = company?.id ?? "new";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setName(company?.name ?? "");
    setSlug(company?.slug ?? "");
    setUserLimit(String(company?.userLimit ?? 5));
    setBranchLimit(String(company?.branchLimit ?? 5));
    setAdminName("");
    setAdminEmail("");
    setAdminPassword("");
    setTouchedSlug(Boolean(company));
    setProblems([]);
  }

  async function submit() {
    setSaving(true);
    setProblems([]);
    try {
      const result = company
        ? await renameCompany(company.id, { name, slug, userLimit, branchLimit })
        : await createCompany({ name, slug, userLimit, branchLimit, adminName, adminEmail, adminPassword });
      if (!result.success) {
        setProblems(actionErrorLines(result));
        return;
      }
      toast.success(company ? `${name} saved` : `${name} created — ${adminEmail} can sign in now`);
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => (value ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{company ? `Edit ${company.name}` : "Add a company"}</DialogTitle>
          <DialogDescription>
            {company
              ? "The handle is part of this company's address, so changing it changes where their people sign in."
              : "A new customer, with the roles, modules and first branch every company starts with — and the one person who runs it."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {problems.length > 0 ? (
            <Alert variant="destructive">
              <AlertDescription>
                {problems.length === 1 ? (
                  problems[0]
                ) : (
                  <ul className="list-inside list-disc">
                    {problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          ) : null}
          <FormField label="Name" htmlFor="company-name" required>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                // A handle most people never need to think about, until they want to.
                if (!touchedSlug) setSlug(suggestSlug(e.target.value));
              }}
              autoComplete="off"
            />
          </FormField>
          <FormField label="Handle" htmlFor="company-slug" required description="Letters, numbers and hyphens. Used in their address and in support.">
            <Input
              id="company-slug"
              value={slug}
              onChange={(e) => {
                setTouchedSlug(true);
                setSlug(e.target.value);
              }}
              autoComplete="off"
            />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Users included" htmlFor="company-user-limit" required description="The administrator counts as one of them.">
              <Input id="company-user-limit" type="number" min={1} value={userLimit} onChange={(e) => setUserLimit(e.target.value)} />
            </FormField>
            <FormField label="Branches included" htmlFor="company-branch-limit" required description="The main branch counts as one of them.">
              <Input id="company-branch-limit" type="number" min={1} value={branchLimit} onChange={(e) => setBranchLimit(e.target.value)} />
            </FormField>
          </div>
          {company ? (
            <p className="text-xs text-muted-foreground">
              Lowering a limit below what they are already using switches nothing off — it only stops them adding more.
            </p>
          ) : (
            <div className="space-y-5 rounded-lg border border-dashed p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Their administrator</p>
                <p className="text-xs text-muted-foreground">
                  The one account that can sign in to this company. Pass the password on yourself — they change it from their profile. An email
                  address can only belong to one account across the whole platform.
                </p>
              </div>
              <FormField label="Name" htmlFor="company-admin-name" required>
                <Input id="company-admin-name" value={adminName} onChange={(e) => setAdminName(e.target.value)} autoComplete="off" />
              </FormField>
              <FormField label="Email" htmlFor="company-admin-email" required>
                <Input
                  id="company-admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  autoComplete="off"
                />
              </FormField>
              <FormField label="Password" htmlFor="company-admin-password" required description="At least 8 characters, including a number.">
                <Input
                  id="company-admin-password"
                  type="text"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  autoComplete="off"
                />
              </FormField>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={saving || !name.trim() || !slug.trim() || (!company && (!adminName.trim() || !adminEmail.trim() || !adminPassword))}
          >
            {saving ? <Loader2 className="animate-spin" /> : null}
            {company ? "Save" : "Create it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One labelled figure on a company card. */
function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/**
 * What they are using against what they bought.
 *
 * Marked when it is full, because that is the moment the customer calls — and the moment the
 * operator needs to see without opening anything.
 */
function Usage({ used, limit }: { used: number; limit: number }) {
  return (
    <span className={used >= limit ? "font-medium text-amber-600 dark:text-amber-500" : undefined}>
      {used} / {limit}
    </span>
  );
}

function suggestSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}
