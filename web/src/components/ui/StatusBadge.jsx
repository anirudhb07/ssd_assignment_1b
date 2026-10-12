const LABELS = {
  PREPARING: 'Preparing',
  DELIVERING: 'Delivering',
  DELIVERED: 'Delivered',
  DEBIT: 'Debit',
  CREDIT: 'Credit',
};

// For order statuses and wallet action types. Colours live in components.css.
export function StatusBadge({ status }) {
  const known = status in LABELS;
  return <span className={`badge ${known ? `badge--${status}` : 'badge--neutral'}`}>{LABELS[status] ?? status}</span>;
}
