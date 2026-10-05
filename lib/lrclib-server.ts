import { config, db } from './beta-server';
import { lyricsPackage, matchesLyrics, type LyricsRecord } from './lrclib';
import type { LearningPackage } from './discovery';

let queue: Promise<unknown> = Promise.resolve();
let retryAt = 0;
const pending = new Map<string, Promise<LearningPackage | null>>();
export async function providerLyrics(id: string): Promise<LearningPackage | null> {
    if (config().LRCLIB_ENABLED !== 'true') return null;
    const cached = await db().prepare('SELECT package_json FROM provider_lyrics WHERE recording_id=? AND expires_at>?').bind(id, Date.now()).first<{ package_json: string | null }>();
    if (cached) return cached.package_json ? JSON.parse(cached.package_json) : null;
    if (pending.has(id)) return pending.get(id)!;
    const request = queue.catch(() => {}).then(async () => {
        if (Date.now() < retryAt) return null;
        const record = await db().prepare("SELECT r.title,r.artist,COALESCE(json_extract(m.metadata_json,'$.durationMs'),r.duration_ms) AS duration_ms FROM recordings r JOIN provider_mappings m ON m.recording_id=r.id WHERE r.id=?").bind(id).first<{title: string; artist: string; duration_ms: number}>();
        if (!record) return null;
        await new Promise(resolve => setTimeout(resolve, 350));
        const url = new URL('https://lrclib.net/api/get');
        url.search = new URLSearchParams({ track_name: record.title, artist_name: record.artist, duration: String(record.duration_ms / 1000) }).toString();
        const response = await fetch(url, { headers: { 'User-Agent': 'Sotto/0.1 (https://sotto-music-languages.jonathegreatest.chatgpt.site/)' }, signal: AbortSignal.timeout(8000) });
        if (response.status === 429 || response.status === 503) { retryAt = Date.now() + Math.max(1, Number(response.headers.get('Retry-After')) || 30) * 1000; return null; }
        if (!response.ok && response.status !== 404) return null;
        let pack: LearningPackage | null = null;
        if (response.ok) {
            const row = await response.json() as LyricsRecord;
            if (matchesLyrics(row, record.title, record.artist, record.duration_ms)) pack = lyricsPackage(row, id, record.duration_ms);
        }
        const now = Date.now();
        await db().prepare('INSERT INTO provider_lyrics VALUES (?,?,?,?,?,?) ON CONFLICT(recording_id) DO UPDATE SET status=excluded.status,package_json=excluded.package_json,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at').bind(id, 'lrclib', pack ? 'synced' : 'unavailable', pack ? JSON.stringify(pack) : null, now, now + (pack ? 7 : 1) * 86400000).run();
        return pack;
    }).catch(() => null).finally(() => pending.delete(id));
    queue = request; pending.set(id, request); return request;
}
