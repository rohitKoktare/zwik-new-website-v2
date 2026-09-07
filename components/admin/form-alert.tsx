import { OctagonXIcon } from "lucide-react";

/** Top-of-form error banner. Only ever renders safe, human-readable text. */
export function FormAlert({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      <OctagonXIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
