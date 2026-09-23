import type { DEPARTURE_WINDOWS } from '../domain.js';

type DepartureWindow = typeof DEPARTURE_WINDOWS[number];
const START_HOUR: Record<DepartureWindow, number> = { EARLY_MORNING: 4, MORNING: 7, LATE_MORNING: 10, AFTERNOON: 12, FLEXIBLE: 7 };

// Africa/Lagos is UTC+1 year-round. Constructing in UTC keeps jobs independent of server timezone.
export function departureAt(travelDate: string, window: DepartureWindow) {
  return new Date(`${travelDate}T${String(START_HOUR[window] - 1).padStart(2, '0')}:00:00.000Z`);
}
export function circleLockAt(travelDate: string, window: DepartureWindow, hoursBefore = Number(process.env.CIRCLE_LOCK_HOURS_BEFORE ?? 2)) {
  return new Date(departureAt(travelDate, window).getTime() - hoursBefore * 3_600_000);
}
export function confirmationAt(travelDate: string, window: DepartureWindow, hoursBefore = Number(process.env.TRAVEL_CONFIRMATION_HOURS_BEFORE ?? 24)) {
  return new Date(departureAt(travelDate, window).getTime() - hoursBefore * 3_600_000);
}
export function matchingIsClosed(travelDate: string, window: DepartureWindow, now = new Date()) {
  return now >= circleLockAt(travelDate, window);
}

