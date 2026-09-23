export function lagosToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = Object.fromEntries(parts.map(p => [p.type, p.value])); return `${value.year}-${value.month}-${value.day}`;
}
export function isValidTravelDate(value: string, now = new Date()) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value && value >= lagosToday(now); }
export function calculateExpiry(date: string, graceDays = Number(process.env.TRAVEL_PLAN_EXPIRY_GRACE_DAYS ?? 1)) { const start = new Date(`${date}T00:00:00+01:00`); return new Date(start.getTime() + (graceDays + 1) * 86_400_000); }
