"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { IDLE_RESULT, type ActionResult } from "@/lib/admin/action-result";

/**
 * Confirmation gate for state-changing admin actions (archive, restore,
 * delete, remove-association).
 *
 * The dialog is a usability guard only — the server action it submits to must
 * still independently authenticate, authorize and validate. Never treat a
 * confirmed dialog as proof of anything.
 *
 * Invokes the action inside a transition rather than via `useActionState` so
 * the result can be handled in the event path (toast + close). Reacting to the
 * result in an effect would mean calling setState from an effect body, which
 * causes cascading renders.
 */
export function ConfirmAction({
  action,
  hiddenFields,
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  hiddenFields?: Record<string, string>;
  /** Element rendered as the trigger, e.g. `<Button variant="outline">Archive</Button>`. */
  trigger: React.ReactElement;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await action(IDLE_RESULT, formData);

      if (result.ok) {
        toast.success(result.message ?? "Done.");
        setOpen(false);
      } else {
        toast.error(result.formError ?? "That didn't work. Please try again.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {/* Base UI composes via `render`, not Radix's `asChild`. */}
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <form action={handleSubmit}>
          {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel type="button" disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              disabled={pending}
              aria-busy={pending}
              variant={destructive ? "destructive" : "default"}
            >
              {pending ? "Working…" : confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
