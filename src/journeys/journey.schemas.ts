import { z } from 'zod';
import { JOURNEY_CHECKIN_TYPES, LOCATION_SHARE_AUDIENCES } from '../domain.js';
const nullableMethod = z.string().trim().min(3).max(160).optional().nullable();
export const contactSchema = z.object({ name: z.string().trim().min(2).max(100), relationship: z.string().trim().min(2).max(80), phone: nullableMethod.refine((v) => !v || /^\+?[0-9][0-9 ()-]{6,19}$/.test(v), 'Invalid phone number'), email: nullableMethod.refine((v) => !v || z.email().safeParse(v).success, 'Invalid email') }).strict().refine((v) => Boolean(v.phone || v.email), { message: 'Phone or email is required' });
export const prepareSchema = z.object({ expectedArrivalAt: z.iso.datetime().optional() }).strict();
export const checklistSchema = z.object({ completed: z.boolean() }).strict();
export const checkInSchema = z.object({ type: z.enum(JOURNEY_CHECKIN_TYPES).exclude(['STARTED', 'ARRIVED']), clientRequestId: z.string().uuid(), message: z.string().trim().max(300).optional(), includeLocation: z.boolean().default(false), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() }).strict().refine((v) => !v.includeLocation || (v.latitude !== undefined && v.longitude !== undefined), { message: 'Explicit location sharing requires latitude and longitude' }).refine((v) => v.includeLocation || (v.latitude === undefined && v.longitude === undefined), { message: 'Set includeLocation to share coordinates' });
export const arriveSchema = z.object({ clientRequestId: z.string().uuid() }).strict();
export const cancelSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();
export const shareSchema = z.object({ trustedContactId: z.string().uuid() }).strict();
export const locationSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), audience: z.enum(LOCATION_SHARE_AUDIENCES), consent: z.literal(true) }).strict();

