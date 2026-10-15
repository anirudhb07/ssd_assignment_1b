import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client.js';

const reply = (status, body, contentType = 'application/json') =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status, headers: { 'Content-Type': contentType } }));

afterEach(() => vi.restoreAllMocks());

describe('api client errors', () => {
  it('passes on the message the API wrote', async () => {
    reply(402, JSON.stringify({ error: { code: 'INSUFFICIENT_BALANCE', message: 'Not enough money in the wallet.' } }));
    await expect(api('/checkout')).rejects.toMatchObject({ status: 402, code: 'INSUFFICIENT_BALANCE', message: 'Not enough money in the wallet.' });
  });

  // Issue #25: the dev server's proxy answers 502 with a text body when the
  // api container is stopped. Say that, not "The request failed (HTTP 502)".
  it('says the API is unreachable when the proxy answers 502', async () => {
    reply(502, '', 'text/plain');
    await expect(api('/restaurants')).rejects.toMatchObject({ code: 'NETWORK', message: 'Cannot reach the API. Check that it is running.' });
  });

  it('says the API is unreachable when fetch itself fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api('/restaurants')).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('keeps the status for other errors with no JSON body', async () => {
    reply(500, 'oops', 'text/plain');
    await expect(api('/restaurants')).rejects.toMatchObject({ status: 500, message: 'The request failed (HTTP 500).' });
  });
});
