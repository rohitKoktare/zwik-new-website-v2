"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestLoginAction,
  verifyLoginCodeAction,
  type LoginActionResult,
} from "@/lib/customer-auth/actions";

const IDLE: LoginActionResult = { ok: false };

function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-2 flex h-13 w-full items-center justify-center bg-[var(--magenta-60)] text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[var(--purple-60)] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * Phone sign-in, in one component because the two steps share state (the
 * phone number typed in step one is needed again, as a hidden field, in
 * step two).
 *
 * The code-entry step only ever renders once `otpRequired` comes back true
 * from the server — which it never does until `OTP_PROVIDER` is configured
 * (see lib/customer-auth/otp-provider.ts). Until then, submitting the phone
 * number signs you in directly; this component doesn't need to change when
 * that flips.
 */
export function PhoneLoginForm() {
  const [phone, setPhone] = useState("");
  const [requestState, requestAction] = useActionState(requestLoginAction, IDLE);
  const [verifyState, verifyAction] = useActionState(verifyLoginCodeAction, IDLE);

  const showCodeStep = requestState.otpRequired === true;
  const activeError = (showCodeStep ? verifyState : requestState).formError;

  return (
    <div className="grid gap-4">
      {activeError && (
        <p className="border-l-2 border-[var(--red-60)] bg-white py-2 pl-3 text-sm text-[var(--red-60)]">
          {activeError}
        </p>
      )}

      {!showCodeStep ? (
        <form action={requestAction} className="grid gap-3">
          <div className="grid gap-1">
            <label htmlFor="login-phone" className="text-[13px] text-[var(--text-secondary)]">
              Mobile number
            </label>
            <input
              id="login-phone"
              name="phone"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit number"
              className="h-[42px] border-0 border-b border-[var(--border-strong)] bg-white px-3 font-mono text-sm text-[var(--text-primary)]"
            />
          </div>
          <SubmitButton pendingLabel="Checking…">View my orders</SubmitButton>
        </form>
      ) : (
        <form action={verifyAction} className="grid gap-3">
          <input type="hidden" name="phone" value={phone} />
          <p className="text-sm text-[var(--text-secondary)]">
            We sent a code to <span className="font-mono">{phone}</span>.
          </p>
          <div className="grid gap-1">
            <label htmlFor="login-code" className="text-[13px] text-[var(--text-secondary)]">
              6-digit code
            </label>
            <input
              id="login-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="h-[42px] border-0 border-b border-[var(--border-strong)] bg-white px-3 font-mono text-sm text-[var(--text-primary)]"
            />
          </div>
          <SubmitButton pendingLabel="Verifying…">Verify</SubmitButton>
        </form>
      )}
    </div>
  );
}
