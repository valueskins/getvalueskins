import { z } from 'zod';

// Razorpay's responses can contain personal data (the payer's email, contact and VPA). These
// schemas keep only the fields we use; zod strips the rest, so nothing else survives the client
// boundary.

export const razorpayErrorBodySchema = z.object({
  error: z
    .object({
      code: z.string().optional(),
      description: z.string().optional(),
      field: z.string().nullable().optional(),
    })
    .optional(),
});

// ---- Payments (SPEC 7.3). Payment entities carry customer details (email,
// contact, VPA, card); these schemas keep only ids, amounts, statuses and
// failure reasons.

export const razorpayOrderSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  amount: z.number().int(),
  currency: z.string(),
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
