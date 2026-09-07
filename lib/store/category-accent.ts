/** Maps each category slug to its Carbon accent token, matching the design reference. */
export const CATEGORY_ACCENTS: Record<string, { bg: string; fg: string }> = {
  desk: { bg: "var(--magenta-60)", fg: "#ffffff" },
  monitor: { bg: "var(--blue-60)", fg: "#ffffff" },
  dashboard: { bg: "var(--teal-60)", fg: "#ffffff" },
  shelf: { bg: "var(--yellow-30)", fg: "var(--gray-100)" },
};

export function getCategoryAccent(slug: string) {
  return CATEGORY_ACCENTS[slug] ?? { bg: "var(--gray-100)", fg: "#ffffff" };
}
