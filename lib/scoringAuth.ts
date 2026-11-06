// Sends the logged-in association user's identity to the scoring backend.
//
// The user authenticates against the association backend (httpOnly session
// cookie), which the scoring backend never sees. So we ask that backend for a
// short-lived bearer token (GET /user/scoring-token, cookie auth)
// and attach it to every request aimed at the scoring backend. The scoring
// backend verifies it and scopes tournaments/matches to the user's association.
//
// Installed once by patching window.fetch, so the existing scoring call sites
// (`${NEXT_PUBLIC_SCORING_API_URL}/api/v1/...`) need no changes. Calls to any
// other origin (including this app's own backend) are left untouched.

// Same fallback the scoring call sites in this app use.
const SCORING_BASE = process.env.NEXT_PUBLIC_SCORING_API_URL || "http://localhost:5500";
// This app's own (association) backend issues the token.
const ASSOCIATION_BASE = process.env.NEXT_PUBLIC_Backend_URL;

// Refresh a little before the 1h expiry.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

let token: string | null = null;
let expiresAt = 0;
let inflight: Promise<string | null> | null = null;
let installed = false;

const requestToken = async (): Promise<string | null> => {
  try {
    const res = await fetch(`${ASSOCIATION_BASE}/user/scoring-token`, {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) {
      console.warn(`[scoringAuth] ${ASSOCIATION_BASE}/user/scoring-token returned ${res.status}; scoring calls will be sent without identity`);
      return null;
    }
    const data = await res.json();
    token = data.token ?? null;
    expiresAt = Date.now() + (Number(data.expiresIn) || 3600) * 1000;
    return token;
  } catch (err) {
    console.warn("[scoringAuth] could not reach the token endpoint:", err);
    return null;
  }
};

export const getScoringToken = async (force = false): Promise<string | null> => {
  if (!force && token && Date.now() < expiresAt - REFRESH_MARGIN_MS) return token;
  if (!inflight) {
    inflight = requestToken().finally(() => {
      inflight = null;
    });
  }
  return inflight;
};

type WrappedFetch = typeof fetch & { __scoringOriginal?: typeof fetch };

export const installScoringAuth = () => {
  if (installed || typeof window === "undefined" || !SCORING_BASE || !ASSOCIATION_BASE) return;
  installed = true;

  // If an earlier copy of this file already patched fetch (hot reload re-runs this module),
  // wrap the real fetch underneath it instead of stacking on top, so the newest logic wins.
  const current = window.fetch as WrappedFetch;
  const originalFetch = (current.__scoringOriginal ?? current).bind(window);

  const wrapped: WrappedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (!url.startsWith(SCORING_BASE)) return originalFetch(input, init);

    const send = (bearer: string | null) => {
      // Build a plain object, keeping the caller's header casing. Other fetch wrappers on the
      // page (e.g. the scorer app's root layout) copy headers with Object.assign({}, init.headers, ...):
      // that turns a Headers instance into {} (dropping Authorization), and re-cased keys
      // (content-type vs Content-Type) would be sent twice and merged into an unparsable value.
      const source = init?.headers ?? (input instanceof Request ? input.headers : undefined);
      const headers: Record<string, string> = {};
      if (source instanceof Headers) {
        source.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(source)) {
        for (const [key, value] of source) headers[key] = value;
      } else if (source) {
        Object.assign(headers, source);
      }
      // Leave an explicit Authorization header (legacy Firebase flow) alone.
      if (bearer && !Object.keys(headers).some((key) => key.toLowerCase() === "authorization")) {
        headers.Authorization = `Bearer ${bearer}`;
      }
      return originalFetch(input, { ...init, headers });
    };

    const response = await send(await getScoringToken());
    if (response.status !== 401) return response;

    // Token expired or rejected: get a fresh one and retry once.
    const fresh = await getScoringToken(true);
    return fresh ? send(fresh) : response;
  };

  wrapped.__scoringOriginal = current.__scoringOriginal ?? current;
  window.fetch = wrapped;
};
