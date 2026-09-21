import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { PERMISSION_MODULES, type PermissionMap } from "@/lib/auth/permissions";

type Props = {
  roleName: string | null;
  isSuperAdmin: boolean;
  isActive: boolean;
  memberSince: string;
  permissions: PermissionMap;
};

const ACTION_LABELS: { key: "view" | "create" | "edit" | "delete"; label: string }[] = [
  { key: "view", label: "View" },
  { key: "create", label: "Create" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Delete" },
];

/** Read-only summary of what this account may do — the role itself is managed in Users & Roles. */
export function AccessCard({ roleName, isSuperAdmin, isActive, memberSince, permissions }: Props) {
  const modules = PERMISSION_MODULES.map((module) => ({
    ...module,
    actions: ACTION_LABELS.filter(({ key }) => isSuperAdmin || permissions[module.value]?.[key]),
  })).filter((module) => module.actions.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Role &amp; access</CardTitle>
        <CardDescription>Set by your administrator in Users &amp; Roles.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Role</dt>
            <dd className="font-medium">{isSuperAdmin ? "Super Admin" : (roleName ?? "No role")}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <StatusBadge tone={isActive ? "success" : "neutral"}>{isActive ? "Active" : "Inactive"}</StatusBadge>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Member since</dt>
            <dd className="font-medium">{memberSince}</dd>
          </div>
        </dl>

        {isSuperAdmin ? (
          <p className="flex items-start gap-2 rounded-lg bg-tint-green p-3 text-sm text-tint-green-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            Full access to every part of the app.
          </p>
        ) : modules.length === 0 ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            No modules have been granted yet. Ask your administrator for access.
          </p>
        ) : (
          <div className="space-y-3">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What you can do</h3>
            <ul className="space-y-2.5">
              {modules.map((module) => (
                <li key={module.value} className="space-y-1.5">
                  <p className="text-sm font-medium">{module.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {module.actions.map((action) => (
                      <span key={action.key} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {action.label}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
