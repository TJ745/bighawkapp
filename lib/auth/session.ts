import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { AppModule, PermissionModule } from "@/lib/generated/prisma/enums";
import { auth } from "./auth";
import { AuthorizationError } from "./errors";
import { PERMISSION_MODULES, type PermissionAction, type PermissionMap } from "./permissions";
import { db } from "@/lib/db";
import { getCurrentBranch, getEnabledModules } from "@/lib/data/platform";
import { appModuleOf } from "@/lib/platform/modules";
import { posTypeHasCapability, type PosCapability } from "@/lib/platform/pos-types";

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
  // Permission modules the user may open, with company module subscriptions already applied.
  visibleModules: PermissionModule[];
  /** Product modules this company subscribes to. A disabled module is closed to everyone. */
  enabledModules: AppModule[];
  can: (module: PermissionModule, action: PermissionAction) => boolean;
  /** Whether the company has this product module switched on. */
  hasModule: (module: AppModule) => boolean;
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

  const enabledModules = await getEnabledModules();
  const hasModule = (module: AppModule) => enabledModules.includes(module);

  // Permission is still the user's own grant, but a module the company has not subscribed to is
  // closed to everyone — including the Super Admin, who switches it on in Settings → Modules.
  const can = (module: PermissionModule, action: PermissionAction) => {
    const owner = appModuleOf(module);
    if (owner && !hasModule(owner)) return false;
    return user.isSuperAdmin || (permissions[module]?.[action] ?? false);
  };

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
    visibleModules: PERMISSION_MODULES.map((m) => m.value).filter((m) => can(m, "view")),
    enabledModules,
    can,
    hasModule,
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
  const owner = appModuleOf(module);
  // A module the company does not have reads differently from a permission it was not granted.
  if (owner && !ctx.hasModule(owner)) redirect("/access-denied?reason=module");
  if (!ctx.can(module, action)) redirect("/access-denied");
  return ctx;
}

/**
 * For pages inside a product module: refuses when the company has not subscribed to it.
 * Pass a permission as well and both are checked — the chain is module → permission.
 */
export async function requireModule(module: AppModule, permission?: PermissionModule, action: PermissionAction = "view") {
  const ctx = await requireAuth();
  if (!ctx.hasModule(module)) redirect("/access-denied?reason=module");
  if (permission && !ctx.can(permission, action)) redirect("/access-denied");
  return ctx;
}

/** For POS pages whose feature only exists for some industries (tables, appointments…). */
export async function requirePosCapability(capability: PosCapability, permission: PermissionModule = "POS", action: PermissionAction = "view") {
  const ctx = await requireModule("POS", permission, action);
  const branch = await getCurrentBranch();
  const posType = branch?.posConfig?.businessType ?? "RETAIL";
  if (!posTypeHasCapability(posType, capability)) redirect("/access-denied?reason=capability");
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
  const owner = appModuleOf(module);
  if (owner && !ctx.hasModule(owner)) throw new AuthorizationError("forbidden", "This module is not enabled for your company.");
  if (!ctx.can(module, action)) throw new AuthorizationError("forbidden");
  return ctx;
}

/**
 * For Server Actions inside a product module. Hiding the navigation is never the only check:
 * a POS action must refuse even if someone replays the request with the module switched off.
 */
export async function authorizeModule(module: AppModule, permission?: PermissionModule, action: PermissionAction = "edit"): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError("unauthenticated");
  if (!ctx.hasModule(module)) throw new AuthorizationError("forbidden", "This module is not enabled for your company.");
  if (permission && !ctx.can(permission, action)) throw new AuthorizationError("forbidden");
  return ctx;
}

/**
 * For Server Actions behind an industry-specific POS feature. The argument order matches
 * `requirePosCapability`, so an action checks exactly what its page required: module, then the
 * branch's industry, then the permission.
 */
export async function authorizePosCapability(
  capability: PosCapability,
  permission: PermissionModule = "POS",
  action: PermissionAction = "edit",
): Promise<AuthContext> {
  const ctx = await authorizeModule("POS", permission, action);
  const branch = await getCurrentBranch();
  const posType = branch?.posConfig?.businessType ?? "RETAIL";
  if (!posTypeHasCapability(posType, capability)) {
    throw new AuthorizationError("forbidden", "This feature is not available for this branch's POS type.");
  }
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
