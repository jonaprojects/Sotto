import test from 'node:test';
import assert from 'node:assert/strict';
import {SpotifyPlayback} from '../lib/spotify-player.ts';
let instance;
class Player {
 constructor(){instance=this;this.events={};this.pauses=0;}
 addListener(event,callback){this.events[event]=callback;}
 async connect(){queueMicrotask(()=>this.events.ready({device_id:'device'}));return true;}
 disconnect(){this.disconnected=true;}
 async activateElement(){}
 async pause(){this.pauses++;}
 async resume(){}
 async seek(value){this.seekValue=value;}
 async setVolume(value){this.volume=value;}
}
globalThis.window={Spotify:{Player}};
const record=i=>({id:`r${i}`,spotifyUri:`spotify:track:${String(i).padStart(22,'0')}`});
const sdkState=(i,extras={})=>({position:1000,duration:180000,paused:false,loading:false,track_window:{current_track:{uri:record(i).spotifyUri,name:`Song ${i}`,artists:[{name:'Artist'}],album:{images:[{url:'https://example.org/art'}]}}},...extras});
test('rapid selections serialize commands, ignore old state during transfer, and play the last recording',async()=>{
 let release;const gate=new Promise(r=>release=r);const calls=[];
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);if(calls.length===1)await gate;return Response.json({ok:true});};
 const player=new SpotifyPlayback();let state;player.subscribe(s=>state=s);
 const first=player.play(record(1));await new Promise(r=>setTimeout(r,10));
 const last=player.play(record(2));instance.events.player_state_changed(sdkState(1));assert.equal(instance.pauses,0);release();await Promise.all([first,last]);
 assert.deepEqual(calls.filter(c=>c.command==='play').map(c=>c.recordingId),['r2']);
 instance.events.player_state_changed(sdkState(2));assert.equal(state.uri,record(2).spotifyUri);assert.equal(state.buffering,false);
 instance.events.player_state_changed(sdkState(3));assert.equal(instance.pauses,1);assert.equal(state.paused,true);
 player.disconnect();assert.equal(instance.disconnected,true);
});
test('timeline stops while buffering or disconnected, seek clamps and device loss reconnects',async()=>{
 globalThis.fetch=async()=>Response.json({ok:true});const player=new SpotifyPlayback();let state;player.subscribe(s=>state=s);
 await player.play(record(1));instance.events.player_state_changed(sdkState(1,{loading:true}));const position=state.positionMs;
 await new Promise(r=>setTimeout(r,300));assert.equal(state.positionMs,position);
 await player.seek(999999);assert.equal(instance.seekValue,180000);await player.setVolume(2);assert.equal(instance.volume,1);
 instance.events.not_ready();assert.equal(state.ready,false);assert.equal(state.paused,true);await player.connect();assert.equal(state.ready,true);
 await player.pause();assert.equal(state.paused,true);player.disconnect();
});
test('rate limits honor Retry-After and quota exhaustion blocks subsequent commands',async()=>{
 for(const code of ['RATE_LIMITED','QUOTA_EXCEEDED']){
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'Wait',code},{status:429,headers:{'Retry-After':'60'}});};
  const player=new SpotifyPlayback();await assert.rejects(()=>player.play(record(1)));await assert.rejects(()=>player.play(record(2)));assert.equal(calls,1);player.disconnect();
 }
});
