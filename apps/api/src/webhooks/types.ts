/** Receives the stored (redacted) payload. Throwing records the error and alerts the admin. */
export type WebhookHandler = (payload: unknown) => Promise<void>;

export type WebhookHandlerRegistry = Record<string, WebhookHandler>;
