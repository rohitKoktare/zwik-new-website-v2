import { Badge } from "@/components/ui/badge";

/**
 * Status pill. Carries a text label rather than relying on colour alone
 * (DEVELOPMENT_STANDARDS.md §18: do not communicate state with colour only).
 */
export function StatusBadge({ active, activeLabel = "Active", inactiveLabel = "Hidden" }: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <Badge variant={active ? "default" : "secondary"}>
      {active ? activeLabel : inactiveLabel}
    </Badge>
  );
}
