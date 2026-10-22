"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { switchBranch } from "@/actions/platform";
import { DEFAULT_COMPANY_ICON } from "./nav-config";

export type BranchOption = { id: string; name: string; code: string };

type Props = {
  branding: { companyName: string; logoUrl: string | null };
  /** Active branches, or empty when POS is off. */
  branches: BranchOption[];
  currentBranchId: string | null;
  onNavigate?: () => void;
};

/**
 * The company block at the top of the sidebar, and the branch the user is working in.
 *
 * Branches belong to a company, so they are chosen from here. A business with one branch (or with
 * POS switched off) has nothing to choose, so the block stays a plain link to the dashboard rather
 * than opening a menu with one item in it.
 */
export function CompanyMenu({ branding, branches, currentBranchId, onNavigate }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = branches.find((branch) => branch.id === currentBranchId) ?? null;
  const switchable = branches.length > 1;

  function choose(id: string) {
    if (id === currentBranchId) return;
    startTransition(async () => {
      const result = await switchBranch(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onNavigate?.();
      router.refresh();
    });
  }

  if (!switchable) {
    return (
      <Link href="/dashboard" onClick={onNavigate} className={BLOCK_CLASSES}>
        <Mark branding={branding} />
        <Caption companyName={branding.companyName} line={current?.name ?? "Business Management"} />
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className={BLOCK_CLASSES}
        aria-label={`${branding.companyName}${current ? `, working in ${current.name}` : ""}. Change branch`}
      >
        <Mark branding={branding} />
        <Caption companyName={branding.companyName} line={current?.name ?? "Choose a branch"} />
        <ChevronDown className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="truncate">{branding.companyName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Working in</DropdownMenuLabel>
        {branches.map((branch) => (
          <DropdownMenuItem key={branch.id} onSelect={() => choose(branch.id)} className="gap-2">
            <MapPin className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{branch.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{branch.code}</span>
            </span>
            {branch.id === currentBranchId ? <Check className="size-4 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard" onClick={onNavigate}>
            Dashboard
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const BLOCK_CLASSES =
  "flex w-full items-center gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-muted group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0";

/** A quiet mark, never a coloured wash behind an uploaded logo. */
function Mark({ branding }: { branding: { companyName: string; logoUrl: string | null } }) {
  const CompanyIcon = DEFAULT_COMPANY_ICON;
  if (branding.logoUrl) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-card p-1 group-data-[collapsible=icon]:size-8">
        {/* Plain <img>: the file route needs the session cookie, which the image optimizer would not send. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={branding.logoUrl} alt="" className="size-full object-contain" />
      </span>
    );
  }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground group-data-[collapsible=icon]:size-8">
      <CompanyIcon className="size-[18px]" />
    </span>
  );
}

function Caption({ companyName, line }: { companyName: string; line: string }) {
  return (
    <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
      <span className="truncate text-sm font-semibold tracking-tight">{companyName}</span>
      <span className="truncate text-xs text-muted-foreground">{line}</span>
    </span>
  );
}
