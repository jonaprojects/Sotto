import { ApiError, config, db, origin, requireReady } from './beta-server';
import { decrypt, digest, encrypt, nonce } from './beta-crypto';
export const scopes = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state';
type Tokens = {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
};
const tokenUrl = 'https://accounts.spotify.com/api/token';
export async function spotifyError(res: Response): Promise<never> { const data = await res.json().catch(() => ({})) as {
    reason?: string;
    error?: {
        reason?: string;
    };
}; if (res.status === 429) {
    const quota = data.reason === 'QUOTA_EXCEEDED' || data.error?.reason === 'QUOTA_EXCEEDED';
    throw new ApiError(429, quota ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED', quota ? 'Spotify API quota is exhausted. Try again after it resets.' : 'Spotify is rate limiting requests. Please wait.', quota ? undefined : Math.max(1, Number(res.headers.get('retry-after') || 30)));
} if (res.status === 401)
    throw new ApiError(401, 'SPOTIFY_RECONNECT', 'Reconnect your Spotify account.'); if (res.status === 403)
    throw new ApiError(403, 'SPOTIFY_ACCESS_DENIED', 'Spotify access was denied. Check Premium and the developer app allowlist.'); if (res.status === 404)
    throw new ApiError(404, 'SPOTIFY_DEVICE_UNAVAILABLE', 'Spotify player is unavailable. Reconnect the browser player.'); throw new ApiError(502, 'SPOTIFY_UNAVAILABLE', 'Spotify could not complete the request. Please retry.'); }
async function tokenRequest(params: URLSearchParams): Promise<Tokens> { const res = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params, signal: AbortSignal.timeout(10000) }); if (!res.ok) {
    if (res.status === 400)
        throw new ApiError(401, 'SPOTIFY_RECONNECT', 'Spotify authorization expired. Connect again.');
    return spotifyError(res);
} return res.json(); }
export async function authorize(userId: string) { requireReady(); const state = nonce(), verifier = nonce(); const stateHash = await digest(state); await db().batch([db().prepare('DELETE FROM oauth_pending WHERE user_id=? OR expires_at<?').bind(userId, Date.now()), db().prepare('INSERT INTO oauth_pending(state_hash,user_id,encrypted,expires_at) VALUES (?,?,?,?)').bind(stateHash, userId, await encrypt({ verifier }, config().SPOTIFY_TOKEN_KEY!, userId), Date.now() + 600000)]); const url = new URL('https://accounts.spotify.com/authorize'); url.search = new URLSearchParams({ client_id: config().SPOTIFY_CLIENT_ID!, response_type: 'code', redirect_uri: `${origin()}/api/spotify/callback`, scope: scopes, state, code_challenge_method: 'S256', code_challenge: await digest(verifier) }).toString(); return { url: url.toString(), state }; }
export async function callback(userId: string, state: string, code: string, cookieState: string) { requireReady(); if (!state || state !== cookieState || state.length > 100 || !code || code.length > 2048)
    throw new ApiError(400, 'INVALID_OAUTH_STATE', 'Spotify authorization could not be verified. Start again.'); const row = await db().prepare('DELETE FROM oauth_pending WHERE state_hash=? AND user_id=? AND expires_at>? RETURNING encrypted').bind(await digest(state), userId, Date.now()).first<{
    encrypted: string;
}>(); if (!row)
    throw new ApiError(400, 'INVALID_OAUTH_STATE', 'Spotify authorization expired or was already used. Start again.'); const { verifier } = await decrypt<{
    verifier: string;
}>(row.encrypted, config().SPOTIFY_TOKEN_KEY!, userId); const tokens = await tokenRequest(new URLSearchParams({ client_id: config().SPOTIFY_CLIENT_ID!, grant_type: 'authorization_code', code, redirect_uri: `${origin()}/api/spotify/callback`, code_verifier: verifier })); if (!tokens.access_token || !tokens.refresh_token || !scopes.split(' ').every(s => tokens.scope.split(' ').includes(s)))
    throw new ApiError(403, 'SPOTIFY_SCOPES', 'Required Spotify permissions were not granted.'); const profile = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } }); if (!profile.ok)
    return spotifyError(profile); const info = await profile.json() as {
    product?: string;
}; if (info.product && info.product !== 'premium')
    throw new ApiError(403, 'PREMIUM_REQUIRED', 'Spotify Premium is required for playback.'); await db().prepare('INSERT INTO spotify_connections(user_id,encrypted,expires_at,version) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted=excluded.encrypted,expires_at=excluded.expires_at,version=excluded.version,refresh_lock=NULL,lock_expires=0').bind(userId, await encrypt(tokens, config().SPOTIFY_TOKEN_KEY!, userId), Date.now() + tokens.expires_in * 1000, nonce()).run(); }
export async function accessToken(userId: string): Promise<string> {
    requireReady();
    for (let attempt = 0; attempt < 15; attempt++) {
        const row = await db().prepare('SELECT * FROM spotify_connections WHERE user_id=?').bind(userId).first<{
            encrypted: string;
            expires_at: number;
            version: string;
        }>();
        if (!row)
            throw new ApiError(401, 'SPOTIFY_RECONNECT', 'Connect Spotify to start listening.');
        const tokens = await decrypt<Tokens>(row.encrypted, config().SPOTIFY_TOKEN_KEY!, userId);
        if (row.expires_at > Date.now() + 60000)
            return tokens.access_token;
        const lock = nonce();
        const acquired = await db().prepare('UPDATE spotify_connections SET refresh_lock=?,lock_expires=? WHERE user_id=? AND version=? AND lock_expires<?').bind(lock, Date.now() + 15000, userId, row.version, Date.now()).run();
        if (!acquired.meta.changes) {
            await new Promise(r => setTimeout(r, 150));
            continue;
        }
        try {
            const next = await tokenRequest(new URLSearchParams({ client_id: config().SPOTIFY_CLIENT_ID!, grant_type: 'refresh_token', refresh_token: tokens.refresh_token }));
            next.refresh_token ||= tokens.refresh_token;
            next.scope ||= tokens.scope;
            const updated = await db().prepare('UPDATE spotify_connections SET encrypted=?,expires_at=?,version=?,refresh_lock=NULL,lock_expires=0 WHERE user_id=? AND version=? AND refresh_lock=?').bind(await encrypt(next, config().SPOTIFY_TOKEN_KEY!, userId), Date.now() + next.expires_in * 1000, nonce(), userId, row.version, lock).run();
            if (!updated.meta.changes)
                throw new ApiError(401, 'SPOTIFY_RECONNECT', 'Spotify connection changed. Connect again.');
            return next.access_token;
        }
        catch (e) {
            if (e instanceof ApiError && e.code === 'SPOTIFY_RECONNECT')
                await db().prepare('DELETE FROM spotify_connections WHERE user_id=? AND version=?').bind(userId, row.version).run();
            throw e;
        }
        finally {
            await db().prepare('UPDATE spotify_connections SET refresh_lock=NULL,lock_expires=0 WHERE user_id=? AND refresh_lock=?').bind(userId, lock).run();
        }
    }
    throw new ApiError(503, 'REFRESH_BUSY', 'Spotify is reconnecting. Please retry.');
}
export async function spotifyRequest(userId: string, path: string, value: unknown) { const token = await accessToken(userId); const res = await fetch(`https://api.spotify.com/v1${path}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); if (!res.ok)
    return spotifyError(res); }
