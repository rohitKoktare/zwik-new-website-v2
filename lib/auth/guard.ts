import "server-only";
import { redirect } from "next/navigation";
import { getCurrentProfile, type AdminProfile } from "@/lib/auth/session";

/** Every role that may reach the admin area at all. */
export const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Roles allowed to change security-sensitive configuration. */
export const SETTINGS_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "ADMIN"];

/** Roles allowed to permanently destroy data (as opposed to archiving it). */
export const DESTRUCTIVE_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "ADMIN"];

export const LOGIN_PATH = "/admin/login";

function isAdminRole(role: string): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

/**
 * Server-side authorization gate for the admin area.
 *
 * Call this from every admin layout, page AND server action. A layout check
 * alone does not protect a server action — actions are independently
 * addressable endpoints (DEVELOPMENT_STANDARDS.md §8).
 */
export async function requireAdmin(): Promise<AdminProfile> {
  const profile = await getCurrentProfile();

  if (!profile || !isAdminRole(profile.role)) {
    redirect(LOGIN_PATH);
  }

  return profile;
}

/**
 * Like requireAdmin, but additionally requires one of `allowedRoles`.
 * Used for settings and destructive operations.
 */
export async function requireRole(
  allowedRoles: readonly AdminRole[],
): Promise<AdminProfile> {
  const profile = await requireAdmin();

  if (!allowedRoles.includes(profile.role as AdminRole)) {
    redirect("/admin?denied=1");
  }

  return profile;
}

/**
 * Non-redirecting variant for server actions, which should return a friendly
 * error rather than throwing a redirect mid-mutation.
 */
export async function getAuthorizedActor(
  allowedRoles: readonly AdminRole[] = ADMIN_ROLES,
): Promise<AdminProfile | null> {
  const profile = await getCurrentProfile();

  if (!profile || !isAdminRole(profile.role)) return null;
  if (!allowedRoles.includes(profile.role as AdminRole)) return null;

  return profile;
}
