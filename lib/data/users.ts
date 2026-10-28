import "server-only";
import { db } from "@/lib/db";
import { currentCompanyUsers } from "@/lib/platform/user-scope";

export async function listUsers() {
  return db.user.findMany({
    // `User` is outside the tenant filter, so the company is named here. See `user-scope.ts`.
    where: { isSuperAdmin: false, ...(await currentCompanyUsers()) },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      isActive: true,
      isSuperAdmin: true,
      roleId: true,
      branchId: true,
      branch: { select: { id: true, name: true } },
      role: { select: { id: true, name: true } },
    },
  });
}

export async function getUser(id: string) {
  // `findFirst`, not `findUnique`: an id from the URL is a guess anybody can make, and a unique
  // key leaves no room for the company condition that stops it reaching another customer's staff.
  return db.user.findFirst({
    where: { id, ...(await currentCompanyUsers()) },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      isActive: true,
      isSuperAdmin: true,
      roleId: true,
      branchId: true,
      branch: { select: { id: true, name: true } },
      createdAt: true,
      role: { select: { id: true, name: true } },
    },
  });
}

/**
 * The signed-in person's own record, for `/profile`.
 *
 * Deliberately **not** company-scoped, unlike `getUser`. The id comes from the session the
 * server itself issued, not from a URL, so there is nobody else it could reach — and the Super
 * Admin belongs to no company, so a scoped lookup finds nothing and their own profile page
 * answers "not found". Which is exactly what it did.
 */
export async function getOwnProfile(id: string) {
  // own-account: the id is the session's own user, and the operator belongs to no company.
  return db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      isActive: true,
      isSuperAdmin: true,
      roleId: true,
      branchId: true,
      branch: { select: { id: true, name: true } },
      createdAt: true,
      role: { select: { id: true, name: true } },
    },
  });
}

export type UserListItem = Awaited<ReturnType<typeof listUsers>>[number];
export type UserDetail = NonNullable<Awaited<ReturnType<typeof getUser>>>;

export async function listRoles() {
  return db.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: { permissions: true, _count: { select: { users: true } } },
  });
}

export async function getRole(id: string) {
  return db.role.findUnique({
    where: { id },
    include: { permissions: true, _count: { select: { users: true } } },
  });
}

export async function listRoleOptions() {
  return db.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export type RoleListItem = Awaited<ReturnType<typeof listRoles>>[number];
export type RoleDetail = NonNullable<Awaited<ReturnType<typeof getRole>>>;
export type RoleOption = Awaited<ReturnType<typeof listRoleOptions>>[number];
