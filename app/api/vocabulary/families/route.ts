import {ApiError,body,db,fail,json,mutation,user} from '../../../../lib/beta-server';
import {familiesFor} from '../../../../lib/vocabulary-families';
import {senseFor} from '../../../../lib/vocabulary-server';
import {lookupWord} from '../../../../lib/word-lookup-server';
export async function GET(){try{const u=await user();return json(await familiesFor(u.userId));}catch(e){return fail(e);}}
export async function POST(request:Request){try{
    mutation(request);const u=await user(),p=await body(request);
    if (p.action==='create') {
        if (typeof p.name!=='string' || !p.name.trim() || p.name.trim().length>40) throw new ApiError(400,'INVALID_NAME','Use a family name of 1–40 characters.');
        const name=p.name.trim(),id=crypto.randomUUID();
        const count=await db().prepare('SELECT COUNT(*) AS n FROM vocabulary_families WHERE user_id=?').bind(u.userId).first<{n:number}>();
        if ((count?.n||0)>=50) throw new ApiError(400,'FAMILY_LIMIT','You can create up to 50 vocabulary families.');
        await db().prepare('INSERT INTO vocabulary_families(user_id,id,name,created_at) VALUES (?,?,?,?) ON CONFLICT(user_id,name) DO NOTHING').bind(u.userId,id,name,Date.now()).run();
        const family=await db().prepare('SELECT id,name FROM vocabulary_families WHERE user_id=? AND name=?').bind(u.userId,name).first();
        return json({family});
    }
    if (!['save','remove'].includes(p.action) || typeof p.wordId!=='string' || p.wordId.length>200 || typeof p.familyId!=='string' || p.familyId.length>200) throw new ApiError(400,'INVALID_SAVE','Select a word and vocabulary family.');
    if (p.familyId!=='favorites' && !await db().prepare('SELECT id FROM vocabulary_families WHERE user_id=? AND id=?').bind(u.userId,p.familyId).first()) throw new ApiError(404,'FAMILY_UNAVAILABLE','This vocabulary family is unavailable.');
    if (p.action==='remove') {
        await db().prepare('DELETE FROM vocabulary_memberships WHERE user_id=? AND word_id=? AND family_id=?').bind(u.userId,p.wordId,p.familyId).run();return json({ok:true});
    }
    let sense=await senseFor(p.wordId);
    if (!sense && typeof p.recordingId==='string' && typeof p.lineId==='string' && p.recordingId.length<=200 && p.lineId.length<=200) sense=(await lookupWord(p.recordingId,p.lineId,p.wordId)).sense;
    if (!sense) throw new ApiError(400,'INVALID_WORD','Select a word from a lyric.');
    const saved = await db().batch([
        db().prepare("INSERT INTO vocabulary(user_id,word_id,status,encounters,updated_at) VALUES (?,?,'saved',1,?) ON CONFLICT(user_id,word_id) DO UPDATE SET status=CASE WHEN vocabulary.status='learned' THEN 'learned' ELSE 'saved' END,updated_at=excluded.updated_at").bind(u.userId,p.wordId,Date.now()),
        db().prepare('INSERT INTO vocabulary_memberships(user_id,word_id,family_id) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(u.userId,p.wordId,p.familyId)
    ]);
    return json({ok:true,added:Number(saved[1].meta.changes)>0});
}catch(e){return fail(e);}}
