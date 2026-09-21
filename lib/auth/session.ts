import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { PermissionModule } from "@/lib/generated/prisma/enums";
import { auth } from "./auth";
import { AuthorizationError } from "./errors";
import { PERMISSION_MODULES, type PermissionAction, type PermissionMap } from "./permissions";
import { db } from "@/lib/db";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  phone: string | null;
  isSuperAdmin: boolean;
  roleId: string | null;
  roleName: string | null;
};

export type AuthContext = {
  user: AuthUser;
  permissions: PermissionMap;
  // Modules the user may open. `null` = unrestricted (Super Admin).
  visibleModules: PermissionModule[] | null;
  can: (module: PermissionModule, action: PermissionAction) => boolean;
};

/**
 * Resolves the signed-in user for the current request, with fresh role permissions
 * from the database. Cached per request. Returns null when signed out or deactivated.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: { include: { permissions: true } } },
  });
  if (!user || !user.isActive) return null;

  const permissions: PermissionMap = {};
  for (const p of user.role?.permissions ?? []) {
    permissions[p.module] = { view: p.canView, create: p.canCreate, edit: p.canEdit, delete: p.canDelete };
  }

  const can = (module: PermissionModule, action: PermissionAction) =>
    user.isSuperAdmin || (permissions[module]?.[action] ?? false);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      phone: user.phone,
      isSuperAdmin: user.isSuperAdmin,
      roleId: user.roleId,
      roleName: user.role?.name ?? null,
    },
    permissions,
    visibleModules: user.isSuperAdmin ? null : PERMISSION_MODULES.map((m) => m.value).filter((m) => can(m, "view")),
    can,
  };
});

/** For pages/layouts: redirects to the login screen when signed out. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** For pages: redirects to the access-denied screen when the permission is missing. */
export async function requirePermission(module: PermissionModule, action: PermissionAction = "view") {
  const ctx = await requireAuth();
  if (!ctx.can(module, action)) redirect("/access-denied");
  return ctx;
}

/** For pages that only the Super Admin may open (SMTP, security, document styling). */
export async function requireSuperAdmin() {
  const ctx = await requireAuth();
  if (!ctx.user.isSuperAdmin) redirect("/access-denied");
  return ctx;
}

/** For Server Actions: throws AuthorizationError (converted to a friendly result by runAction). */
export async function authorize(module: PermissionModule, action: PermissionAction): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError("unauthenticated");
  if (!ctx.can(module, action)) throw new AuthorizationError("forbidden");
  return ctx;
}

/** For Server Actions behind a Super Admin page; the UI hiding the page is never the only check. */
export async function authorizeSuperAdmin(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError("unauthenticated");
  if (!ctx.user.isSuperAdmin) throw new AuthorizationError("forbidden", "Only the Super Admin can change this.");
  return ctx;
}

/** For Server Actions that any signed-in user may call (e.g. own profile, notifications). */
export async function authorizeSignedIn(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError("unauthenticated");
  return ctx;
}
