"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Loader2Icon } from "lucide-react";

/**
 * Submit button wired to the enclosing form's pending state, so every admin
 * form gets consistent double-submit protection without each one tracking it.
 */
export function SubmitButton({
  children,
  variant = "default",
  pendingLabel,
}: {
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={pending} aria-busy={pending}>
      {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
      {pending ? (pendingLabel ?? "Saving…") : children}
    </Button>
  );
}
