/**
 * Shared auth for the /capture/* viewer-bus calls.
 *
 * saigalab.js exposes window.__ASKAI_GET_ID_TOKEN__, which returns the current
 * Firebase ID token (auto-refreshed near expiry). The Chainlit backend verifies
 * it to a uid and keys EVERY viewer channel (action queue + viewport screenshots)
 * by that uid, so two concurrent users never share the old global 'default' bus.
 *
 * Returns {} when no token is available yet (the getter not injected, or no
 * session): the caller still fires, the backend 401s, and the push is retried on
 * the next tick — graceful, since these channels poll/push continuously.
 */
export async function captureAuthHeaders(): Promise<Record<string, string>> {
  try {
    const getter = (window as any).__ASKAI_GET_ID_TOKEN__;
    if (typeof getter === 'function') {
      const token = await getter();
      if (token) {
        return { Authorization: `Bearer ${token}` };
      }
    }
  } catch (_) {
    /* fall through to no-auth; the backend will reject with 401 */
  }
  return {};
}
