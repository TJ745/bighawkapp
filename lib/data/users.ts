import "server-only";
import { db } from "@/lib/db";

export async function listUsers() {
  return db.user.findMany({
    where: { isSuperAdmin: false },
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
      role: { select: { id: true, name: true } },
    },
  });
}

export async function getUser(id: string) {
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
