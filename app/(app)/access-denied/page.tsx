import type { Metadata } from "next";
import Link from "next/link";
import { PackageX, ShieldX, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = { title: "Access denied" };

// Why the door was closed: a module the company does not have, a feature the branch's industry
// does not include, or a permission the user was not granted. Each needs a different answer.
const REASONS = {
  module: {
    icon: PackageX,
    title: "This module is not enabled",
    description: "Your company does not have this part of BigHawk switched on. Ask your BigHawk administrator about enabling it.",
  },
  capability: {
    icon: SlidersHorizontal,
    title: "Not available for this branch",
    description: "This feature belongs to a different POS industry than the one this branch is configured for.",
  },
  permission: {
    icon: ShieldX,
    title: "You don't have access to this page",
    description: "Ask your administrator if you need this permission.",
  },
} as const;

export default async function AccessDeniedPage({ searchParams }: PageProps<"/access-denied">) {
  const { reason } = await searchParams;
  const key = typeof reason === "string" && reason in REASONS ? (reason as keyof typeof REASONS) : "permission";
  const { icon, title, description } = REASONS[key];

  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      }
    />
  );
}
