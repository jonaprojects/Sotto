import test from 'node:test';
import assert from 'node:assert/strict';
import {wordSegments,wordTokens} from '../lib/learning-words.ts';
import {WordPlaybackGate} from '../lib/word-playback.ts';
test('Italian tokenization preserves apostrophes, accents and punctuation',()=>{
 const text="L'amore, perché?\nC'è già!";
 const parts=wordSegments(text);assert.equal(parts.map(p=>p.surface).join(''),text);
 assert.deepEqual(parts.filter(p=>p.word).map(p=>p.surface),["L'amore",'perché',"C'è",'già']);
});
test('word identities distinguish context and preserve repeated choruses and timing',async()=>{
 const line=(id,text,startMs)=>({id,text,startMs,endMs:startMs+1000,tokens:[{surface:text,sense:null}]});
 const pack={recordingId:'r',lines:[line('a','Ciao mondo',0),line('b','Ciao mondo',2000),line('c','Ciao amore',4000)]};
 const result=await wordTokens(pack);
 assert.equal(result.lines[0].tokens[0].sense.id,result.lines[1].tokens[0].sense.id);
 assert.notEqual(result.lines[0].tokens[0].sense.id,result.lines[2].tokens[0].sense.id);
 assert.deepEqual(result.lines.map(l=>l.startMs),[0,2000,4000]);
});
test('closing a word waits for pause before resuming and ignores a changed song',async()=>{
 let release,events=[],id='a';const gate=new WordPlaybackGate(()=>new Promise(r=>{release=r;events.push('pause');}),async()=>{events.push('resume');},()=>id);
 gate.open('a',true);const closing=gate.close();assert.deepEqual(events,['pause']);release();await closing;assert.deepEqual(events,['pause','resume']);
 gate.open('a',true);const changed=gate.close();id='b';release();await changed;assert.deepEqual(events,['pause','resume','pause']);
});
test('paused words stay paused and cancellation prevents delayed resume',async()=>{
 let resumes=0,release;const gate=new WordPlaybackGate(()=>new Promise(r=>{release=r;}),async()=>{resumes++;},()=> 'a');
 gate.open('a',false);const closed=gate.close();release();await closed;assert.equal(resumes,0);
 gate.open('a',true);const cancelled=gate.close();gate.cancel();release();await cancelled;assert.equal(resumes,0);
});
