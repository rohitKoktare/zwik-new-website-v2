"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { LOGIN_PATH } from "@/lib/auth/guard";
import { recordAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isSupabaseConfigured } from "@/lib/validation/env";
import {
  actionError,
  parseForm,
  type ActionResult,
} from "@/lib/admin/action-result";

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

/**
 * Deliberately vague for every failure mode (wrong email, wrong password,
 * valid Supabase user with no admin profile). Distinguishing them would let an
 * attacker enumerate which addresses are admins.
 */
const GENERIC_SIGN_IN_ERROR = "Those credentials aren't valid.";

export async function signInAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isSupabaseConfigured) {
    return actionError(
      "Supabase isn't configured on this deployment, so sign-in is unavailable.",
    );
  }

  const parsed = parseForm(signInSchema, formData);
  if (!parsed.success) return parsed.result;

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    logger.warn("Admin sign-in rejected", { reason: error?.message ?? "no user" });
    return actionError(GENERIC_SIGN_IN_ERROR);
  }

  // Authenticating with Supabase is not the same as being an admin. A user may
  // exist in auth.users with no profile row, an inactive profile, or a
  // non-admin role — none of those may reach /admin.
  const profile = await getCurrentProfile();

  if (!profile) {
    await supabase.auth.signOut();
    logger.warn("Authenticated user without an active admin profile was rejected", {
      userId: data.user.id,
    });
    await recordAuditEvent({
      actorId: null,
      action: "login_failed",
      entityType: "profile",
      entityId: data.user.id,
      metadata: { reason: "no_active_admin_profile" },
    });
    return actionError(GENERIC_SIGN_IN_ERROR);
  }

  await recordAuditEvent({
    actorId: profile.id,
    action: "login",
    entityType: "profile",
    entityId: profile.id,
  });

  redirect("/admin");
}

export async function signOutAction(): Promise<void> {
  const profile = await getCurrentProfile();

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  if (profile) {
    logger.info("Admin signed out", { actorId: profile.id });
  }

  redirect(LOGIN_PATH);
}
