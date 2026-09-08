"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { LOGIN_PATH } from "@/lib/auth/guard";
import { recordAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { checkRateLimit } from "@/lib/rate-limit";
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
const RATE_LIMIT_ERROR = "Too many attempts. Please try again in a few minutes.";

/**
 * Stricter than customer sign-in (20/10min): this gates full admin control
 * over products, orders and customers, and there is normally exactly one
 * admin account, so there is no legitimate reason for a burst of attempts.
 */
const MAX_ATTEMPTS = 10;
const WINDOW_MINUTES = 15;

export async function signInAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isSupabaseConfigured) {
    return actionError(
      "Supabase isn't configured on this deployment, so sign-in is unavailable.",
    );
  }

  if (!(await checkRateLimit("admin-login", { maxAttempts: MAX_ATTEMPTS, windowMinutes: WINDOW_MINUTES }))) {
    return actionError(RATE_LIMIT_ERROR);
  }

  const parsed = parseForm(signInSchema, formData);
  if (!parsed.success) return parsed.result;

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    logger.warn("Admin sign-in rejected", { reason: error?.message ?? "no user" });
    // No entityId: a wrong email/password never resolves to a real user id,
    // and the email itself does not belong in an audit row (scrub() would
    // redact it anyway, but it should never be typed in the first place).
    await recordAuditEvent({
      actorId: null,
      action: "login_failed",
      entityType: "profile",
      metadata: { reason: "invalid_credentials" },
    });
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
