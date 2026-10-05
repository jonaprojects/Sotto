import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLrc,matchesLyrics,lyricsPackage} from '../lib/lrclib.ts';
import {activeLine,validLearning} from '../lib/discovery.ts';
test('LRC introductions, empty gaps, repeated choruses and fractional times',()=>{
 const lines=parseLrc('[00:02.5]Ciao\n[00:04.00]\n[00:06.00][00:09.00]Ancora',12000,'fixture');
 assert.equal(lines.length,3);assert.equal(lines[0].startMs,2500);assert.equal(lines[0].endMs,4000);
 assert.equal(activeLine(lines,0),-1);assert.equal(activeLine(lines,5000),-1);assert.equal(activeLine(lines,6000),1);
 assert.notEqual(lines[1].id,lines[2].id);
});
test('Malformed and out-of-range timing produces no lyrics',()=>{
 assert.deepEqual(parseLrc('[00:99]Invalid\n[00:02]Line',10000,'x'),[]);
 assert.deepEqual(parseLrc('[00:01]Line\n[00:20]Wrong version',10000,'x'),[]);
 assert.deepEqual(parseLrc('Untimed text',10000,'x'),[]);
});
test('Exact normalized metadata and two-second duration tolerance; no fabricated learning permission',()=>{
 const row={id:1,trackName:'Ciao',artistName:'Artista',duration:10,instrumental:false,syncedLyrics:'[00:01]Ciao\n[00:04]Ancora'};
 assert.equal(matchesLyrics(row,'CIAO','Artista',11000),true);
 assert.equal(matchesLyrics(row,'Ciao','Other',10000),false);
 assert.equal(matchesLyrics(row,'Ciao','Artista',14000),false);
 const pack=lyricsPackage(row,'r1',10000);assert.ok(pack);assert.equal(pack.source.permissionStatus,'unverified');
 assert.equal(pack.lines[0].translation,'');assert.equal(validLearning(pack,'r1',10000),false);
});
