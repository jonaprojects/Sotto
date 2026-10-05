import test from 'node:test';
import assert from 'node:assert/strict';
import {orderUpcoming,endedAction,nextRepeat} from '../lib/playback-modes.ts';
test('shuffle preserves history and current song, adds no duplicates, and off restores upcoming order',()=>{
 const source=Array.from({length:8},(_,i)=>({id:String(i)}));
 const shuffled=orderUpcoming(source,2,true,source,()=>0);
 assert.deepEqual(shuffled.slice(0,3),source.slice(0,3));assert.notDeepEqual(shuffled.slice(3),source.slice(3));
 assert.equal(new Set(shuffled.map(r=>r.id)).size,8);
 assert.deepEqual(orderUpcoming(shuffled,2,false,source),source);
 const expanded=[...shuffled,{id:'8'},{id:'9'}];
 assert.deepEqual(orderUpcoming(expanded,4,true,[...source,{id:'8'},{id:'9'}],()=>0).slice(0,5),expanded.slice(0,5));
});
test('repeat modes restart one, wrap all only at exhaustion, and wait for more songs',()=>{
 assert.deepEqual(endedAction(2,4,'one',false),{kind:'restart'});
 assert.deepEqual(endedAction(2,4,'off',false),{kind:'next',index:3});
 assert.deepEqual(endedAction(3,4,'all',false),{kind:'wait'});
 assert.deepEqual(endedAction(3,4,'all',true),{kind:'next',index:0});
 assert.deepEqual(endedAction(0,1,'all',true),{kind:'restart'});
 assert.deepEqual(endedAction(3,4,'off',true),{kind:'stop'});
 assert.deepEqual(['off','all','one'].map(nextRepeat),['all','one','off']);
});
