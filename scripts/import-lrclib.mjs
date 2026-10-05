// Local, resumable preload using the previously audited LRCLIB recording IDs.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {lyricsPackage,matchesLyrics} from '../lib/lrclib.ts';
import {sqlString} from './catalog-tools.mjs';
const directory='.sites-runtime/lrclib-coverage';
const audit=JSON.parse(await readFile(`${directory}/results.json`,'utf8'));
await mkdir(directory,{recursive:true});
let cache=[];try{cache=JSON.parse(await readFile(`${directory}/packages.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(const item of audit.results){
 if(cache.some(c=>c.recordingId===item.recordingId))continue;
 let pack=null;
 if(item.status==='synced'){
  let response;
  for(let attempt=0;attempt<3;attempt++){
   await delay(350);
   response=await fetch(item.match.sourceUrl,{headers:{'User-Agent':'Sotto/0.1 (https://sotto-music-languages.jonathegreatest.chatgpt.site/)'},signal:AbortSignal.timeout(15000)});
   if(![429,503].includes(response.status))break;
   const wait=Math.max(1,Number(response.headers.get('Retry-After'))||2);if(wait>60)throw new Error('Provider cooldown; rerun importer later.');await delay(wait*1000);
  }
  if(!response.ok)throw new Error(`LRCLIB HTTP ${response.status}; importer checkpoint retained.`);
  const row=await response.json();
  if(matchesLyrics(row,item.title,item.artist,item.durationSeconds*1000))pack=lyricsPackage(row,item.recordingId,item.durationSeconds*1000);
 }
 cache.push({recordingId:item.recordingId,package:pack});
 await writeFile(`${directory}/packages.json`,JSON.stringify(cache));
 if(cache.length%20===0)console.log(`Prepared ${cache.length}/${audit.catalogSize} recordings`);
}
const now=Date.now();const sql=['PRAGMA foreign_keys=ON;','BEGIN TRANSACTION;'];
for(const row of cache)sql.push(`INSERT INTO provider_lyrics VALUES (${[row.recordingId,'lrclib',row.package?'synced':'unavailable',row.package?JSON.stringify(row.package):null,now,now+(row.package?7:1)*86400000].map(sqlString).join(',')}) ON CONFLICT(recording_id) DO UPDATE SET status=excluded.status,package_json=excluded.package_json,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at;`);
sql.push('COMMIT;');await writeFile(`${directory}/packages.sql`,sql.join('\n'));
console.log(JSON.stringify({recordings:cache.length,synchronized:cache.filter(x=>x.package).length}));
