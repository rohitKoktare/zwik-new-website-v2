const BASE_MESSAGES = [
  "Hand-painted resin",
  "3–5 cm, fits anywhere",
  "Gift-wrapped free",
  "Bulk orders welcome",
  "Ships across India",
];

/**
 * Infinite marquee. The row is 200% wide holding two copies of the list, and
 * `zw-marquee` translates it -50% — so the moment the first copy scrolls out,
 * the second is exactly where the first began and the loop is seamless.
 *
 * The visible row is aria-hidden (duplicated text reads terribly) with a single
 * sr-only copy alongside it for screen readers.
 */
export function AnnouncementTicker({
  deliveryHeadline,
}: {
  /** e.g. "Free delivery over ₹500 across all India". Omitted when no offer runs. */
  deliveryHeadline?: string | null;
}) {
  const messages = deliveryHeadline
    ? [BASE_MESSAGES[0], deliveryHeadline, ...BASE_MESSAGES.slice(1)]
    : BASE_MESSAGES;

  const items = [...messages, ...messages];

  return (
    <div className="h-9 overflow-hidden border-b border-[var(--gray-100)] bg-[var(--yellow-30)] text-[var(--gray-100)]">
      <div
        className="flex h-full w-[200%] animate-[zw-marquee_28s_linear_infinite] items-center gap-9 font-mono text-xs font-medium tracking-[1.6px] whitespace-nowrap uppercase"
        aria-hidden
      >
        {items.map((msg, i) => (
          <span key={i} className="flex items-center gap-9">
            {msg}
            <span>✿</span>
          </span>
        ))}
      </div>
      <span className="sr-only">{messages.join(". ")}</span>
    </div>
  );
}
