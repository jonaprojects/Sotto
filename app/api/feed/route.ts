import { ApiError, config, db, fail, json, user } from '../../../lib/beta-server';
import { catalog, preferences } from '../../../lib/beta-catalog';
import { discoveryOrder, eligible } from '../../../lib/discovery';
import { nonce, signature, verify } from '../../../lib/beta-crypto';
export async function GET(request: Request) {
    try {
        const u = await user();
        const p = await preferences(u.userId);
        const records = await catalog();
        const cursor = new URL(request.url).searchParams.get('cursor');
        const secret = config().SPOTIFY_TOKEN_KEY;
        if (!secret)
            throw new ApiError(503, 'SETUP_REQUIRED', 'The beta is not configured yet.');
        let id: string, position = 0, order: string[];
        if (cursor) {
            if (cursor.length > 250)
                throw new ApiError(400, 'INVALID_CURSOR', 'Invalid feed cursor.');
            const [session, offset, sig] = cursor.split('.');
            if (!session || !/^\d+$/.test(offset) || !sig || !await verify(`${u.userId}:${session}:${offset}`, sig, secret))
                throw new ApiError(400, 'INVALID_CURSOR', 'Invalid feed cursor.');
            const row = await db().prepare('SELECT order_json,preference_revision FROM feed_sessions WHERE id=? AND user_id=? AND expires_at>?').bind(session, u.userId, Date.now()).first<{
                order_json: string;
                preference_revision: number;
            }>();
            if (!row || row.preference_revision !== p.revision)
                throw new ApiError(409, 'FEED_EXPIRED', 'Your feed changed. Start a new session.');
            id = session;
            position = Number(offset);
            order = JSON.parse(row.order_json);
            if (position > order.length)
                throw new ApiError(400, 'INVALID_CURSOR', 'Invalid feed position.');
        }
        else {
            id = nonce();
            order = discoveryOrder(records, p.value, id);
            await db().batch([db().prepare('DELETE FROM feed_sessions WHERE expires_at<?').bind(Date.now()), db().prepare('INSERT INTO feed_sessions(id,user_id,order_json,preference_revision,expires_at) VALUES (?,?,?,?,?)').bind(id, u.userId, JSON.stringify(order), p.revision, Date.now() + 86400000)]);
        }
        const byId = new Map(records.filter(r => eligible(r, p.value)).map(r => [r.id, r]));
        const batch = [];
        while (position < order.length && batch.length < 20) {
            const r = byId.get(order[position++]);
            if (r)
                batch.push(r);
        }
        const next = position < order.length ? `${id}.${position}.${await signature(`${u.userId}:${id}:${position}`, secret)}` : null;
        return json({ recordings: batch, cursor: next, exhausted: !next, total: order.length });
    }
    catch (e) {
        return fail(e);
    }
}
