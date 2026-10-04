import { ApiError, config, db } from './beta-server';
import { defaultPreferences, validLearning, type LearningPackage, type Preferences, type Recording, type Sense } from './discovery';
type Row = {
    id: string;
    title: string;
    artist: string;
    artist_id: string;
    duration_ms: number;
    genres_json: string;
    moods_json: string;
    explicit: number | null;
    spotify_uri: string;
    metadata_json: string;
    match_status: string;
    status: string;
    language_status: string;
};
export async function preferences(userId: string) { const row = await db().prepare('SELECT json,revision FROM user_preferences WHERE user_id=?').bind(userId).first<{
    json: string;
    revision: number;
}>(); return { value: row ? JSON.parse(row.json) as Preferences : defaultPreferences, revision: row?.revision || 0 }; }
export async function learning(recordingId: string, forReview = false, packageId?: string): Promise<LearningPackage | null> {
    if (!forReview && config().SPOTIFY_LEARNING_APPROVED !== 'true')
        return null;
    const record = await db().prepare('SELECT duration_ms FROM recordings WHERE id=?').bind(recordingId).first<{
        duration_ms: number;
    }>();
    if (!record)
        return null;
    const packages = await db().prepare(`SELECT * FROM learning_packages WHERE recording_id=? ${forReview ? '' : 'AND approved=1'} ${packageId ? 'AND id=?' : ''} ORDER BY version DESC`).bind(...(packageId ? [recordingId, packageId] : [recordingId])).all<{
        id: string;
        version: number;
        rights_json: string;
    }>();
    for (const p of packages.results) {
        const ls = await db().prepare('SELECT l.id,l.text,t.start_ms,t.end_ms,e.text AS translation FROM lyric_lines l JOIN lyric_timings t ON t.line_id=l.id JOIN line_translations e ON e.line_id=l.id WHERE l.package_id=? ORDER BY l.ordinal').bind(p.id).all<{
            id: string;
            text: string;
            start_ms: number;
            end_ms: number;
            translation: string;
        }>();
        const lines = [];
        for (const l of ls.results) {
            const ts = await db().prepare('SELECT o.surface,s.id,s.text,s.translation,s.lemma,s.grammar FROM word_occurrences o LEFT JOIN word_senses s ON s.id=o.sense_id WHERE o.line_id=? ORDER BY o.ordinal').bind(l.id).all<Sense & {
                surface: string;
            }>();
            lines.push({ id: l.id, text: l.text, translation: l.translation, startMs: l.start_ms, endMs: l.end_ms, tokens: ts.results.map(t => ({ surface: t.surface, sense: t.id ? { id: t.id, text: t.text, translation: t.translation, lemma: t.lemma, grammar: t.grammar } : null })) });
        }
        let rights;
        try {
            rights = JSON.parse(p.rights_json);
        }
        catch {
            continue;
        }
        const pack = { id: p.id, recordingId, version: p.version, rights, lines };
        if (validLearning(pack, recordingId, record.duration_ms))
            return pack;
    }
    return null;
}
export async function catalog(): Promise<Recording[]> {
    const rows = await db().prepare("SELECT r.*,m.spotify_uri,m.metadata_json,m.match_status,c.status,c.language_status FROM recordings r JOIN provider_mappings m ON m.recording_id=r.id JOIN catalog_reviews c ON c.recording_id=r.id WHERE c.status='approved' AND c.language_status='italian-throughout' AND m.match_status='verified'").all<Row>();
    return Promise.all(rows.results.map(async (r) => { const meta = JSON.parse(r.metadata_json); return { id: r.id, title: meta.title || r.title, artist: meta.artist || r.artist, artistId: r.artist_id, durationMs: meta.durationMs || r.duration_ms, genres: JSON.parse(r.genres_json), moods: JSON.parse(r.moods_json), explicit: r.explicit === null ? null : !!r.explicit, spotifyUri: r.spotify_uri, image: meta.image || null, spotifyUrl: `https://open.spotify.com/track/${r.spotify_uri.split(':')[2]}`, languageStatus: r.language_status, matchStatus: r.match_status, reviewStatus: r.status, learningReady: !!await learning(r.id) }; }));
}
export async function approvedRecording(id: string) { const r = (await catalog()).find(r => r.id === id); if (!r)
    throw new ApiError(404, 'RECORDING_UNAVAILABLE', 'This recording is not approved or is no longer available.'); return r; }
