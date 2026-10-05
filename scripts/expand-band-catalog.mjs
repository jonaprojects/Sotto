// Local, resumable editorial expansion. Never saves OAuth credentials.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {bandSeeds} from './band-seeds.mjs';
import {spotifyImportClient} from './spotify-import-client.mjs';
import {normalize,sqlString,exportCatalogSQL} from './catalog-tools.mjs';
import {badVersion,titleKey,albumFits,recordingId,eligibleTrack} from './band-catalog-tools.mjs';
import {matchesLyrics,lyricsPackage} from '../lib/lrclib.ts';

const dir='.sites-runtime/expansion';await mkdir(dir,{recursive:true});
const read=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
const checkpoint=await read(`${dir}/candidates.json`,{albums:{},tracks:{},lyrics:{},selection:[]});
const save=()=>writeFile(`${dir}/candidates.json`,JSON.stringify(checkpoint));
const artists=await read(`${dir}/artists.json`,[]);
const folder='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const db=new DatabaseSync(`${folder}/${(await readdir(folder)).find(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite')}`,{readOnly:true});
const existing=db.prepare("SELECT r.id,r.title,r.artist,r.isrc,m.spotify_uri FROM recordings r JOIN provider_mappings m ON m.recording_id=r.id JOIN catalog_reviews c ON c.recording_id=r.id WHERE c.status='approved' AND c.language_status='italian-throughout' AND m.match_status='verified'").all();db.close();
// On reruns, generated recordings belong to this checkpoint, not the baseline.
const own=new Set(checkpoint.selection.map(r=>r.id));
const baseline=existing.filter(r=>!own.has(r.id));
const target=Math.max(0,300-baseline.length);
const spotify=await spotifyImportClient();
const pools=[];
for(const seed of bandSeeds){
 let probe=artists.find(a=>a.seed.name===seed.name);
 if(!probe){
  const profile=await spotify(`artists/${seed.spotifyId}`);const albums=[];
  for(let offset=0;offset<50;offset+=10){const page=await spotify(`artists/${seed.spotifyId}/albums?include_groups=album&limit=10&offset=${offset}`);albums.push(...page.items.map(a=>({id:a.id,name:a.name,date:a.release_date,total:a.total_tracks})));if(!page.next)break;}
  probe={seed,candidates:[{id:profile.id,name:profile.name,albums}]};artists.push(probe);await writeFile(`${dir}/artists.json`,JSON.stringify(artists));
 }
 const matches=probe?.candidates.filter(a=>normalize(a.name)===normalize(seed.name)&&(!seed.spotifyId||a.id===seed.spotifyId)&&(!seed.albums.length||a.albums.some(b=>seed.albums.some(n=>albumFits(b.name,n)))))||[];
 if(matches.length!==1)throw new Error(`Artist identity requires review: ${seed.name}`);
 const artist=matches[0];const tracks=[];
 for(const desired of seed.albums){
  const album=artist.albums.filter(a=>!badVersion(a.name)&&albumFits(a.name,desired)).sort((a,b)=>Number(normalize(b.name)===normalize(desired))-Number(normalize(a.name)===normalize(desired))||a.date.localeCompare(b.date))[0];
  if(!album){console.log(`Album unavailable: ${seed.name} / ${desired}`);continue;}
  if(!checkpoint.albums[album.id]){
   const items=[];for(let offset=0;;offset+=10){const page=await spotify(`albums/${album.id}/tracks?limit=10&offset=${offset}`);items.push(...page.items);if(!page.next)break;}
   checkpoint.albums[album.id]=items;await save();
  }
  tracks.push(...checkpoint.albums[album.id]);
 }
 // Explicit Italian singles for the band whose studio albums are in English.
 if(!seed.albums.length)for(const title of seed.allow.filter(t=>!seed.exclude?.some(x=>normalize(x)===normalize(t)))){
  const key=`single:${artist.id}:${normalize(title)}`;
  if(!checkpoint.albums[key]){
   const result=await spotify(`search?${new URLSearchParams({q:`track:${title} artist:${seed.name}`,type:'track',limit:'10'})}`);
   const found=result.tracks.items.filter(t=>t.artists[0]?.id===artist.id&&titleKey(t.name)===normalize(title)&&!badVersion(t.name));
   // Same recording reissued on a compilation is allowed; ambiguous durations stay out.
   checkpoint.albums[key]=found.length&&Math.max(...found.map(t=>t.duration_ms))-Math.min(...found.map(t=>t.duration_ms))<=2000?[found.find(t=>t.album?.album_type==='single')||found[0]]:[];await save();
  }
  tracks.push(...checkpoint.albums[key]);
 }
 const seen=new Set();const eligible=tracks.filter(t=>{
  const key=titleKey(t.name);if(seen.has(key)||!eligibleTrack(t,seed,artist.id))return false;
  seen.add(key);return true;
 });
 pools.push({seed,artist,tracks:eligible});console.log(`${seed.name}: ${eligible.length} editorial candidates`);
}
const order=[];for(let index=0;pools.some(p=>p.tracks[index]);index++)for(const p of pools)if(p.tracks[index])order.push({...p,track:p.tracks[index]});
const seenIsrc=new Set(baseline.map(r=>r.isrc).filter(Boolean));
const seenNames=new Set(baseline.map(r=>`${normalize(r.artist)}:${titleKey(r.title)}`));
const selected=[];
async function lyrics(track,seed){
 if(Object.hasOwn(checkpoint.lyrics,track.id))return checkpoint.lyrics[track.id];
 const request=async(path,params)=>{
  const url=new URL(path,'https://lrclib.net');if(params)url.search=new URLSearchParams(params);
  for(let i=0;i<6;i++){await new Promise(r=>setTimeout(r,350));const response=await fetch(url,{headers:{'User-Agent':'SottoLocalCatalog/0.1'},signal:AbortSignal.timeout(20000)});if(response.status===404)return null;if([429,503].includes(response.status)){const wait=Number(response.headers.get('Retry-After')||Math.min(16,2**(i+1)));if(wait>60)throw new Error('LRCLIB cooldown; checkpoint retained.');await new Promise(r=>setTimeout(r,Math.max(1,wait)*1000));continue;}if(!response.ok)throw new Error(`LRCLIB HTTP ${response.status}; checkpoint retained.`);return response.json();}throw new Error('LRCLIB retries exhausted; checkpoint retained.');
 };
 const exact=await request('/api/get',{track_name:track.name,artist_name:seed.name,duration:String(track.duration_ms/1000)});
 const candidates=exact?[exact]:await request('/api/search',{track_name:track.name,artist_name:seed.name})||[];
 const matches=candidates.filter(c=>matchesLyrics(c,track.name,seed.name,track.duration_ms));
 const row=matches.length===1?matches[0]:null;
 let language='unavailable';
 const text=row?.plainLyrics||row?.syncedLyrics?.replace(/\[[^\]]+\]/g,'')||'';
 if(text.trim().length>100){
  const py=spawnSync('.sites-runtime/translation-venv/Scripts/python.exe',['-c','import sys,json; from langdetect import detect_langs,DetectorFactory; DetectorFactory.seed=0; print(json.dumps({p.lang:p.prob for p in detect_langs(sys.stdin.read())}))'],{input:text,encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  if(py.status===0){const scores=JSON.parse(py.stdout);language=scores.it>=0.7?'italian-likely':Object.values(scores).some(v=>v>=0.9)?'foreign-likely':'uncertain';}
 }
 const value={row,language,matchCount:matches.length};checkpoint.lyrics[track.id]=value;await save();return value;
}
for(const {seed,artist,track} of order){
 if(selected.length>=target)break;
 const nameKey=`${normalize(seed.name)}:${titleKey(track.name)}`;
 if(seenNames.has(nameKey))continue;
 if(!checkpoint.tracks[track.id]){checkpoint.tracks[track.id]=await spotify(`tracks/${track.id}`);await save();}
 const full=checkpoint.tracks[track.id];const isrc=full.external_ids?.isrc;
 if(isrc&&seenIsrc.has(isrc))continue;
 const found=await lyrics(full,seed);
 if(found.language==='foreign-likely'||found.row?.instrumental){console.log(`Excluded language/instrumental candidate: ${seed.name} / ${full.name}`);continue;}
 const id=recordingId(isrc,nameKey);
 const r={id,title:full.name,artist:seed.name,artistId:`editorial:${normalize(seed.name)}`,isrc,durationMs:full.duration_ms,genre:seed.genre,explicit:full.explicit,sourceUrl:seed.source||`https://open.spotify.com/artist/${artist.id}`,mapping:{status:'verified',track:full,evidence:{method:'editorial-album-track-identity',albumId:full.album.id,spotifyArtistId:artist.id,approvalMethod:'owner-authorized-prototype-auto-approval',manuallyVerified:false}},languageCheck:found.language};
 selected.push(r);seenNames.add(nameKey);if(isrc)seenIsrc.add(isrc);
 checkpoint.selection=selected;await save();
 if(selected.length%10===0)console.log(`Selected ${selected.length}/${target} new recordings`);
}
let sql=exportCatalogSQL(selected).replace(/COMMIT;\s*$/,'');
for(const r of selected)sql+=`\nINSERT INTO catalog_reviews(recording_id,status,language_status,reviewer,evidence_json,reviewed_at) VALUES (${[r.id,'approved','italian-throughout','owner-authorized-prototype-auto-approval',JSON.stringify({method:'automatic-prototype-approval',languageAssumed:true,languageVerified:false,listenedEntireRecording:false,languageScreen:r.languageCheck,sources:[r.sourceUrl],notes:'Owner authorized automatic Italian designation for private learning catalog; heuristic screening is not a manual full-recording review.'}),Date.now()].map(sqlString).join(',')}) ON CONFLICT(recording_id) DO NOTHING;`;
sql+='\nCOMMIT;';await writeFile(`${dir}/catalog.sql`,sql);
const cache=await read('.sites-runtime/lrclib-coverage/packages.json',[]);
for(const r of selected){if(cache.some(c=>c.recordingId===r.id))continue;const row=checkpoint.lyrics[r.mapping.track.id]?.row;cache.push({recordingId:r.id,package:row?lyricsPackage(row,r.id,r.durationMs):null});}
await writeFile('.sites-runtime/lrclib-coverage/packages.json',JSON.stringify(cache));
const now=Date.now();const lyricSql=['PRAGMA foreign_keys=ON;','BEGIN TRANSACTION;'];
for(const r of cache)lyricSql.push(`INSERT INTO provider_lyrics VALUES (${[r.recordingId,'lrclib',r.package?'synced':'unavailable',r.package?JSON.stringify(r.package):null,now,now+(r.package?7:1)*86400000].map(sqlString).join(',')}) ON CONFLICT(recording_id) DO UPDATE SET status=excluded.status,package_json=excluded.package_json,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at;`);
lyricSql.push('COMMIT;');await writeFile(`${dir}/lyrics.sql`,lyricSql.join('\n'));
console.log(JSON.stringify({baseline:baseline.length,added:selected.length,total:baseline.length+selected.length,artistsAdded:new Set(selected.map(r=>r.artist)).size,syncedNew:cache.filter(r=>selected.some(s=>s.id===r.recordingId)&&r.package).length}));
if(selected.length<target)throw new Error('Editorial pool exhausted before target; prepared SQL retained for inspection.');
