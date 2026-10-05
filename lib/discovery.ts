export const genres = ['pop', 'indie', 'rap', 'rock', 'classics'] as const;
export const moods = ['calm', 'energetic', 'melancholic', 'upbeat'] as const;
export type Genre = typeof genres[number];
export type Mood = typeof moods[number];
export type Preferences = {
    genres: Genre[];
    moods: Mood[];
    learningOnly: boolean;
    explicit: boolean;
};
export const defaultPreferences: Preferences = { genres: [], moods: [], learningOnly: false, explicit: true };
export type Recording = {
    id: string;
    title: string;
    artist: string;
    artistId: string;
    durationMs: number;
    genres: Genre[];
    moods: Mood[];
    explicit: boolean | null;
    spotifyUri: string;
    image: string | null;
    spotifyUrl: string;
    languageStatus: string;
    matchStatus: string;
    reviewStatus: string;
    learningReady: boolean;
};
export type Rights = {
    display: boolean;
    store: boolean;
    translate: boolean;
    annotate: boolean;
    sourceUrl: string;
    license: string;
    attribution: string;
    expiresAt: number | null;
};
export type Sense = {
    id: string;
    text: string;
    translation: string;
    lemma: string;
    grammar: string;
};
export type LearningLine = {
    id: string;
    text: string;
    translation: string;
    startMs: number;
    endMs: number;
    tokens: {
        surface: string;
        sense: Sense | null;
    }[];
};
export type LearningPackage = {
    translationProvider?: string;
    translationStatus?: 'pending' | 'ready';
    source?: { provider: string; url: string; permissionStatus: string };
    id: string;
    recordingId: string;
    version: number;
    rights: Rights;
    lines: LearningLine[];
};
export function validPreferences(value: unknown): value is Preferences {
    if (!value || typeof value !== 'object')
        return false;
    const p = value as Preferences;
    return Array.isArray(p.genres) && p.genres.length <= 3 && new Set(p.genres).size === p.genres.length && p.genres.every(g => genres.includes(g)) && Array.isArray(p.moods) && p.moods.length <= 4 && new Set(p.moods).size === p.moods.length && p.moods.every(m => moods.includes(m)) && typeof p.learningOnly === 'boolean' && typeof p.explicit === 'boolean';
}
export function eligible(r: Recording, p: Preferences) { return r.languageStatus === 'italian-throughout' && r.matchStatus === 'verified' && r.reviewStatus === 'approved' && /^spotify:track:[A-Za-z0-9]{22}$/.test(r.spotifyUri) && (!p.learningOnly || r.learningReady) && (p.explicit || r.explicit === false); }
export function validLearning(p: LearningPackage, recordingId: string, durationMs: number, now = Date.now()): boolean {
    if (!p || typeof p !== 'object' || !Number.isFinite(durationMs) || durationMs <= 0)
        return false;
    const r = p.rights;
    if (p.recordingId !== recordingId || !r || ![r.display, r.store, r.translate, r.annotate].every(v => v === true) || typeof r.license !== 'string' || !r.license || typeof r.attribution !== 'string' || !r.attribution || !/^https:\/\//.test(r.sourceUrl) || (r.expiresAt !== null && (!Number.isFinite(r.expiresAt) || r.expiresAt <= now)) || !Array.isArray(p.lines) || !p.lines.length || !Number.isInteger(p.version) || p.version < 1)
        return false;
    const ids = new Set<string>();
    let lastEnd = 0;
    return p.lines.every(l => { if (!l || typeof l !== 'object' || !Array.isArray(l.tokens) || l.tokens.some(t => !t || typeof t.surface !== 'string'))
        return false; const valid = typeof l.id === 'string' && !!l.id && !ids.has(l.id) && Number.isFinite(l.startMs) && Number.isFinite(l.endMs) && l.startMs >= lastEnd && l.endMs > l.startMs && l.endMs <= durationMs && typeof l.text === 'string' && !!l.text && typeof l.translation === 'string' && !!l.translation && l.tokens.map(t => t.surface).join('') === l.text && l.tokens.every(t => !t.sense || [t.sense.id, t.sense.text, t.sense.translation, t.sense.lemma, t.sense.grammar].every(v => typeof v === 'string' && !!v)); ids.add(l.id); lastEnd = l.endMs; return valid; });
}
export function activeLine(lines: LearningLine[], positionMs: number) { return lines.findIndex(l => positionMs >= l.startMs && positionMs < l.endMs); }
function random(seed: string) { let state = 2166136261; for (const c of seed) {
    state ^= c.charCodeAt(0);
    state = Math.imul(state, 16777619);
} return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function discoveryOrder(recordings: Recording[], p: Preferences, seed: string): string[] {
    const rng = random(seed);
    const pool = [...new Map(recordings.filter(r => eligible(r, p)).map(r => [r.id, r])).values()].map(r => ({ r, jitter: rng() }));
    const order: string[] = [];
    let previous = '';
    let counts = new Map<string, number>();
    const balancedCounts = new Map<Genre, number>();
    while (pool.length) {
        if (order.length % 20 === 0)
            counts = new Map();
        const prefer = p.genres.length > 0 && order.length % 5 !== 4;
        const diverse = pool.filter(x => x.r.artistId !== previous && (counts.get(x.r.artistId) || 0) < 2);
        const available = diverse.length ? diverse : pool.filter(x => x.r.artistId !== previous);
        const options = available.length ? available : pool;
        options.sort((a, b) => {
            const score = (x: typeof a) => { const match = x.r.genres.some(g => p.genres.includes(g)); const mood = x.r.moods.some(m => p.moods.includes(m)); const balance = p.genres.length ? 0 : -Math.min(...x.r.genres.map(g => balancedCounts.get(g) || 0), order.length); return (prefer ? match ? 10 : 0 : p.genres.length ? !match ? 10 : 0 : balance) + Number(mood) * 2 + x.jitter; };
            return score(b) - score(a);
        });
        const chosen = options[0];
        order.push(chosen.r.id);
        previous = chosen.r.artistId;
        counts.set(previous, (counts.get(previous) || 0) + 1);
        for (const g of chosen.r.genres)
            balancedCounts.set(g, (balancedCounts.get(g) || 0) + 1);
        pool.splice(pool.indexOf(chosen), 1);
    }
    return order;
}
