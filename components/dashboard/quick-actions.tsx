import Link from "next/link";
import { Plus, Receipt, UserPlus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export type QuickAction = { label: string; href: string; icon: "sale" | "expense" | "customer" };

const ICONS = { sale: Receipt, expense: Wallet, customer: UserPlus };

// Only the actions the user is allowed to perform are passed in.
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action, index) => {
        const Icon = ICONS[action.icon];
        return (
          <Button key={action.href} asChild variant={index === 0 ? "default" : "outline"}>
            <Link href={action.href}>
              <Plus />
              <Icon className="hidden sm:inline" />
              {action.label}
            </Link>
          </Button>
        );
      })}
    </div>
  );
}
