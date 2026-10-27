import { z } from 'zod';
import { REJECTION_REASONS, VERIFICATION_STATUSES } from '../domain.js';
export const profileSchema = z.object({ firstName: z.string().trim().min(1).max(80), lastNamePrivate: z.string().trim().min(1).max(80), displayName: z.string().trim().min(2).max(80) });
export const submitSchema = z.object({
  nyscIntakeId: z.string().uuid(),
  orientationCampId: z.string().uuid(),
  dateOfBirth: z.iso.date()
    .refine(value => value >= '0001-01-01', 'Enter a valid date of birth')
    .refine(value => value <= new Date().toISOString().slice(0, 10), 'Date of birth cannot be in the future'),
  matriculationNumber: z.string().trim().min(1, 'Matriculation number is required').max(80),
});
export type VerificationSubmission = z.infer<typeof submitSchema>;
export const reviewSchema = z.object({ expectedStatus: z.enum(VERIFICATION_STATUSES), reasonCode: z.enum(REJECTION_REASONS).optional(), userSafeReason: z.string().trim().max(500).optional(), reviewNotesPrivate: z.string().trim().max(2000).optional() });
export const queueSchema = z.object({ status: z.enum(VERIFICATION_STATUSES).optional() });
