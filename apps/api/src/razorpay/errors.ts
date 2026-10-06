export interface RazorpayErrorDetails {
  /** HTTP status, or null for a network failure. */
  status: number | null;
  /** Razorpay's error code, for example BAD_REQUEST_ERROR. */
  code: string | null;
  /** The request field Razorpay blames, if it names one. Field names only, never values. */
  field: string | null;
  description: string | null;
}

/**
 * A failed Razorpay call. The message is deliberately generic: Razorpay's
 * description can echo request data, so it is kept out of the message and is
 * non-enumerable, which stops the logger's error serializer from printing it.
 */
export class RazorpayApiError extends Error {
  readonly status: number | null;
  readonly razorpayCode: string | null;
  readonly field: string | null;
  declare readonly description: string | null;

  constructor(details: RazorpayErrorDetails) {
    super(
      `Razorpay request failed (${details.status === null ? 'network' : `HTTP ${details.status}`}${
        details.code ? `, ${details.code}` : ''
      })`,
    );
    this.name = 'RazorpayApiError';
    this.status = details.status;
    this.razorpayCode = details.code;
    this.field = details.field;
    Object.defineProperty(this, 'description', {
      value: details.description,
      enumerable: false,
    });
  }

  /** 4xx: Razorpay rejected the request itself; retrying cannot help. */
  get isRejection(): boolean {
    return this.status !== null && this.status >= 400 && this.status < 500;
  }
}
