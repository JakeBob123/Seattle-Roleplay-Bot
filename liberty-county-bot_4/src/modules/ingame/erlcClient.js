/**
 * Official ER:LC Private Server API client (v2).
 * Docs: https://apidocs.erlc.gg/  |  Spec: https://api.erlc.gg/internal/docs/apispec.v2.json
 *
 * Endpoints (this is the ENTIRE v2 surface as of writing — the official API
 * is much narrower than a generic "everything" wishlist. There is no
 * separate bans/teams/callsigns/plates endpoint; all of that is embedded in
 * the single GET /v2/server response via optional query flags):
 *
 *   GET  /v2/server            -> status + optional Players/Staff/JoinLogs/
 *                                  Queue/KillLogs/CommandLogs/ModCalls/
 *                                  EmergencyCalls/Vehicles
 *   POST /v2/server/command    -> execute an in-game command as virtual
 *                                  server management (rate-limited to
 *                                  1 request / 5s per server-key)
 *
 * Auth: `server-key` header on every request (required). The `Authorization`
 * header is only for registered public apps used across many servers — not
 * needed for a single-server integration like this one.
 */

const BASE_URL = 'https://api.erlc.gg';
const API_VERSION = 'v2';
const DEFAULT_TIMEOUT_MS = 10_000;

// Official error code table (https://apidocs.erlc.gg/error-codes.md)
const ERROR_MESSAGES = {
  0: 'Unknown error from the ER:LC API. If this persists, it may need an API ticket with PRC.',
  1001: 'Error communicating with Roblox or the in-game private server.',
  1002: 'Internal ER:LC system error.',
  2000: 'No server key was provided.',
  2001: 'The server key is incorrectly formatted.',
  2002: 'The server key is invalid or expired.',
  2003: 'Invalid global API key.',
  2004: 'This server key is currently banned from the API.',
  3001: 'No valid command was provided.',
  3002: 'The server is currently offline (no players in it).',
  4000: 'Not authorized to perform this action on this server.',
  4001: 'Being rate limited by the ER:LC API.',
  4002: 'That command is restricted.',
  4003: 'That message is prohibited.',
  9998: 'The requested resource is restricted.',
  9999: 'The in-game ER:LC module is out of date. Kick all players and retry.',
};

class ErlcApiError extends Error {
  constructor(message, { status, code, commandId, retryAfter } = {}) {
    super(message);
    this.name = 'ErlcApiError';
    this.status = status;
    this.code = code;
    this.commandId = commandId;
    this.retryAfter = retryAfter;
  }
}

function friendlyMessage(code, fallback) {
  return ERROR_MESSAGES[code] || fallback || 'Unknown ER:LC API error.';
}

async function request(path, { method = 'GET', serverKey, body, timeoutMs = DEFAULT_TIMEOUT_MS, _retried = false }) {
  if (!serverKey) throw new ErlcApiError('No ER:LC server key configured.', { code: 2000 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'server-key': serverKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ErlcApiError(`Request to ER:LC API timed out after ${timeoutMs}ms.`, { code: 'timeout' });
    }
    throw new ErlcApiError(`Network error contacting ER:LC API: ${err.message}`, { code: 'network' });
  } finally {
    clearTimeout(timeout);
  }

  const rateLimit = {
    bucket: res.headers.get('x-ratelimit-bucket'),
    limit: Number(res.headers.get('x-ratelimit-limit')) || null,
    remaining: Number(res.headers.get('x-ratelimit-remaining')) || null,
    reset: Number(res.headers.get('x-ratelimit-reset')) || null,
  };

  let json = null;
  try {
    json = await res.json();
  } catch {
    // some responses (e.g. bare 403) may not have a JSON body
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after')) || Number(json?.retry_after) || 5;
    // Per official docs: on 429, the caller MUST stop immediately and wait
    // the full Retry-After — retrying here would risk an invalid-request
    // block, so we surface it instead of silently looping.
    throw new ErlcApiError(friendlyMessage(4001, 'Rate limited by ER:LC API.'), {
      status: 429,
      code: json?.code ?? 4001,
      retryAfter,
    });
  }

  if (res.status === 403) {
    throw new ErlcApiError(friendlyMessage(json?.code ?? 2002, 'Unauthorized — check your server key.'), {
      status: 403,
      code: json?.code ?? 2002,
    });
  }

  if (res.status >= 500) {
    // One automatic retry on genuine server-side failure only (not on 429).
    if (!_retried) {
      return request(path, { method, serverKey, body, timeoutMs, _retried: true });
    }
    throw new ErlcApiError(friendlyMessage(json?.code, json?.error || json?.message || 'ER:LC API server error.'), {
      status: res.status,
      code: json?.code,
      commandId: json?.commandId,
    });
  }

  if (res.status === 400 || res.status === 422) {
    throw new ErlcApiError(friendlyMessage(json?.code, json?.message || 'Bad request to ER:LC API.'), {
      status: res.status,
      code: json?.code,
      commandId: json?.commandId,
    });
  }

  if (!res.ok) {
    throw new ErlcApiError(friendlyMessage(json?.code, json?.message || `ER:LC API returned ${res.status}.`), {
      status: res.status,
      code: json?.code,
    });
  }

  return { data: json, rateLimit };
}

/**
 * @param {string} serverKey
 * @param {object} flags - which optional fields to include, e.g.
 *   { Players: true, Staff: true, EmergencyCalls: true }
 */
async function getServerInfo(serverKey, flags = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(flags)) {
    if (value) params.set(key, 'true');
  }
  const qs = params.toString();
  return request(`/${API_VERSION}/server${qs ? `?${qs}` : ''}`, { serverKey });
}

async function runCommand(serverKey, command) {
  return request(`/${API_VERSION}/server/command`, { method: 'POST', serverKey, body: { command } });
}

/** Convenience: only used to validate a key during setup / test-connection. */
async function testConnection(serverKey) {
  const { data } = await getServerInfo(serverKey, {});
  return data; // throws ErlcApiError on failure
}

module.exports = { BASE_URL, API_VERSION, ErlcApiError, getServerInfo, runCommand, testConnection };
