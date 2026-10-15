// Razorpay Standard Checkout, as documented at
// https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/

export const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

export interface CheckoutSuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface CheckoutFailure {
  error: { code?: string; description?: string; reason?: string };
}

interface CheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  handler: (response: CheckoutSuccess) => void;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}

interface CheckoutInstance {
  open: () => void;
  on: (event: 'payment.failed', cb: (response: CheckoutFailure) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => CheckoutInstance;
  }
}

let loading: Promise<void> | null = null;

/** Adds the Checkout script once, on the first payment. Rejects when Razorpay cannot be reached. */
export function loadCheckout(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve() : reject(new Error('checkout missing')));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('checkout unreachable'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export type CheckoutOutcome =
  { kind: 'paid'; response: CheckoutSuccess } | { kind: 'dismissed'; lastFailure: string | null };

/**
 * Opens Checkout for one order and resolves when it is paid or closed. A
 * failed attempt keeps Checkout open so the brand can try again; its reason is
 * kept for the closed message.
 */
export function openCheckout(input: {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  description: string;
  prefill?: { name?: string; email?: string };
}): Promise<CheckoutOutcome> {
  const Razorpay = window.Razorpay;
  if (!Razorpay) return Promise.reject(new Error('checkout not loaded'));
  return new Promise((resolve) => {
    let lastFailure: string | null = null;
    let settled = false;
    const rzp = new Razorpay({
      key: input.keyId,
      amount: input.amountPaise,
      currency: input.currency,
      name: 'ValueSkins',
      description: input.description,
      order_id: input.orderId,
      prefill: input.prefill,
      theme: { color: '#D2340C' },
      handler: (response) => {
        settled = true;
        resolve({ kind: 'paid', response });
      },
      modal: {
        ondismiss: () => {
          if (!settled) resolve({ kind: 'dismissed', lastFailure });
        },
      },
    });
    rzp.on('payment.failed', (response) => {
      lastFailure = response.error.description ?? null;
    });
    rzp.open();
  });
}
