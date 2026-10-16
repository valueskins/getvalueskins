import { logger } from '../../logging/logger.js';
import type { EmailContent } from '../types.js';

export interface ConsoleSendResult {
  ok: true;
  providerMessageId?: undefined;
}

/**
 * Prints the email instead of sending it (SPEC 8) - a startup guard forbids
 * this transport whenever NODE_ENV=production, which is the actual SPEC 20
 * risk scenario (shared log aggregation); a solo developer's own local
 * terminal isn't that, so this logs at `info` rather than `debug` - the
 * whole point of this transport is that a developer can read it without any
 * extra setup. Logged as a single plain message string, not structured
 * fields: the root logger's deepRedact walk would otherwise mangle any field
 * literally named "code" (the sign-in code) or a value that is exactly an
 * email address, which would defeat that purpose.
 */
export function sendConsole(to: string, content: EmailContent): Promise<ConsoleSendResult> {
  logger.info(`[email:console] to=${to} subject=${content.subject}\n${content.text}`);
  return Promise.resolve({ ok: true });
}
