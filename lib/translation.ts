import type { LearningPackage } from './discovery';

// Translate unique whole lines; repeated lyric occurrences retain their own IDs/timings.
export async function translatePackage(pack: LearningPackage, endpoint: string, request: typeof fetch = fetch): Promise<LearningPackage> {
    let url: URL;
    try { url = new URL(endpoint); } catch { return pack; }
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') return pack;
    const texts = [...new Set(pack.lines.filter(l => !l.translation).map(l => l.text))];
    if (!texts.length) return pack;
    try {
        const response = await request(new URL('/sotto/translate', url), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: texts, source: 'it', target: 'en', format: 'text' }),
            signal: AbortSignal.timeout(5000),
        });
        if (response.status === 202) return { ...pack, translationStatus: 'pending' };
        if (!response.ok) return pack;
        const data = await response.json() as { translatedText?: unknown };
        if (!Array.isArray(data.translatedText) || data.translatedText.length !== texts.length || !data.translatedText.every(t => typeof t === 'string' && t.trim())) return pack;
        const output = data.translatedText as string[];
        const translations = new Map(texts.map((text, i) => [text, output[i]]));
        return { ...pack, translationStatus: 'ready', translationProvider: 'LibreTranslate (local)', lines: pack.lines.map(l => ({ ...l, translation: l.translation || translations.get(l.text)! })) };
    } catch { return pack; }
}
