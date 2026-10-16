/** Minimal black-on-white wrapper shared by every template (SPEC 8: "black text
 * on white for email-client readability", no images except the wordmark, which
 * doesn't exist yet - out of scope here). */
export function renderHtml(bodyHtml: string): string {
  return `<div style="background:#ffffff;color:#000000;font-family:Arial,sans-serif;padding:24px;max-width:600px">${bodyHtml}</div>`;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text before it goes into an HTML email body: titles, usernames and reasons come from users. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}
