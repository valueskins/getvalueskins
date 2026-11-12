/**
 * What a transport reports. A failure carries the provider's own error name and HTTP status when
 * it has them, so `deliver` can tell a limit or an outage from an error that retrying elsewhere
 * would not fix. Never put an address or a body in `error`: it is stored and shown to administrators.
 */
export type TransportResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; error: string; errorName?: string; status?: number };

export interface TransportOptions {
  cc?: string[];
  attachments?: { filename: string; content: Buffer }[];
}
