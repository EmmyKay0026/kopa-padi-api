import { z } from 'zod';
export const bugReportSchema = z.object({
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(4000),
}).strict();
export const bugStatusSchema = z.object({ status: z.enum(['OPEN', 'RESOLVED']) }).strict();
export const testModeEnabled = () => process.env.TEST_MODE === 'true';
