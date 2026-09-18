import { withRequestDeadline } from '../_shared/request-deadline.ts';
import { PUSH_OPERATION_TIMEOUT_MS } from '../_shared/web-push-delivery.ts';

export function createNotificationFetch(fetcher: typeof fetch = fetch): typeof fetch {
  return (input, init = {}) => withRequestDeadline(async (signal) => {
    const response = await fetcher(input, { ...init, signal });
    // Consume the SDK response inside the same deadline as its headers.
    const body = response.body === null ? null : await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }, {
    timeoutMs: PUSH_OPERATION_TIMEOUT_MS,
    signal: init.signal ?? (input instanceof Request ? input.signal : undefined),
  });
}
