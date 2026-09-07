"use client";

import { useActionState } from "react";
import { resubscribeCustomerAction } from "@/lib/admin/customers/actions";
import { IDLE_RESULT } from "@/lib/admin/action-result";
import { FormAlert } from "@/components/admin/form-alert";
import { FormField } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { Input } from "@/components/ui/input";

/**
 * Reverses an unsubscribe.
 *
 * The stated source is required, not decorative: re-granting a consent the
 * customer previously withdrew has to be traceable to something they actually
 * said. It is written into the audit log verbatim.
 */
export function ResubscribeForm({ customerId }: { customerId: string }) {
  const [state, formAction] = useActionState(resubscribeCustomerAction, IDLE_RESULT);

  return (
    <form action={formAction} className="grid gap-3 border-t border-border pt-3">
      <input type="hidden" name="id" value={customerId} />

      <FormAlert message={state.formError} />

      {state.ok && state.message && (
        <p role="status" className="border border-border bg-muted px-3 py-2 text-xs">
          {state.message}
        </p>
      )}

      <FormField
        name="source"
        label="Re-subscribe — where did they ask?"
        hint="Required. For example: “asked on WhatsApp 12 Aug”. Recorded in the audit log."
        errors={state.fieldErrors?.source}
        required
      >
        <Input
          id="source"
          name="source"
          maxLength={120}
          placeholder="asked on WhatsApp 12 Aug"
          required
          aria-invalid={Boolean(state.fieldErrors?.source)}
        />
      </FormField>

      <div>
        <SubmitButton variant="outline">Re-subscribe</SubmitButton>
      </div>
    </form>
  );
}
