import { ApiError, body, db, fail, json, mutation, owner } from '../../../../lib/beta-server';
import { genres, moods } from '../../../../lib/discovery';
export async function GET(request: Request) { try {
    await owner();
    const filter = new URL(request.url).searchParams.get('filter') || 'pending';
    if (!['pending', 'approved', 'rejected', 'unmatched', 'language'].includes(filter))
        throw new ApiError(400, 'INVALID_FILTER', 'Invalid review filter.');
    const clause = filter === 'unmatched' ? "m.match_status IS NULL OR m.match_status!='verified'" : filter === 'language' ? "c.language_status IS NULL OR c.language_status!='italian-throughout'" : filter === 'pending' ? "c.status IS NULL OR c.status='pending'" : 'c.status=?';
    const query = db().prepare(`SELECT r.*,m.spotify_uri,m.match_status,m.evidence_json AS match_evidence,c.status,c.language_status,c.evidence_json AS review_evidence FROM recordings r LEFT JOIN provider_mappings m ON m.recording_id=r.id LEFT JOIN catalog_reviews c ON c.recording_id=r.id WHERE ${clause} ORDER BY r.artist,r.title LIMIT 100`);
    const rows = await (filter === 'approved' || filter === 'rejected' ? query.bind(filter) : query).all();
    const counts = await db().prepare("SELECT COUNT(*) AS candidates,COUNT(CASE WHEN c.status='approved' AND c.language_status='italian-throughout' AND m.match_status='verified' THEN 1 END) AS approved,COUNT(DISTINCT CASE WHEN c.status='approved' THEN r.artist_id END) AS artists FROM recordings r LEFT JOIN catalog_reviews c ON c.recording_id=r.id LEFT JOIN provider_mappings m ON m.recording_id=r.id").first();
    return json({ recordings: rows.results, counts });
}
catch (e) {
    return fail(e);
} }
export async function POST(request: Request) {
    try {
        mutation(request);
        const u = await owner();
        const p = await body(request);
        if (typeof p.id !== 'string' || !['approved', 'rejected'].includes(p.status) || !['italian-throughout', 'mixed-language', 'dialect', 'instrumental', 'unknown'].includes(p.languageStatus) || !Array.isArray(p.sources) || !p.sources.length || p.sources.length > 10 || p.sources.some((s: unknown) => typeof s !== 'string' || !/^https:\/\//.test(s)) || typeof p.notes !== 'string' || p.notes.length > 2000)
            throw new ApiError(400, 'INVALID_REVIEW', 'Provide language evidence and a review decision.');
        const r = await db().prepare('SELECT id FROM recordings WHERE id=?').bind(p.id).first();
        if (!r)
            throw new ApiError(404, 'NOT_FOUND', 'Recording not found.');
        if (p.status === 'approved') {
            if (p.languageStatus !== 'italian-throughout' || p.listenedEntireRecording !== true || p.matchVerified !== true || !Array.isArray(p.genres) || !p.genres.length || p.genres.some((g: never) => !genres.includes(g)) || !Array.isArray(p.moods) || p.moods.some((m: never) => !moods.includes(m)) || ![true, false, null].includes(p.explicit))
                throw new ApiError(400, 'INCOMPLETE_REVIEW', 'Approval requires the exact recording, full Italian-language review and editorial tags.');
            const mapping = await db().prepare('SELECT spotify_uri FROM provider_mappings WHERE recording_id=?').bind(p.id).first<{
                spotify_uri: string;
            }>();
            if (!mapping || !/^spotify:track:[A-Za-z0-9]{22}$/.test(mapping.spotify_uri))
                throw new ApiError(400, 'UNMATCHED', 'Resolve the Spotify recording before approval.');
        }
        const statements = [db().prepare('INSERT INTO catalog_reviews(recording_id,status,language_status,reviewer,evidence_json,reviewed_at) VALUES (?,?,?,?,?,?) ON CONFLICT(recording_id) DO UPDATE SET status=excluded.status,language_status=excluded.language_status,reviewer=excluded.reviewer,evidence_json=excluded.evidence_json,reviewed_at=excluded.reviewed_at').bind(p.id, p.status, p.languageStatus, u.userId, JSON.stringify({ sources: p.sources, notes: p.notes, listenedEntireRecording: p.listenedEntireRecording === true }), Date.now())];
        if (p.status === 'approved')
            statements.push(db().prepare("UPDATE provider_mappings SET match_status='verified' WHERE recording_id=?").bind(p.id), db().prepare('UPDATE recordings SET genres_json=?,moods_json=?,explicit=? WHERE id=?').bind(JSON.stringify(p.genres), JSON.stringify(p.moods), p.explicit === null ? null : Number(p.explicit), p.id));
        await db().batch(statements);
        return json({ ok: true });
    }
    catch (e) {
        return fail(e);
    }
}
