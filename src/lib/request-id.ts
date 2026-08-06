/**
 * Request-ID propagation via AsyncLocalStorage.
 *
 * Architecture note (critical): Next.js 15 middleware and the downstream
 * handler (RSC, server action, route handler) execute as SEPARATE async
 * contexts in Amplify Hosting's Lambda compute. An ALS store opened in
 * middleware does NOT survive into the handler.
 *
 * The fix is two-part:
 *   1. Middleware stamps a header `x-internal-request-id` on the outgoing
 *      response (for the client to see) and on the request headers it
 *      forwards (for the handler to read).
 *   2. Handlers / server actions wrap their body in `withRequestContext()`
 *      which reads the header from `headers()` and opens a fresh ALS
 *      store. All `log.*()` calls inside the body inherit the request ID.
 *
 * Why ALS at all, given the header is already available: the alternative
 * is threading the request ID as an explicit argument through every call
 * depth, which is noisy and easy to forget. ALS + one-line wrapper keeps
 * the call sites clean at the cost of one boilerplate line per handler.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";

interface RequestContext {
  requestId: string;
}

const als = new AsyncLocalStorage<RequestContext>();

/**
 * Wrap the body of a server action / route handler / RSC page so that
 * every `log.*()` call inside inherits the request ID from the incoming
 * header (or a fresh UUID if the header is absent — e.g. a direct
 * invocation bypassing middleware).
 *
 * Usage:
 *   export async function GET(req) {
 *     return withRequestContext(async () => {
 *       // ... log.*(), db calls, etc.
 *     });
 *   }
 *
 * Server actions:
 *   "use server";
 *   export async function updateMember(data) {
 *     return withRequestContext(async () => { ... });
 *   }
 */
export async function withRequestContext<T>(fn: () => Promise<T> | T): Promise<T> {
  const hdrs = await headers();
  const requestId = hdrs.get("x-internal-request-id") ?? crypto.randomUUID();
  return als.run({ requestId }, async () => fn());
}

/**
 * Read the current request ID from ALS. Returns `undefined` outside
 * a `withRequestContext` scope — callers (like `log.ts`) must handle
 * this (we emit a log line with `requestId: null` rather than throw).
 */
export function getRequestId(): string | undefined {
  return als.getStore()?.requestId;
}
