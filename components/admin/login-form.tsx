"use client";

import { useActionState } from "react";
import { signInAction } from "@/lib/auth/actions";
import { IDLE_RESULT } from "@/lib/admin/action-result";
import { FormField } from "@/components/admin/form-field";
import { FormAlert } from "@/components/admin/form-alert";
import { SubmitButton } from "@/components/admin/submit-button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [state, formAction] = useActionState(signInAction, IDLE_RESULT);

  return (
    <form action={formAction} className="mt-6 grid gap-4">
      <FormAlert message={state.formError} />

      <FormField name="email" label="Email" errors={state.fieldErrors?.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
      </FormField>

      <FormField name="password" label="Password" errors={state.fieldErrors?.password} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
      </FormField>

      <div className="mt-2">
        <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      </div>
    </form>
  );
}
