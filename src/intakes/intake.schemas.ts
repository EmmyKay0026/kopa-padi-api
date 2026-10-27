import { z } from 'zod';

export const createIntakeSchema = z.object({
  serviceYear: z.string().regex(/^20\d{2}$/, 'Choose a valid service year.'),
  batch: z.enum(['Batch A', 'Batch B', 'Batch C']),
  stream: z.enum(['Stream 1', 'Stream 2']),
  orientationStartDate: z.iso.date().nullable().default(null),
  orientationEndDate: z.iso.date().nullable().default(null),
}).strict().refine((value) => !value.orientationStartDate || !value.orientationEndDate || value.orientationStartDate <= value.orientationEndDate, {
  message: 'Orientation end date must be on or after the start date.', path: ['orientationEndDate'],
});

export const changeActiveIntakeSchema = z.object({ expectedActiveId: z.string().uuid().nullable() }).strict();
