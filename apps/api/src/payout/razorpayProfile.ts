/**
 * profile.category / profile.subcategory for a creator's linked account
 * (SPEC 7.2). Both values are listed in Razorpay's Route integration guide.
 * Razorpay's full allowed lists could not be retrieved when this was written,
 * so confirm them in test mode; if Razorpay rejects them, change them here.
 */
export const ROUTE_PROFILE = {
  category: 'services',
  subcategory: 'ad_and_marketing',
} as const;

/**
 * Razorpay requires profile.addresses.registered, but SPEC 7.2 collects no
 * address. Only the country is sent; add street, city, state and PIN to the
 * payout form if Razorpay rejects this.
 */
export const ROUTE_REGISTERED_ADDRESS = { country: 'IN' } as const;
