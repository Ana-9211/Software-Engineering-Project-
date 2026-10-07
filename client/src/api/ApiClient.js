// ApiClient (FM-11, interface I-01): cookies are sent with every request, the CSRF token is added to every
// state-changing request, and error bodies are turned into ApiError objects.
export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  // field-level messages for forms: { fieldName: 'message' }
  fieldErrors() {
    const out = {};
    for (const d of this.details || []) if (d.field && !out[d.field]) out[d.field] = d.issue;
    return out;
  }
}

const SAFE = new Set(['GET', 'HEAD']);

export function createApiClient({ fetchFn = (...a) => fetch(...a), onUnauthorized } = {}) {
  let csrfToken = null;

  async function loadCsrf(force = false) {
    if (!csrfToken || force) {
      const res = await fetchFn('/api/auth/csrf-token', { credentials: 'same-origin' });
      csrfToken = (await res.json()).csrfToken;
    }
    return csrfToken;
  }

  function buildUrl(path, query) {
    if (!query) return path;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    const text = params.toString();
    return text ? `${path}?${text}` : path;
  }

  async function request(method, path, { query, body, form, retried = false } = {}) {
    const headers = { Accept: 'application/json' };
    const init = { method, credentials: 'same-origin', headers };
    if (!SAFE.has(method)) headers['X-CSRF-Token'] = await loadCsrf();
    if (form) {
      init.body = form; // the browser sets the multipart boundary
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetchFn(buildUrl(path, query), init);
    if (res.status === 204) return null;
    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json() : null;
    if (res.ok) return data;

    const err = data && data.error ? data.error : { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' };
    // the CSRF cookie may have expired or been replaced: fetch a fresh token once and try again
    if (res.status === 403 && err.code === 'CSRF_INVALID' && !retried) {
      await loadCsrf(true);
      return request(method, path, { query, body, form, retried: true });
    }
    const apiError = new ApiError(res.status, err.code, err.message, err.details);
    if (res.status === 401 && err.code === 'UNAUTHENTICATED' && onUnauthorized) onUnauthorized(apiError);
    throw apiError;
  }

  return {
    get: (path, query) => request('GET', path, { query }),
    post: (path, body) => request('POST', path, { body }),
    put: (path, body) => request('PUT', path, { body }),
    patch: (path, body) => request('PATCH', path, { body }),
    delete: (path) => request('DELETE', path, {}),
    upload: (path, form) => request('POST', path, { form }),
    resetCsrf: () => { csrfToken = null; },
  };
}
