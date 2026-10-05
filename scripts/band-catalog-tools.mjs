import {createHash} from 'node:crypto';
import {normalize} from './catalog-tools.mjs';

export const badVersion = title => /\b(live|remix|karaoke|instrumental|demo|acoustic|acustic[oa]|radio edit|spanish|espa[nñ]ol|english|versione inglese)\b/i.test(title);
export const titleKey = title => normalize(title.replace(/\s*[-–]\s*(?:\d{4}\s*)?remaster(?:ed)?(?:\s*\d{4})?\s*$/i, ''));
export const albumFits = (name, desired) => normalize(name) === normalize(desired) || normalize(name).startsWith(normalize(desired)) && /deluxe|remaster|anniversary/i.test(name);
export const recordingId = (isrc, nameKey) => `editorial:${createHash('sha256').update(isrc || nameKey).digest('hex').slice(0, 24)}`;
export function eligibleTrack(track, seed, artistId) {
    const key = titleKey(track.name);
    return !badVersion(track.name) && track.artists[0]?.id === artistId
        && (!seed.allow || seed.allow.some(value => normalize(value) === key))
        && !seed.exclude?.some(value => normalize(value) === key);
}
