import { ApiError, body, config, db, fail, json, mutation, ready, requireReady, user } from '../../../../lib/beta-server';
import { accessToken, authorize, callback, spotifyRequest } from '../../../../lib/spotify-server';
import { approvedRecording } from '../../../../lib/beta-catalog';
type Context = {
    params: Promise<{
        action: string;
    }>;
};
export async function GET(request: Request, { params }: Context) {
    try {
        const u = await user();
        const { action } = await params;
        if (action === 'status') {
            const row = await db().prepare('SELECT expires_at FROM spotify_connections WHERE user_id=?').bind(u.userId).first();
            return json({ configured: ready(), connected: !!row, catalogOwner: config().CATALOG_OWNER_ID === u.userId, learningEnabled: config().SPOTIFY_LEARNING_APPROVED === 'true' });
        }
        if (action === 'token') {
            return json({ accessToken: await accessToken(u.userId) });
        }
        if (action === 'callback') {
            const url = new URL(request.url);
            const state = url.searchParams.get('state') || '';
            const cookie = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('sotto_oauth='))?.slice(12) || '';
            if (url.searchParams.has('error')) {
                await db().prepare('DELETE FROM oauth_pending WHERE user_id=?').bind(u.userId).run();
                return new Response(null, { status: 303, headers: { Location: '/beta?spotify=denied', 'Set-Cookie': 'sotto_oauth=; Path=/api/spotify; Max-Age=0; HttpOnly; SameSite=Lax; Secure', 'Cache-Control': 'no-store' } });
            }
            await callback(u.userId, state, url.searchParams.get('code') || '', cookie);
            return new Response(null, { status: 303, headers: { Location: '/beta?spotify=connected', 'Set-Cookie': 'sotto_oauth=; Path=/api/spotify; Max-Age=0; HttpOnly; SameSite=Lax; Secure', 'Cache-Control': 'no-store' } });
        }
        throw new ApiError(404, 'NOT_FOUND', 'Unknown Spotify endpoint.');
    }
    catch (e) {
        return fail(e);
    }
}
export async function POST(request: Request, { params }: Context) {
    try {
        mutation(request);
        const u = await user();
        const { action } = await params;
        if (action === 'connect') {
            const auth = await authorize(u.userId);
            const response = json({ url: auth.url });
            response.headers.set('Set-Cookie', `sotto_oauth=${auth.state}; Path=/api/spotify; Max-Age=600; HttpOnly; SameSite=Lax${config().SITE_ORIGIN?.startsWith('https:') ? '; Secure' : ''}`);
            return response;
        }
        if (action === 'disconnect') {
            await db().batch([db().prepare('DELETE FROM spotify_connections WHERE user_id=?').bind(u.userId), db().prepare('DELETE FROM oauth_pending WHERE user_id=?').bind(u.userId), db().prepare('DELETE FROM feed_sessions WHERE user_id=?').bind(u.userId)]);
            return json({ ok: true });
        }
        if (action === 'play') {
            requireReady();
            const p = await body(request);
            if (typeof p.deviceId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(p.deviceId))
                throw new ApiError(400, 'INVALID_DEVICE', 'Invalid Spotify device.');
            if (p.command === 'transfer') {
                await spotifyRequest(u.userId, '/me/player', { device_ids: [p.deviceId], play: false });
            }
            else if (p.command === 'play') {
                if (typeof p.recordingId !== 'string')
                    throw new ApiError(400, 'INVALID_RECORDING', 'Select a recording.');
                const recording = await approvedRecording(p.recordingId);
                await spotifyRequest(u.userId, `/me/player/play?device_id=${encodeURIComponent(p.deviceId)}`, { uris: [recording.spotifyUri] });
            }
            else
                throw new ApiError(400, 'INVALID_COMMAND', 'Invalid playback command.');
            return json({ ok: true });
        }
        throw new ApiError(404, 'NOT_FOUND', 'Unknown Spotify endpoint.');
    }
    catch (e) {
        return fail(e);
    }
}
