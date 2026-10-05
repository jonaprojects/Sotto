import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {nonce,encrypt,decrypt} from '../lib/beta-crypto.ts';
const env={};globalThis.__sottoTest={env,headers:new Headers()};
function d1(sqlite){return {prepare(sql){const statement=sqlite.prepare(sql);let values=[];return {bind(...v){values=v;return this;},async first(){return statement.get(...values)||null;},async all(){return {results:statement.all(...values)};},async run(){const r=statement.run(...values);return {meta:{changes:Number(r.changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const output=[];for(const s of statements)output.push(await s.run());sqlite.exec('COMMIT');return output;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};}
let sqlite;
function reset(){sqlite?.close();sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_swift_rafael_vega.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../drizzle/0001_short_kulan_gath.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../drizzle/0002_provider_lyrics.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../drizzle/0003_word_learning.sql',import.meta.url),'utf8'));Object.assign(env,{DB:d1(sqlite),CATALOG_OWNER_ID:'alice',SPOTIFY_CLIENT_ID:'fixture-client',SPOTIFY_TOKEN_KEY:nonce(),SPOTIFY_POLICY_APPROVED:'true',SPOTIFY_BETA_ENABLED:'true',SPOTIFY_LEARNING_APPROVED:'false',SITE_ORIGIN:'https://sotto.example'});identity('alice');}
function identity(id){globalThis.__sottoTest.headers=new Headers(id?{'oai-authenticated-user-id':id,'oai-authenticated-user-email':`${id}@example.org`}:{});}
function request(path,payload){return new Request(`https://sotto.example${path}`,payload===undefined?{}:{method:'POST',headers:{Origin:'https://sotto.example','Content-Type':'application/json'},body:JSON.stringify(payload)});}
const spotify=await import('../app/api/spotify/[action]/route.ts');const feed=await import('../app/api/feed/route.ts');const review=await import('../app/api/catalog/review/route.ts');const preferences=await import('../app/api/preferences/route.ts');const vocabulary=await import('../app/api/vocabulary/route.ts');const server=await import('../lib/spotify-server.ts');
function seed(i=1){sqlite.prepare('INSERT INTO recordings VALUES (?,?,?,?,?,?,?,?,?,?)').run(`r${i}`,'Song','Artist',`a${i}`,null,180000,'["pop"]','[]',0,'https://example.org/evidence');sqlite.prepare('INSERT INTO provider_mappings VALUES (?,?,?,?,?,?)').run(`r${i}`,`spotify:track:${String(i).padStart(22,'0')}`,'candidate','{}','{}',Date.now());}
test('authorization, preferences and review reject unsigned users',async()=>{reset();identity(null);assert.equal((await spotify.GET(request('/api/spotify/status'),{params:Promise.resolve({action:'status'})})).status,401);assert.equal((await preferences.GET()).status,401);assert.equal((await review.GET(request('/api/catalog/review'))).status,401);});
test('owner restriction and cross-origin checks protect mutations',async()=>{reset();identity('bob');assert.equal((await review.GET(request('/api/catalog/review'))).status,403);identity('alice');const req=request('/api/preferences',{genres:[],moods:[],explicit:true,learningOnly:false});req.headers.set('Origin','https://attacker.example');assert.equal((await preferences.POST(req)).status,403);});
test('catalog remains empty until exact recording and language reviews pass',async()=>{reset();seed();const first=await (await feed.GET(request('/api/feed'))).json();assert.equal(first.recordings.length,0);const payload={id:'r1',status:'approved',languageStatus:'italian-throughout',sources:['https://example.org/review'],notes:'Test fixture only',genres:['pop'],moods:[],explicit:false,matchVerified:true,listenedEntireRecording:false};assert.equal((await review.POST(request('/api/catalog/review',payload))).status,400);assert.equal((await review.POST(request('/api/catalog/review',{...payload,listenedEntireRecording:true}))).status,200);const result=await (await feed.GET(request('/api/feed'))).json();assert.equal(result.recordings.length,1);assert.equal(result.recordings[0].learningReady,false);assert.equal(result.exhausted,true);});
test('pagination is user-bound and preferences invalidate old sessions',async()=>{reset();for(let i=0;i<25;i++){seed(i);sqlite.prepare("UPDATE provider_mappings SET match_status='verified' WHERE recording_id=?").run(`r${i}`);sqlite.prepare('INSERT INTO catalog_reviews VALUES (?,?,?,?,?,?)').run(`r${i}`,'approved','italian-throughout','alice','{}',Date.now());}const first=await (await feed.GET(request('/api/feed'))).json();assert.equal(first.recordings.length,20);identity('bob');assert.equal((await feed.GET(request(`/api/feed?cursor=${encodeURIComponent(first.cursor)}`))).status,400);identity('alice');const second=await (await feed.GET(request(`/api/feed?cursor=${encodeURIComponent(first.cursor)}`))).json();assert.equal(second.recordings.length,5);assert.equal(new Set([...first.recordings,...second.recordings].map(r=>r.id)).size,25);await preferences.POST(request('/api/preferences',{genres:['rock'],moods:[],learningOnly:false,explicit:true}));assert.equal((await feed.GET(request(`/api/feed?cursor=${encodeURIComponent(first.cursor)}`))).status,409);});
test('OAuth rejects state tampering and expired or replayed attempts',async()=>{reset();const auth=await server.authorize('alice');await assert.rejects(()=>server.callback('alice',auth.state,'code','wrong'),e=>e.code==='INVALID_OAUTH_STATE');sqlite.prepare('UPDATE oauth_pending SET expires_at=0').run();await assert.rejects(()=>server.callback('alice',auth.state,'code',auth.state),e=>e.code==='INVALID_OAUTH_STATE');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM spotify_connections').get().n,0);});
test('refresh is serialized and rotates credentials encrypted at rest',async()=>{reset();sqlite.prepare('INSERT INTO spotify_connections(user_id,encrypted,expires_at,version) VALUES (?,?,?,?)').run('alice',await encrypt({access_token:'old',refresh_token:'old-refresh',scope:'streaming'},env.SPOTIFY_TOKEN_KEY,'alice'),0,'v1');const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,30));return Response.json({access_token:'new',refresh_token:'new-refresh',expires_in:3600,scope:'streaming'});};try{const tokens=await Promise.all([server.accessToken('alice'),server.accessToken('alice')]);assert.deepEqual(tokens,['new','new']);assert.equal(calls,1);const row=sqlite.prepare('SELECT encrypted FROM spotify_connections').get();assert.ok(!row.encrypted.includes('new-refresh'));assert.equal((await decrypt(row.encrypted,env.SPOTIFY_TOKEN_KEY,'alice')).refresh_token,'new-refresh');}finally{globalThis.fetch=original;}});
test('disconnect during refresh cannot recreate or return a usable connection',async()=>{reset();sqlite.prepare('INSERT INTO spotify_connections(user_id,encrypted,expires_at,version) VALUES (?,?,?,?)').run('alice',await encrypt({access_token:'old',refresh_token:'old-refresh',scope:'streaming'},env.SPOTIFY_TOKEN_KEY,'alice'),0,'v1');const original=globalThis.fetch;globalThis.fetch=async()=>{await spotify.POST(request('/api/spotify/disconnect',{}),{params:Promise.resolve({action:'disconnect'})});return Response.json({access_token:'new',expires_in:3600});};try{await assert.rejects(()=>server.accessToken('alice'),e=>e.code==='SPOTIFY_RECONNECT');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM spotify_connections').get().n,0);}finally{globalThis.fetch=original;}});
test('quota exhaustion is not a retry loop and rate limits expose Retry-After',async()=>{reset();await assert.rejects(()=>server.spotifyError(Response.json({reason:'QUOTA_EXCEEDED'},{status:429})),e=>e.code==='QUOTA_EXCEEDED'&&!e.retryAfter);await assert.rejects(()=>server.spotifyError(Response.json({},{status:429,headers:{'retry-after':'12'}})),e=>e.code==='RATE_LIMITED'&&e.retryAfter===12);});
test('legacy progress and definitions survive additive migrations',async()=>{reset();sqlite.prepare('INSERT INTO vocabulary VALUES (?,?,?,?,?)').run('alice','mare','learned',4,Date.now());const result=await (await vocabulary.GET(request('/api/vocabulary'))).json();assert.equal(result.progress[0].status,'learned');assert.equal(result.definitions.mare.translation,'sea');assert.equal((await vocabulary.POST(request('/api/vocabulary',{wordIds:['unapproved-sense'],status:'learned'}))).status,400);});

const families=await import('../app/api/vocabulary/families/route.ts');
test('family saves are idempotent, isolated by user, and preserve learned words',async()=>{
 reset();sqlite.prepare('INSERT INTO vocabulary VALUES (?,?,?,?,?)').run('alice','mare','learned',4,Date.now());
 const f=await (await families.POST(request('/api/vocabulary/families',{action:'create',name:'Nature'}))).json();
 for(let i=0;i<2;i++)assert.equal((await families.POST(request('/api/vocabulary/families',{action:'save',familyId:'favorites',wordId:'mare'}))).status,200);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM vocabulary_memberships').get().n,1);
 assert.equal(sqlite.prepare('SELECT status FROM vocabulary').get().status,'learned');
 assert.equal((await families.POST(request('/api/vocabulary/families',{action:'save',familyId:f.family.id,wordId:'mare'}))).status,200);
 identity('bob');assert.equal((await families.POST(request('/api/vocabulary/families',{action:'save',familyId:f.family.id,wordId:'mare'}))).status,404);
 assert.equal((await (await families.GET()).json()).memberships.length,0);
 identity('alice');await families.POST(request('/api/vocabulary/families',{action:'remove',familyId:'favorites',wordId:'mare'}));
 assert.equal(sqlite.prepare('SELECT status FROM vocabulary').get().status,'learned');
 assert.equal((await families.POST(request('/api/vocabulary/families',{action:'save',familyId:'favorites',wordId:'forged'}))).status,400);
 identity(null);assert.equal((await families.GET()).status,401);
});
test('word lookup validates lyric occurrence and uses local translation',async()=>{
 reset();env.LRCLIB_ENABLED='true';env.LOCAL_TRANSLATION_URL='http://127.0.0.1:5000';seed();
 sqlite.prepare("UPDATE provider_mappings SET match_status='verified'").run();
 sqlite.prepare('INSERT INTO catalog_reviews VALUES (?,?,?,?,?,?)').run('r1','approved','italian-throughout','alice','{}',Date.now());
 const pack={recordingId:'r1',lines:[{id:'line1',text:'Ciao mondo',startMs:1000,endMs:3000,tokens:[{surface:'Ciao mondo',sense:null}],translation:null}]};
 sqlite.prepare('INSERT INTO provider_lyrics VALUES (?,?,?,?,?,?)').run('r1','lrclib','synced',JSON.stringify(pack),Date.now(),Date.now()+60000);
 const {wordTokens}=await import('../lib/learning-words.ts');const tokens=(await wordTokens(pack)).lines[0].tokens;
 const route=await import('../app/api/words/route.ts');const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({translatedText:['Hello']});
 try{
 const url='/api/words?recordingId=r1&lineId=line1&wordId='+tokens[0].sense.id;
 const result=await(await route.GET(request(url))).json();assert.equal(result.sense.translation,'Hello');
 assert.equal((await route.GET(request('/api/words?recordingId=r1&lineId=line1&wordId=forged'))).status,400);
 assert.equal((await families.POST(request('/api/vocabulary/families',{action:'save',familyId:'favorites',wordId:result.sense.id}))).status,200);
 const vocabularyResult=await(await vocabulary.GET(request('/api/vocabulary'))).json();assert.equal(vocabularyResult.definitions[result.sense.id].translation,'Hello');
 }finally{globalThis.fetch=original;}
});

test('completed or skipped taste setup is absent from the initial server render',async()=>{
 reset();const {default:Page}=await import('../app/beta/page.tsx');const {renderToStaticMarkup}=await import('react-dom/server');
 const first=renderToStaticMarkup(await Page());assert.ok(first.includes('Choose your musical taste'));
 const chosen={genres:['rock'],moods:['calm'],learningOnly:false,explicit:true};
 assert.equal((await preferences.POST(request('/api/preferences',chosen))).status,200);
 const returning=await Page();assert.deepEqual(returning.props.initialTaste.value,chosen);
 assert.ok(!renderToStaticMarkup(returning).includes('Choose your musical taste'));
 identity('bob');assert.ok(renderToStaticMarkup(await Page()).includes('Choose your musical taste'));
 assert.equal((await preferences.POST(request('/api/preferences',{genres:[],moods:[],learningOnly:false,explicit:true}))).status,200);
 assert.ok(!renderToStaticMarkup(await Page()).includes('Choose your musical taste'));
 env.DB=undefined;const unavailable=renderToStaticMarkup(await Page());
 assert.ok(!unavailable.includes('Choose your musical taste'));assert.ok(unavailable.includes('Loading your saved styles'));
});
