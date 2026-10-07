import { createApiClient } from './ApiClient.js';

// the one shared client; AuthContext registers the handler for expired sessions
const handlers = { onUnauthorized: null };

export const api = createApiClient({ onUnauthorized: (err) => handlers.onUnauthorized && handlers.onUnauthorized(err) });

export function setUnauthorizedHandler(fn) {
  handlers.onUnauthorized = fn;
}
