import test from 'node:test';
import assert from 'node:assert/strict';
import {bandSeeds} from '../scripts/band-seeds.mjs';
import {albumFits,badVersion,titleKey,recordingId,eligibleTrack} from '../scripts/band-catalog-tools.mjs';

test('Måneskin allowlist includes Italian hits and excludes their English catalog',()=>{
 const seed=bandSeeds.find(s=>s.name==='Måneskin');
 const track=name=>({name,artists:[{id:seed.spotifyId}]});
 for(const title of ['ZITTI E BUONI','CORALINE','VENT’ANNI','Torna a casa'])assert.equal(eligibleTrack(track(title),seed,seed.spotifyId),true);
 for(const title of ['Beggin’','I WANNA BE YOUR SLAVE','SUPERMODEL','THE LONELIEST','CORALINE - Live'])assert.equal(eligibleTrack(track(title),seed,seed.spotifyId),false);
 assert.equal(eligibleTrack({name:'CORALINE',artists:[{id:'unrelated-cover-artist'}]},seed,seed.spotifyId),false);
});
test('studio album variants exclude foreign and performance versions',()=>{
 assert.equal(albumFits('La Finestra (Deluxe Edition)','La finestra'),true);
 assert.equal(albumFits('Tango (40th Anniversary Remastered 2023)','Tango'),true);
 assert.equal(albumFits("L’amore e la violenza Vol. 2","L'amore e la violenza"),false);
 for(const name of ['Mamma Maria (Cantan En Español)','Live in Milano','Acustico','English Version','Remix','Instrumental'])assert.equal(badVersion(name),true);
 assert.equal(badVersion('Parsifal - 2014 Remaster'),false);
});
test('reissues deduplicate by title, while identifiers retain exact recording identity',()=>{
 assert.equal(titleKey('Io e te - 2014 Remaster'),titleKey('Io e te'));
 assert.equal(recordingId('IT1234567890','old-title'),recordingId('IT1234567890','new-title'));
 assert.notEqual(recordingId('IT1234567890','song'),recordingId('IT1234567891','song'));
});
