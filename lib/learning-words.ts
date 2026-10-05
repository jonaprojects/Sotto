import type { LearningPackage } from './discovery';
export function wordSegments(text: string) {
    const parts: {surface: string; word: boolean; offset: number}[] = [];
    let cursor = 0;
    for (const match of text.matchAll(/\p{L}[\p{L}\p{M}]*(?:['’]\p{L}[\p{L}\p{M}]*)*/gu)) {
        if (match.index > cursor) parts.push({surface:text.slice(cursor,match.index),word:false,offset:cursor});
        parts.push({surface:match[0],word:true,offset:match.index}); cursor=match.index+match[0].length;
    }
    if (cursor < text.length) parts.push({surface:text.slice(cursor),word:false,offset:cursor});
    return parts;
}
export async function wordTokens(pack: LearningPackage): Promise<LearningPackage> {
    return {...pack, lines:await Promise.all(pack.lines.map(async line => {
        if (line.tokens.some(t=>t.sense)) return line;
        const tokens=await Promise.all(wordSegments(line.text).map(async part=> {
            if (!part.word) return {surface:part.surface,sense:null};
            const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${pack.recordingId}\n${line.text}\n${part.offset}`));
            const id='lw:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
            return {surface:part.surface,sense:{id,text:part.surface,translation:'',lemma:'',grammar:''}};
        }));
        return {...line,tokens};
    }))};
}
