import { words } from './catalog';
import { db } from './beta-server';
import { learning } from './beta-catalog';
import type { Sense } from './discovery';
export async function senseFor(id: string): Promise<Sense | null> { if (words[id])
    return words[id]; const alias = await db().prepare('SELECT s.* FROM word_senses s JOIN word_aliases a ON a.sense_id=s.id WHERE s.id=?').bind(id).first<Sense>(); if (alias)
    return alias; const packages = await db().prepare('SELECT DISTINCT p.recording_id FROM word_occurrences o JOIN lyric_lines l ON l.id=o.line_id JOIN learning_packages p ON p.id=l.package_id WHERE o.sense_id=? AND p.approved=1').bind(id).all<{
    recording_id: string;
}>(); for (const p of packages.results) {
    const pack = await learning(p.recording_id);
    const found = pack?.lines.flatMap(l => l.tokens).find(t => t.sense?.id === id)?.sense;
    if (found)
        return found;
} return null; }
export async function vocabularyProgress(userId: string, canonical: boolean) { const rows = await db().prepare('SELECT word_id AS wordId,status,encounters FROM vocabulary WHERE user_id=?').bind(userId).all<{
    wordId: string;
    status: string;
    encounters: number;
}>(); const aliases = await db().prepare('SELECT legacy_id,sense_id FROM word_aliases').all<{
    legacy_id: string;
    sense_id: string;
}>(); const ids = new Map(aliases.results.map(a => [canonical ? a.legacy_id : a.sense_id, canonical ? a.sense_id : a.legacy_id])); const progress = new Map<string, {
    wordId: string;
    status: string;
    encounters: number;
}>(); const rank: Record<string, number> = { encountered: 0, saved: 1, learned: 2 }; for (const row of rows.results) {
    const id = ids.get(row.wordId) || row.wordId;
    const old = progress.get(id);
    progress.set(id, { wordId: id, status: old && rank[old.status] > rank[row.status] ? old.status : row.status, encounters: (old?.encounters || 0) + row.encounters });
} const definitions: Record<string, Sense> = {}; for (const p of progress.values()) {
    const sense = await senseFor(p.wordId);
    if (sense)
        definitions[p.wordId] = sense;
} return { progress: [...progress.values()], definitions }; }
