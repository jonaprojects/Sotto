import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
export type BetaConfig = {
    LOCAL_TRANSLATION_URL?: string;
    LRCLIB_ENABLED?: string;
    SPOTIFY_CLIENT_ID?: string;
    SPOTIFY_TOKEN_KEY?: string;
    SPOTIFY_POLICY_APPROVED?: string;
    SPOTIFY_LEARNING_APPROVED?: string;
    SPOTIFY_BETA_ENABLED?: string;
    CATALOG_OWNER_ID?: string;
    SITE_ORIGIN?: string;
};
export const config = () => env as typeof env & BetaConfig;
export class ApiError extends Error {
    constructor(public status: number, public code: string, message: string, public retryAfter?: number) { super(message); }
}
export const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export function fail(e: unknown) { if (e instanceof ApiError)
    return new Response(JSON.stringify({ error: e.message, code: e.code }), { status: e.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(e.retryAfter ? { 'Retry-After': String(e.retryAfter) } : {}) } }); return json({ error: 'Service unavailable. Please retry.', code: 'SERVICE_UNAVAILABLE' }, 503); }
export function db() { if (!env.DB)
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'The beta database is not configured.'); return env.DB; }
export async function user() { const u = await getChatGPTUser(); if (!u)
    throw new ApiError(401, 'SIGN_IN_REQUIRED', 'Sign in with ChatGPT first.'); return u; }
export async function owner() { const u = await user(); if (!config().CATALOG_OWNER_ID || u.userId !== config().CATALOG_OWNER_ID)
    throw new ApiError(403, 'OWNER_ONLY', 'Catalog review is available to the configured owner only.'); return u; }
export function origin() { const value = config().SITE_ORIGIN; if (!value)
    throw new ApiError(503, 'SETUP_REQUIRED', 'Configure the Site origin before connecting Spotify.'); const url = new URL(value); if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1'))
    throw new ApiError(503, 'SETUP_REQUIRED', 'The Site origin must use HTTPS.'); return url.origin; }
export function mutation(request: Request) { const requestOrigin = new URL(request.url).origin; if (request.headers.get('origin') !== requestOrigin)
    throw new ApiError(403, 'INVALID_ORIGIN', 'Invalid request origin.'); }
export function ready() { const c = config(); return !!(c.SPOTIFY_CLIENT_ID && c.SPOTIFY_TOKEN_KEY && c.SITE_ORIGIN && c.SPOTIFY_POLICY_APPROVED === 'true' && c.SPOTIFY_BETA_ENABLED === 'true'); }
export function requireReady() { if (!ready())
    throw new ApiError(503, 'SETUP_REQUIRED', 'Spotify beta setup and provider suitability checks are still required.'); }
export async function body(request: Request) { if (Number(request.headers.get('content-length') || 0) > 262144)
    throw new ApiError(413, 'TOO_LARGE', 'Request is too large.'); try {
    const text = await request.text();
    if (text.length > 262144)
        throw new ApiError(413, 'TOO_LARGE', 'Request is too large.');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new ApiError(400, "INVALID_JSON", "Expected an object request body.");
    return parsed;
}
catch (e) {
    if (e instanceof ApiError)
        throw e;
    throw new ApiError(400, 'INVALID_JSON', 'Invalid request body.');
} }
