/**
 * Standard return type for public-facing server actions (contact, subscribe).
 *
 * Admin actions use a different pattern — they throw on error so the admin UI
 * can catch and display messages via try/catch. Public actions return a result
 * object to avoid exposing stack traces to unauthenticated users.
 */
export interface ActionResult {
  success: boolean;
  error?: string;
}
