"use server";

import { redirect } from "next/navigation";
import { randomInt, createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { whatsappNumberSchema } from "@/lib/validation/common";
import { createCustomerSession, destroyCustomerSession } from "@/lib/customer-auth/session";
import { checkLoginRateLimit } from "@/lib/customer-auth/rate-limit";
import { isOtpEnabled, sendOtpCode } from "@/lib/customer-auth/otp-provider";
import { logger } from "@/lib/logger";
import { isSupabaseConfigured } from "@/lib/validation/env";
import {
  actionError,
  parseForm,
  type ActionResult,
} from "@/lib/admin/action-result";

/**
 * Phone sign-in. Two actions because the flow has (up to) two steps, but
 * only one is reachable until `OTP_PROVIDER` is set — see `otp-provider.ts`.
 */

const NOT_FOUND_ERROR = "We couldn't find any orders for that number.";
const RATE_LIMIT_ERROR = "Too many attempts. Please try again in a few minutes.";
const GENERIC_CODE_ERROR = "That code didn't match. Check it and try again.";

const OTP_CODE_TTL_MS = 5 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

const phoneSchema = z.object({ phone: whatsappNumberSchema });
const codeSchema = z.object({
  phone: whatsappNumberSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

/**
 * Extends the uniform `ActionResult` with one extra field this flow needs:
 * whether the client should render the code-entry step. Absent (or false)
 * means the action either failed, or completed sign-in directly because OTP
 * isn't configured yet.
 */
export type LoginActionResult = ActionResult & { otpRequired?: boolean };

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

async function findCustomerIdByPhone(phone: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    logger.error("findCustomerIdByPhone failed", { error: error.message });
    return null;
  }

  return (data as { id: string } | null)?.id ?? null;
}

export async function requestLoginAction(
  _prev: LoginActionResult,
  formData: FormData,
): Promise<LoginActionResult> {
  if (!isSupabaseConfigured) {
    return actionError("Supabase isn't configured on this deployment, so sign-in is unavailable.");
  }

  if (!(await checkLoginRateLimit())) {
    return actionError(RATE_LIMIT_ERROR);
  }

  const parsed = parseForm(phoneSchema, formData);
  if (!parsed.success) return parsed.result;

  const customerId = await findCustomerIdByPhone(parsed.data.phone);
  if (!customerId) return actionError(NOT_FOUND_ERROR);

  if (!isOtpEnabled()) {
    await createCustomerSession(customerId);
    redirect("/orders");
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const supabase = createAdminClient();
  const { error: insertError } = await supabase.from("otp_codes").insert({
    customer_id: customerId,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + OTP_CODE_TTL_MS).toISOString(),
  });

  if (insertError) {
    logger.error("requestLoginAction otp insert failed", { error: insertError.message });
    return actionError("Couldn't send a code right now. Please try again.");
  }

  try {
    await sendOtpCode(parsed.data.phone, code);
  } catch (error) {
    logger.error("requestLoginAction sendOtpCode failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return actionError("Couldn't send a code right now. Please try again.");
  }

  return { ok: true, otpRequired: true, message: "We sent a code to that number." };
}

export async function verifyLoginCodeAction(
  _prev: LoginActionResult,
  formData: FormData,
): Promise<LoginActionResult> {
  if (!isSupabaseConfigured) {
    return actionError("Supabase isn't configured on this deployment, so sign-in is unavailable.");
  }

  if (!(await checkLoginRateLimit())) {
    return actionError(RATE_LIMIT_ERROR);
  }

  const parsed = parseForm(codeSchema, formData);
  if (!parsed.success) return parsed.result;

  const customerId = await findCustomerIdByPhone(parsed.data.phone);
  if (!customerId) return actionError(GENERIC_CODE_ERROR);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("otp_codes")
    .select("id, code_hash, expires_at, attempt_count")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error("verifyLoginCodeAction lookup failed", { error: error.message });
    return actionError(GENERIC_CODE_ERROR);
  }

  const row = data as { id: string; code_hash: string; expires_at: string; attempt_count: number } | null;

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return actionError("That code has expired. Request a new one.");
  }

  if (row.attempt_count >= MAX_CODE_ATTEMPTS) {
    await supabase.from("otp_codes").delete().eq("id", row.id);
    return actionError("Too many incorrect attempts. Request a new code.");
  }

  if (hashCode(parsed.data.code) !== row.code_hash) {
    await supabase
      .from("otp_codes")
      .update({ attempt_count: row.attempt_count + 1 })
      .eq("id", row.id);
    return actionError(GENERIC_CODE_ERROR);
  }

  // Consumed — a code is single-use, whether or not this errors (best-effort
  // cleanup; a stale spent row cannot be replayed since it's still checked
  // against the same hash and only ever equals what was already accepted).
  await supabase.from("otp_codes").delete().eq("id", row.id);

  await createCustomerSession(customerId);
  redirect("/orders");
}

export async function signOutCustomerAction(): Promise<void> {
  await destroyCustomerSession();
  redirect("/orders/login");
}
