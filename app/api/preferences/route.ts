import { ApiError, body, db, fail, json, mutation, user } from '../../../lib/beta-server';
import { preferences } from '../../../lib/beta-catalog';
import { validPreferences } from '../../../lib/discovery';
export async function GET() { try {
    return json(await preferences((await user()).userId));
}
catch (e) {
    return fail(e);
} }
export async function POST(request: Request) { try {
    mutation(request);
    const u = await user();
    const p = await body(request);
    if (!validPreferences(p))
        throw new ApiError(400, 'INVALID_PREFERENCES', 'Choose up to three styles and valid moods.');
    await db().prepare('INSERT INTO user_preferences(user_id,json,revision) VALUES (?,?,1) ON CONFLICT(user_id) DO UPDATE SET json=excluded.json,revision=user_preferences.revision+1').bind(u.userId, JSON.stringify(p)).run();
    return json({ ok: true });
}
catch (e) {
    return fail(e);
} }
