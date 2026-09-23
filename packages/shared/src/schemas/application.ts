import { z } from 'zod';

/** POST /deals/:id/applications — no negotiation, no message, no body fields. */
export const applicationCreateSchema = z.object({}).strict();
export type ApplicationCreateInput = z.infer<typeof applicationCreateSchema>;

/** POST /applications/:id/confirm — no body fields. */
export const applicationConfirmSchema = z.object({}).strict();
export type ApplicationConfirmInput = z.infer<typeof applicationConfirmSchema>;
