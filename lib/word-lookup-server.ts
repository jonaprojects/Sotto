import { ApiError, config, db } from './beta-server';
import { approvedRecording, learning } from './beta-catalog';
import { providerLyrics } from './lrclib-server';
import { wordTokens } from './learning-words';
import type { Sense } from './discovery';
export async function lookupWord(recordingId: string, lineId: string, wordId: string) {
    await approvedRecording(recordingId);
    const source = await learning(recordingId) || await providerLyrics(recordingId);
    if (!source) throw new ApiError(404,'WORD_UNAVAILABLE','Learning words are unavailable for this song.');
    const pack=await wordTokens(source);
    const line=pack.lines.find(l=>l.id===lineId);
    const sense=line?.tokens.find(t=>t.sense?.id===wordId)?.sense;
    if (!sense || !line) throw new ApiError(400,'INVALID_WORD','Select a word from this lyric.');
    if (sense.translation) return {sense,status:'ready'};
    const existing=await db().prepare('SELECT id,text,translation,lemma,grammar FROM provider_word_senses WHERE id=?').bind(wordId).first<Sense>();
    if (existing?.translation) return {sense:existing,status:'ready'};
    let translation='',status='unavailable';
    const endpoint=config().LOCAL_TRANSLATION_URL;
    if (endpoint) {
        const url=new URL(endpoint);
        if (url.protocol==='http:' && url.hostname==='127.0.0.1') {
            try {
                const response=await fetch(new URL('/sotto/translate',url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:[sense.text],source:'it',target:'en'}),signal:AbortSignal.timeout(5000)});
                if (response.status===202) status='pending';
                else if (response.ok) {
                    const output=await response.json() as {translatedText?:unknown};
                    if (Array.isArray(output.translatedText) && output.translatedText.length===1 && typeof output.translatedText[0]==='string' && output.translatedText[0].trim()) {translation=output.translatedText[0];status='ready';}
                }
            } catch { /* Keep the word saveable while translation is offline. */ }
        }
    }
    const result={...sense,translation};
    await db().prepare('INSERT INTO provider_word_senses(id,recording_id,line_id,text,translation,lemma,grammar) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET translation=CASE WHEN excluded.translation!=\'\' THEN excluded.translation ELSE provider_word_senses.translation END').bind(wordId,recordingId,lineId,sense.text,translation,'','').run();
    return {sense:result,status};
}
