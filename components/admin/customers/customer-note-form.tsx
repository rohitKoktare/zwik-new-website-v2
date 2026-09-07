"use client";

import { useActionState } from "react";
import { updateCustomerNoteAction } from "@/lib/admin/customers/actions";
import { IDLE_RESULT } from "@/lib/admin/action-result";
import { FormAlert } from "@/components/admin/form-alert";
import { FormField } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { Textarea } from "@/components/ui/textarea";

/** ZWIK's own notes on a customer. Never shown to the customer. */
export function CustomerNoteForm({
  customerId,
  adminNote,
}: {
  customerId: string;
  adminNote: string | null;
}) {
  const [state, formAction] = useActionState(updateCustomerNoteAction, IDLE_RESULT);

  return (
    <form action={formAction} className="grid gap-3 border-t border-border pt-4">
      <input type="hidden" name="id" value={customerId} />

      <FormAlert message={state.formError} />

      {state.ok && state.message && (
        <p role="status" className="border border-border bg-muted px-3 py-2 text-sm">
          {state.message}
        </p>
      )}

      <FormField
        name="adminNote"
        label="Internal note"
        hint="For your team only — the customer never sees this. Don't record payment details here."
        errors={state.fieldErrors?.adminNote}
      >
        <Textarea
          id="adminNote"
          name="adminNote"
          rows={3}
          maxLength={1000}
          defaultValue={adminNote ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.adminNote)}
        />
      </FormField>

      <div>
        <SubmitButton variant="outline">Save note</SubmitButton>
      </div>
    </form>
  );
}
