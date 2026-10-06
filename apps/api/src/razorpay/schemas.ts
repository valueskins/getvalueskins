import { z } from 'zod';

// Razorpay's responses contain personal data (the product configuration
// returns the full bank account number, the linked account returns the full
// PAN). These schemas keep only the fields we use; zod strips the rest, so
// nothing else survives the client boundary.

const rawRequirementSchema = z.object({
  field_reference: z.string(),
  reason_code: z.string(),
  status: z.string().optional(),
});

export type RawRequirement = z.infer<typeof rawRequirementSchema>;

export const linkedAccountSchema = z.object({
  id: z.string(),
  // An empty notes object comes back as []; a filled one as an object.
  notes: z.unknown().optional(),
});

export const stakeholderSchema = z.object({ id: z.string() });

export const routeProductSchema = z.object({
  id: z.string(),
  activation_status: z.string(),
  requirements: z.array(rawRequirementSchema).optional(),
});

export type RouteProduct = z.infer<typeof routeProductSchema>;

export const razorpayErrorBodySchema = z.object({
  error: z
    .object({
      code: z.string().optional(),
      description: z.string().optional(),
      field: z.string().nullable().optional(),
    })
    .optional(),
});

/** POST /api/webhooks/razorpay body for the product.route.* status events. */
export const productStatusEventSchema = z.object({
  event: z.string(),
  account_id: z.string().optional(),
  created_at: z.number(),
  payload: z.object({
    merchant_product: z.object({
      entity: z.object({
        id: z.string(),
        merchant_id: z.string(),
        activation_status: z.string(),
        requirements: z.array(rawRequirementSchema).optional(),
      }),
    }),
  }),
});

export type ProductStatusEvent = z.infer<typeof productStatusEventSchema>;
