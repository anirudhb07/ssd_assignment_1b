// Thin fetch wrapper. Every API error becomes an ApiError whose `message`
// is already written for the user (see api/src/lib/errors.js), so screens
// can show error.message directly.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', params, body } = {}) {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the API. Check that it is running.');
  }

  const data = await res.json().catch(() => null);
  // The dev server's proxy answers 502 (with no JSON body) when the api
  // container is stopped. The API itself never sends these without a body.
  if (!data && [502, 503, 504].includes(res.status)) {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the API. Check that it is running.');
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'HTTP_ERROR',
      data?.error?.message ?? `The request failed (HTTP ${res.status}).`,
    );
  }
  return data;
}
