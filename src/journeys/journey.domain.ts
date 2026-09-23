import { JOURNEY_CHECKLIST_ITEMS, JOURNEY_STATUSES } from '../domain.js';
export type JourneyStatus = typeof JOURNEY_STATUSES[number];
const transitions: Record<JourneyStatus, readonly JourneyStatus[]> = { PREPARING: ['READY_TO_START', 'CANCELLED'], READY_TO_START: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['NEEDS_ATTENTION', 'ARRIVED', 'CANCELLED'], NEEDS_ATTENTION: ['IN_PROGRESS', 'ARRIVED', 'CANCELLED'], ARRIVED: ['COMPLETED'], COMPLETED: [], CANCELLED: [] };
export function assertJourneyTransition(from: JourneyStatus, to: JourneyStatus) { if (!transitions[from].includes(to)) throw new Error(`Invalid Journey transition: ${from} -> ${to}`); }
export const checklistItems = JOURNEY_CHECKLIST_ITEMS.map(([itemKey, label]) => ({ itemKey, label }));
export function shareExpiry(now = new Date(), hours = Number(process.env.JOURNEY_SHARE_HOURS ?? 168)) { return new Date(now.getTime() + hours * 3_600_000); }

