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

// ---- Payments (SPEC 7.3). Payment entities carry customer details (email,
// contact, VPA, card); these schemas keep only ids, amounts, statuses and
// failure reasons.

const rawTransferErrorSchema = z
  .object({
    code: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

/** A Route transfer, from the Orders response, the payment's transfers list, or a webhook. */
export const razorpayTransferSchema = z.object({
  id: z.string(),
  source: z.string().nullable().optional(),
  recipient: z.string().nullable().optional(),
  amount: z.number().int(),
  currency: z.string().optional(),
  status: z.string(),
  fees: z.number().nullable().optional(),
  tax: z.number().nullable().optional(),
  error: rawTransferErrorSchema,
  processed_at: z.number().nullable().optional(),
});

export type RazorpayTransfer = z.infer<typeof razorpayTransferSchema>;

export const razorpayOrderSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  amount: z.number().int(),
  currency: z.string(),
  transfers: z.array(razorpayTransferSchema).optional(),
});

export type RazorpayOrder = z.infer<typeof razorpayOrderSchema>;

export const razorpayPaymentSchema = z.object({
  id: z.string(),
  order_id: z.string().nullable(),
  status: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  error_code: z.string().nullable().optional(),
  error_description: z.string().nullable().optional(),
  // Razorpay's fee and the tax on it, in paise. ValueSkins absorbs them (SPEC 4.3, 17).
  fee: z.number().int().nullable().optional(),
  tax: z.number().int().nullable().optional(),
});

export type RazorpayPayment = z.infer<typeof razorpayPaymentSchema>;

export const razorpayTransferListSchema = z.object({
  items: z.array(razorpayTransferSchema),
});

const paymentEntitySchema = z.object({
  id: z.string(),
  order_id: z.string().nullable().optional(),
  error_code: z.string().nullable().optional(),
  error_description: z.string().nullable().optional(),
});

/** payment.captured and payment.failed webhook bodies. */
export const paymentEventSchema = z.object({
  event: z.string(),
  payload: z.object({ payment: z.object({ entity: paymentEntitySchema }) }),
});

/** order.paid carries both the order and the payment entity. */
export const orderPaidEventSchema = z.object({
  event: z.string(),
  payload: z.object({
    order: z.object({ entity: z.object({ id: z.string() }) }),
    payment: z.object({ entity: paymentEntitySchema }),
  }),
});

/** transfer.processed, transfer.failed and transfer.reversed webhook bodies. */
export const transferEventSchema = z.object({
  event: z.string(),
  payload: z.object({ transfer: z.object({ entity: razorpayTransferSchema }) }),
});
