// Shared formatting so money, dates and distances look the same everywhere.

// Whole rupees without paise (₹4,250), otherwise two decimals (₹12,890.50).
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const rupeesAndPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
// Every time is shown in India Standard Time, whatever the viewer's computer
// is set to, so it matches the Wallet date filter (Indian calendar days).
const IST = 'Asia/Kolkata';
const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST });
// 24-hour clock ("12 Oct, 10:42"), as in docs/design/README.md; en-IN defaults to 12-hour.
const dateTime = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: IST });
const time = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: IST });

export const formatMoney = (value) =>
  value == null ? '—' : (Number.isInteger(value) ? rupees : rupeesAndPaise).format(value);
export const formatDate = (value) => (value ? date.format(new Date(value)) : '—');
export const formatDateTime = (value) => (value ? dateTime.format(new Date(value)) : '—');
export const formatTime = (value) => (value ? time.format(new Date(value)) : '—');
export const formatDistance = (meters) =>
  meters == null ? '—' : meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
export const shortId = (id) => (id ? id.slice(0, 8) : '—');
