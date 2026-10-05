import test from 'node:test';
import assert from 'node:assert/strict';
import {SpotifyPlayback} from '../lib/spotify-player.ts';
let instance;
class Player {
 constructor(options){this.initialVolume=options.volume;instance=this;this.events={};this.pauses=0;this.resumes=0;this.current=null;}
 addListener(event,callback){this.events[event]=event==='player_state_changed'?s=>{this.current=s;callback(s);}:callback;}
 async connect(){queueMicrotask(()=>this.events.ready({device_id:'device'}));return true;}
 disconnect(){this.disconnected=true;}
 async activateElement(){}
 async pause(){if(!this.current){this.events.playback_error({message:'Cannot perform operation; no list was loaded.'});throw Error('Cannot perform operation; no list was loaded.');}this.pauses++;}
 async resume(){if(!this.current){this.events.playback_error({message:'Cannot perform operation; no list was loaded.'});throw Error('Cannot perform operation; no list was loaded.');}this.resumes++;}
 async seek(value){if(!this.current)throw Error('Cannot perform operation; no list was loaded.');this.seekValue=value;}
 async setVolume(value){this.volume=value;}
 async getCurrentState(){return this.current;}
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

test('activation failures clear buffering and allow a subsequent play attempt',async()=>{
 globalThis.fetch=async()=>Response.json({ok:true});
 const player=new SpotifyPlayback();let state;player.subscribe(s=>state=s);
 await player.connect();
 instance.activateElement=async()=>{throw new Error('Audio activation failed');};
 await assert.rejects(()=>player.play(record(1)),/Audio activation failed/);
 assert.equal(state.buffering,false);assert.equal(state.paused,true);assert.equal(state.error,'Audio activation failed');
 instance.activateElement=async()=>{};
 await player.play(record(1));instance.events.player_state_changed(sdkState(1));
 assert.equal(state.ready,true);assert.equal(state.paused,false);assert.equal(state.error,null);
 player.disconnect();
});

test('recoverable playback errors retain the registered device and expose the SDK reason',async()=>{
 globalThis.fetch=async()=>Response.json({ok:true});
 const player=new SpotifyPlayback();let state;player.subscribe(s=>state=s);
 await player.play(record(1));instance.events.player_state_changed(sdkState(1));
 instance.events.playback_error({message:'Playback error'});
 assert.equal(state.ready,true);assert.equal(state.paused,true);assert.equal(state.buffering,false);
 assert.match(state.error,/Playback error/);
 instance.events.player_state_changed(sdkState(1,{paused:true}));assert.match(state.error,/Playback error/);
 instance.events.player_state_changed(sdkState(1));assert.equal(state.error,null);
 player.disconnect();
});

test('switching resets the clock while playing, paused, and navigating back',async()=>{
 globalThis.fetch=async()=>Response.json({ok:true});
 const player=new SpotifyPlayback();let state;player.subscribe(s=>state=s);
 await player.play(record(1));instance.events.player_state_changed(sdkState(1,{position:65000}));
 player.select(record(2));assert.equal(state.positionMs,0);assert.equal(state.uri,null);
 instance.events.player_state_changed(sdkState(1,{position:66000}));
 assert.equal(state.positionMs,0);assert.equal(state.uri,null);
 await new Promise(r=>setTimeout(r,300));assert.equal(state.positionMs,0);
 await player.pause();player.select(record(1));assert.equal(state.positionMs,0);assert.equal(state.uri,null);
 await player.play(record(1));instance.events.player_state_changed(sdkState(1,{position:0}));
 assert.equal(state.positionMs,0);assert.equal(state.uri,record(1).spotifyUri);
 player.disconnect();
});

test('settings and paused navigation never send pause or seek to an empty Spotify queue',async()=>{
 globalThis.fetch=async()=>Response.json({ok:true});
 const player=new SpotifyPlayback();let state;player.subscribe(s=>state=s);
 try {
  await player.connect();player.select(record(1));await player.pause();
  player.select(record(2));await player.pause();
  assert.equal(instance.pauses,0);assert.equal(state.error,null);assert.equal(state.ready,true);
  await assert.rejects(()=>player.seek(10000),/Tap Play/);assert.equal(instance.seekValue,undefined);
 } finally {player.disconnect();}
});

test('resume reloads the selected recording when the SDK loses its queue',async()=>{
 const calls=[];globalThis.fetch=async(_url,options)=>{calls.push(JSON.parse(options.body));return Response.json({ok:true});};
 const player=new SpotifyPlayback();
 try {
  await player.play(record(1));instance.events.player_state_changed(sdkState(1,{paused:true}));
  instance.current=null;await player.resume();
  assert.deepEqual(calls.filter(c=>c.command==='play').map(c=>c.recordingId),['r1','r1']);
  assert.equal(instance.resumes,0);
 } finally {player.disconnect();}
});

test('an empty-list event during transfer does not discard the pending track load',async()=>{
 let release;const gate=new Promise(r=>release=r);let calls=0;
 globalThis.fetch=async()=>{calls++;if(calls===1)await gate;return Response.json({ok:true});};
 const player=new SpotifyPlayback();let state;player.subscribe(s=>state=s);
 try {
  const playing=player.play(record(1));await new Promise(r=>setTimeout(r,10));
  instance.events.playback_error({message:'Cannot perform operation; no list was loaded.'});
  assert.equal(state.error,null);assert.equal(state.buffering,true);assert.equal(state.ready,true);
  release();await playing;instance.events.player_state_changed(sdkState(1));
  assert.equal(state.paused,false);assert.equal(state.error,null);
 } finally {release();player.disconnect();}
});

test('pause tolerates a queue disappearing between the state check and the SDK command',async()=>{
 globalThis.fetch=async()=>Response.json({ok:true});
 const player=new SpotifyPlayback();let state;player.subscribe(s=>state=s);
 try {
  await player.play(record(1));instance.events.player_state_changed(sdkState(1));
  instance.pause=async()=>{instance.current=null;instance.events.playback_error({message:'Cannot perform operation; no list was loaded.'});throw Error('Cannot perform operation; no list was loaded.');};
  await player.pause();assert.equal(state.error,null);assert.equal(state.paused,true);
 } finally {player.disconnect();}
});

test('Web API play is not followed by a premature SDK resume',async()=>{
 globalThis.fetch=async()=>Response.json({ok:true});
 const player=new SpotifyPlayback();
 try {
  await player.connect();instance.current=sdkState(1,{paused:true});
  await player.play(record(1));assert.equal(instance.resumes,0);
 } finally {player.disconnect();}
});

test('volume remembers pre-connect level, clamps input, and latest queued adjustment wins',async()=>{
 const player=new SpotifyPlayback();await player.setVolume(.35);await player.connect();assert.equal(instance.initialVolume,.35);
 await Promise.all([player.setVolume(.1),player.setVolume(.6),player.setVolume(.9)]);assert.equal(instance.volume,.9);
 await player.setVolume(-10);assert.equal(instance.volume,0);await player.setVolume(10);assert.equal(instance.volume,1);
 await assert.rejects(()=>player.setVolume(Infinity));
 player.disconnect();await player.connect();assert.equal(instance.initialVolume,1);player.disconnect();
});
