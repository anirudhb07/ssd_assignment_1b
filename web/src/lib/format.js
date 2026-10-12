// Shared formatting so money, dates and distances look the same everywhere.

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const formatMoney = (value) => (value == null ? '—' : money.format(value));
export const formatDate = (value) => (value ? date.format(new Date(value)) : '—');
export const formatDateTime = (value) => (value ? dateTime.format(new Date(value)) : '—');
export const formatDistance = (meters) =>
  meters == null ? '—' : meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
export const shortId = (id) => (id ? id.slice(0, 8) : '—');
