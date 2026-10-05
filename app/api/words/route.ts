import { ApiError, fail, json, user } from '../../../lib/beta-server';
import { lookupWord } from '../../../lib/word-lookup-server';
export async function GET(request:Request) {
    try {
        await user(); const p=new URL(request.url).searchParams;
        const recordingId=p.get('recordingId'),lineId=p.get('lineId'),wordId=p.get('wordId');
        if (!recordingId || !lineId || !wordId || [recordingId,lineId,wordId].some(v=>v.length>200)) throw new ApiError(400,'INVALID_WORD','Select a lyric word.');
        return json(await lookupWord(recordingId,lineId,wordId));
    } catch(e) {return fail(e);}
}
