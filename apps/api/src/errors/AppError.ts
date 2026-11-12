export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  /**
   * Technical detail for the admin alert and the webhook event row (ids, amounts, a provider's
   * status). Never put in a response: users get only `message`, in plain words (SPEC 16).
   */
  readonly internal?: string;
  /**
   * True when the admin has already been told about this error by the code that raised it, so the
   * webhook processor must not send its generic alert as well (one alert per problem).
   */
  readonly adminAlerted: boolean;

  constructor(
    code: string,
    status: number,
    message: string,
    details?: unknown,
    internal?: string,
    options: { adminAlerted?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.internal = internal;
    this.adminAlerted = options.adminAlerted ?? false;
  }
}
