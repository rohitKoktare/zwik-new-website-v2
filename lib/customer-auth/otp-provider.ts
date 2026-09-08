import "server-only";

/**
 * The one swappable piece of the phone sign-in flow.
 *
 * Real SMS OTP has an ongoing per-message cost and, for India, a DLT
 * sender-ID/template registration step outside this codebase — both
 * deliberately deferred (see docs/DATABASE_DESIGN.md and ARCHITECTURE.md
 * §16.1). Until `OTP_PROVIDER` is set, `isOtpEnabled()` is false and
 * `lib/customer-auth/actions.ts` never calls `sendOtpCode` at all: entering a
 * phone number that has orders on file signs you in directly.
 *
 * The moment a provider is configured, the exact same call sites require a
 * real code — no other code changes. Both branches below are plain `fetch`
 * calls; neither MSG91 nor Fast2SMS needs an npm dependency.
 */
export function isOtpEnabled(): boolean {
  const provider = process.env.OTP_PROVIDER;
  return Boolean(provider) && provider !== "none";
}

/** Throws on delivery failure; the caller decides how to surface that. */
export async function sendOtpCode(phone: string, code: string): Promise<void> {
  const provider = process.env.OTP_PROVIDER;

  switch (provider) {
    case "msg91": {
      // https://docs.msg91.com/reference/send-otp — self-serve DLT
      // registration, which is why this is the recommended default once
      // you're ready to turn OTP on. Needs MSG91_AUTH_KEY (from the MSG91
      // dashboard) and MSG91_TEMPLATE_ID (the DLT-approved OTP template you
      // register there — {{otp}} must be a variable in it).
      const authKey = process.env.MSG91_AUTH_KEY;
      const templateId = process.env.MSG91_TEMPLATE_ID;

      if (!authKey || !templateId) {
        throw new Error("MSG91_AUTH_KEY and MSG91_TEMPLATE_ID must both be set for OTP_PROVIDER=msg91.");
      }

      const url = new URL("https://control.msg91.com/api/v5/otp");
      url.searchParams.set("template_id", templateId);
      url.searchParams.set("mobile", phone);
      url.searchParams.set("authkey", authKey);
      url.searchParams.set("otp", code);

      const response = await fetch(url, { method: "POST" });
      if (!response.ok) {
        throw new Error(`MSG91 OTP send failed: ${response.status} ${await response.text()}`);
      }
      return;
    }

    case "fast2sms": {
      // https://docs.fast2sms.com/#otp-message — check current pricing/free
      // tier before relying on it; terms and the exact free quota change.
      // Needs FAST2SMS_API_KEY (from the Fast2SMS dashboard).
      const apiKey = process.env.FAST2SMS_API_KEY;

      if (!apiKey) {
        throw new Error("FAST2SMS_API_KEY must be set for OTP_PROVIDER=fast2sms.");
      }

      const url = new URL("https://www.fast2sms.com/dev/bulkV2");
      url.searchParams.set("authorization", apiKey);
      url.searchParams.set("route", "otp");
      url.searchParams.set("variables_values", code);
      url.searchParams.set("numbers", phone);

      const response = await fetch(url, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Fast2SMS OTP send failed: ${response.status} ${await response.text()}`);
      }
      return;
    }

    default:
      throw new Error(`Unknown OTP_PROVIDER: ${provider}`);
  }
}
