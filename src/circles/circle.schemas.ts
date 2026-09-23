import { z } from 'zod';
import { SAFETY_REPORT_CATEGORIES } from '../domain.js';

export const messageQuerySchema = z.object({
  after: z.string().max(200).optional(),
  before: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).refine((value) => !(value.after && value.before), { message: 'Use after or before, not both' });
export const postMessageSchema = z.object({ body: z.string().trim().min(1).max(Math.min(2000, Number(process.env.CIRCLE_MESSAGE_MAX_LENGTH ?? 2000))) }).strict();
export const readMessageSchema = z.object({ messageId: z.string().uuid() }).strict();
export const meetupSchema = z.object({ areaLabel: z.string().trim().min(2).max(120), locationDescription: z.string().trim().min(3).max(500) }).strict();
export const meetupUpdateSchema = meetupSchema;
export const leaveSchema = z.object({ stillTravelling: z.literal(true) }).strict();
export const reportSchema = z.object({ reportedUserId: z.string().uuid().optional(), meetupId: z.string().uuid().optional(), category: z.enum(SAFETY_REPORT_CATEGORIES), details: z.string().trim().max(1000).optional() }).strict().refine((value) => Boolean(value.reportedUserId || value.meetupId), { message: 'A member or meetup must be reported' });
export const blockSchema = z.object({ userId: z.string().uuid() }).strict();
