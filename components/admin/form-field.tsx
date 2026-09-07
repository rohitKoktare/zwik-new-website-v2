import { Label } from "@/components/ui/label";

/**
 * Wraps a control with its label, optional hint and validation errors, and
 * wires up aria-describedby / aria-invalid so errors are announced to screen
 * readers rather than only shown in red.
 */
export function FormField({
  name,
  label,
  hint,
  errors,
  required,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  errors?: string[];
  required?: boolean;
  children: React.ReactNode;
}) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const hasError = Boolean(errors?.length);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </Label>

      <div
        // Applied to the wrapper so the consumer can pass any control as
        // children without us cloning it to inject props.
        data-invalid={hasError || undefined}
        className="[&_[data-slot=input]]:data-[invalid=true]:border-destructive"
      >
        {children}
      </div>

      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}

      {hasError && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {errors!.join(" ")}
        </p>
      )}
    </div>
  );
}
