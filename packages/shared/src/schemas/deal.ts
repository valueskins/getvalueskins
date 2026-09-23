import { z } from 'zod';
import { dateStringSchema } from './common.js';

/**
 * Shared shape for creating and updating a draft deal. All fields are optional:
 * a draft is filled in incrementally (auto-save), and only publish requires
 * everything to be present — that readiness check belongs to the publish
 * endpoint (apps/api), not this request-body schema.
 */
const dealFieldsSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    budgetRupees: z.number().int().positive().optional(),
    applicationDeadline: dateStringSchema.optional(),
    contentUploadDeadline: dateStringSchema.optional(),
    dealDeadline: dateStringSchema.optional(),
  })
  .strict();

export const dealCreateSchema = dealFieldsSchema;
export type DealCreateInput = z.infer<typeof dealCreateSchema>;

export const dealUpdateSchema = dealFieldsSchema;
export type DealUpdateInput = z.infer<typeof dealUpdateSchema>;

/** POST /deals/:id/publish takes no request body. */
export const dealPublishSchema = z.object({}).strict();
export type DealPublishInput = z.infer<typeof dealPublishSchema>;
