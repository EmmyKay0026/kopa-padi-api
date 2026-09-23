import { z } from 'zod'; import { CANCELLATION_REASONS, DEPARTURE_WINDOWS, GROUP_PREFERENCES, TRANSPORT_MODES } from '../domain.js'; import { isValidTravelDate } from './travel-plan.domain.js';
export const travelPlanInputSchema = z.object({
  originStateId:z.string().min(2).max(64), originLgaId:z.string().min(2).max(64), originTownId:z.string().uuid().nullable().optional(), intendedTravelDate:z.string().refine(value=>isValidTravelDate(value),{message:'Travel date must be a real date today or later'}),
  dateFlexibilityDays:z.union([z.literal(0),z.literal(1),z.literal(2)]), departureWindow:z.enum(DEPARTURE_WINDOWS), transportMode:z.enum(TRANSPORT_MODES), transportFlexible:z.boolean(), nearbyMatchingEnabled:z.boolean().default(true), groupPreference:z.enum(GROUP_PREFERENCES).default('ANY_VERIFIED_PCM'),
}).strict();
export const cancellationSchema=z.object({reason:z.enum(CANCELLATION_REASONS).optional()}).strict();
