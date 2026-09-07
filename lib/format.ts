export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/**
 * Ordinal suffix for a positive integer: 1 → "st", 2 → "nd", 11 → "th".
 *
 * The 11/12/13 exception is why this isn't a one-line lookup on the last digit
 * — "11st" is the bug this exists to avoid.
 */
export function ordinalSuffix(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return "th";

  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
