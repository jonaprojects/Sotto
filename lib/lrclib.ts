import type { LearningLine, LearningPackage } from './discovery';

export type LyricsRecord = { id: number; trackName: string; artistName: string; duration: number; instrumental: boolean; syncedLyrics: string | null };
const normalize = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export function matchesLyrics(row: LyricsRecord, title: string, artist: string, durationMs: number) {
    return Number.isInteger(row.id) && typeof row.trackName === 'string' && typeof row.artistName === 'string' && Number.isFinite(row.duration) && normalize(row.trackName) === normalize(title) && normalize(row.artistName) === normalize(artist) && Math.abs(row.duration * 1000 - durationMs) <= 2000 && !row.instrumental;
}
export function parseLrc(lrc: string, durationMs: number, prefix: string): LearningLine[] {
    if (!Number.isFinite(durationMs) || durationMs <= 0 || lrc.length > 150000) return [];
    const occurrences: { start: number; text: string }[] = [];
    const offset = Number(lrc.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0);
    for (const raw of lrc.split(/\r?\n/)) {
        const tags = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
        const text = raw.replace(/\[[^\]]*\]/g, '').trim();
        for (const tag of tags) {
            if (Number(tag[2]) >= 60) return [];
            const start = Number(tag[1]) * 60000 + Number(tag[2]) * 1000 + Number((tag[3] || '').padEnd(3, '0')) + offset;
            if (start < 0 || start > durationMs + 2000) return [];
            occurrences.push({ start, text });
        }
    }
    // Multiple timestamps describe repeated occurrences, not a single chorus ID.
    occurrences.sort((a, b) => a.start - b.start);
    const groups: { start: number; text: string }[] = [];
    for (const item of occurrences) {
        const previous = groups.at(-1);
        if (previous?.start === item.start) { if (item.text && !previous.text.split('\n').includes(item.text)) previous.text += (previous.text ? '\n' : '') + item.text; }
        else groups.push({ ...item });
    }
    if (groups.length < 2) return [];
    return groups.flatMap((item, index) => {
        const end = Math.min(durationMs, groups[index + 1]?.start ?? durationMs);
        // Empty timestamp markers end the preceding line and create lyric gaps.
        return item.text && end > item.start ? [{ id: `${prefix}:${index}`, text: item.text, translation: '', startMs: item.start, endMs: end, tokens: [{ surface: item.text, sense: null }] }] : [];
    });
}
export function lyricsPackage(row: LyricsRecord, recordingId: string, durationMs: number): LearningPackage | null {
    if (!row.syncedLyrics || row.instrumental) return null;
    const id = `lrclib:${row.id}:${recordingId}`;
    const lines = parseLrc(row.syncedLyrics, durationMs, id);
    if (!lines.length) return null;
    const url = `https://lrclib.net/api/get/${row.id}`;
    return { id, recordingId, version: 1, lines, source: { provider: 'LRCLIB', url, permissionStatus: 'unverified' }, rights: { display: false, store: false, translate: false, annotate: false, sourceUrl: url, license: 'Not established', attribution: 'Lyrics supplied by LRCLIB', expiresAt: null } };
}
