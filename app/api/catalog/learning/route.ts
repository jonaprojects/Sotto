import { ApiError, body, db, fail, json, mutation, owner } from '../../../../lib/beta-server';
import { learning } from '../../../../lib/beta-catalog';
export async function GET() { try {
    await owner();
    const rows = await db().prepare('SELECT p.id,p.recording_id,p.version,p.rights_json,p.approved,r.title,r.artist FROM learning_packages p JOIN recordings r ON r.id=p.recording_id ORDER BY p.approved,p.version DESC LIMIT 100').all();
    return json({ packages: rows.results });
}
catch (e) {
    return fail(e);
} }
export async function POST(request: Request) { try {
    mutation(request);
    const u = await owner();
    const p = await body(request);
    if (typeof p.id !== 'string' || typeof p.approved !== 'boolean')
        throw new ApiError(400, 'INVALID_REVIEW', 'Choose a package and review outcome.');
    const row = await db().prepare('SELECT recording_id,rights_json FROM learning_packages WHERE id=?').bind(p.id).first<{
        recording_id: string;
        rights_json: string;
    }>();
    if (!row)
        throw new ApiError(404, 'NOT_FOUND', 'Learning package not found.');
    if (p.approved) {
        if (p.rightsVerified !== true || p.timingVerified !== true || p.recordingVerified !== true || typeof p.evidenceUrl !== 'string' || !/^https:\/\//.test(p.evidenceUrl) || !await learning(row.recording_id, true, p.id))
            throw new ApiError(400, 'INCOMPLETE_REVIEW', 'Verify source rights, recording match and timings before approval.');
        const rights = { ...JSON.parse(row.rights_json), review: { reviewer: u.userId, reviewedAt: Date.now(), evidenceUrl: p.evidenceUrl } };
        await db().prepare('UPDATE learning_packages SET approved=1,rights_json=? WHERE id=?').bind(JSON.stringify(rights), p.id).run();
    }
    else
        await db().prepare('UPDATE learning_packages SET approved=0 WHERE id=?').bind(p.id).run();
    return json({ ok: true });
}
catch (e) {
    return fail(e);
} }
