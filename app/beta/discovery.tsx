'use client';
import { useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronDown, Music2, Pause, Play, Settings2, SkipBack, SkipForward, Volume2, VolumeX, X, Check, Plus, Shuffle, Repeat, Repeat1 } from 'lucide-react';
import { activeLine, defaultPreferences, genres, moods, type LearningPackage, type Preferences, type Recording, type Sense } from '../../lib/discovery';
import { SpotifyPlayback, type PlaybackState } from '../../lib/spotify-player';
import { LearningWord, WordPopup, type WordSelection, type Family, type Membership } from './learning-word';
import { WordPlaybackGate } from '../../lib/word-playback';
import { SaveSound } from '../../lib/save-sound';
import { orderUpcoming, endedAction, nextRepeat, type RepeatMode } from '../../lib/playback-modes';
import { VolumeControl } from './volume-control';
const names = { pop: 'Pop', indie: 'Indie / alternative', rap: 'Rap / urban', rock: 'Rock', classics: 'Songwriters / classics' };
const clock = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
async function api(path: string, body?: unknown) { const r = await fetch(path, { cache: 'no-store', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }); const p: any = await r.json(); if (!r.ok)
    throw Object.assign(new Error(p.error || 'Request failed.'), { code: p.code, status: r.status }); return p; }
const initialState: PlaybackState = { positionMs: 0, durationMs: 0, paused: true, buffering: false, ready: false, uri: null, ended: false, error: null, image: null, title: null, artist: null };
export default function Discovery({initialTaste,initialSignedIn}: {initialTaste:{value:Preferences;revision:number}|null;initialSignedIn:boolean}) {
    const [shuffle,setShuffle]=useState(false), [repeat,setRepeat]=useState<RepeatMode>('off'), [volume,setVolume]=useState(.8);
    const originalOrder=useRef<Recording[]>([]), queueIndex=useRef(0), shuffled=useRef(false);
    shuffled.current=shuffle;
    const [tasteReady,setTasteReady]=useState(initialTaste!==null);
    const [backgroundMotion, setBackgroundMotion] = useState(false);
    const [soundEffects, setSoundEffects] = useState(true);
    const saveSound = useRef<SaveSound | null>(null), soundEnabled = useRef(true);
    if (!saveSound.current) saveSound.current = new SaveSound();
    const [tabVisible, setTabVisible] = useState(true);
    useEffect(() => {
        try { setBackgroundMotion(localStorage.getItem('sotto.backgroundMotion') !== 'off'); } catch { setBackgroundMotion(true); }
        try { setSoundEffects(localStorage.getItem('sotto.soundEffects') !== 'off'); } catch { /* Use default feedback. */ }
        const visibility = () => setTabVisible(!document.hidden);
        visibility();
        document.addEventListener('visibilitychange', visibility);
        return () => document.removeEventListener('visibilitychange', visibility);
    }, []);
    function changeBackgroundMotion(enabled: boolean) {
        setBackgroundMotion(enabled);
        try { localStorage.setItem('sotto.backgroundMotion', enabled ? 'on' : 'off'); } catch { /* Optional device preference. */ }
    }
    function changeSoundEffects(enabled: boolean) {
        setSoundEffects(enabled);
        if (!enabled) saveSound.current?.close();
        try { localStorage.setItem('sotto.soundEffects', enabled ? 'on' : 'off'); } catch { /* Optional device preference. */ }
    }
    const [preferences, setPreferences] = useState<Preferences>(initialTaste?.value || defaultPreferences), [draft, setDraft] = useState<Preferences>(initialTaste?.value || defaultPreferences), [setup, setSetup] = useState(initialTaste !== null && initialTaste.revision === 0), [settings, setSettings] = useState(false), [signedIn, setSignedIn] = useState(initialSignedIn), [configured, setConfigured] = useState(false), [connected, setConnected] = useState(false), [catalogOwner, setCatalogOwner] = useState(false), [records, setRecords] = useState<Recording[]>([]), [index, setIndex] = useState(0), [cursor, setCursor] = useState<string | null>(null), [exhausted, setExhausted] = useState(false), [loading, setLoading] = useState(false), [notice, setNotice] = useState(''), [state, setState] = useState(initialState), [packs, setPacks] = useState<Record<string, LearningPackage | null>>({}), [word, setWord] = useState<WordSelection | null>(null), [progress, setProgress] = useState<Record<string, {
        status: string;
        encounters: number;
    }>>({}), [view, setView] = useState<'feed' | 'vocab'>('feed'), [dismissedError, setDismissedError] = useState<string | null>(null), [translations, setTranslations] = useState<'all' | 'smart' | 'off'>('all'), [busy, setBusy] = useState(false);
    const adapter = useRef<SpotifyPlayback | null>(null), feed = useRef<HTMLDivElement>(null), loadingRef = useRef(false), generation = useRef(0), resumeWord = useRef<string | null>(null), seenLines = useRef(new Set<string>()), endedHandled = useRef(false), returnFocus = useRef<HTMLElement | null>(null), dialog = useRef<HTMLElement | null>(null), intent = useRef(false);
    const muted=volume===0;
    soundEnabled.current = soundEffects && !muted;
    useEffect(() => { if (!soundEffects || muted) saveSound.current?.close(); }, [soundEffects, muted]);
    useEffect(() => () => saveSound.current?.close(), []);
    const [families, setFamilies] = useState<Family[]>([{id:'favorites',name:'Favorites'}]), [memberships,setMemberships]=useState<Membership[]>([]), [wordStatus,setWordStatus]=useState('loading'), [lookupRevision,setLookupRevision]=useState(0);
    const wordAnchor=useRef<HTMLElement|null>(null), recordingId=useRef<string|undefined>(undefined), saving=useRef(new Set<string>()), translatingSaved=useRef(new Set<string>()), mounted=useRef(true);
    const gate=useRef<WordPlaybackGate|null>(null);
    if (!gate.current) gate.current=new WordPlaybackGate(async()=>{await adapter.current?.pause();},async()=>{await adapter.current?.resume();},()=>recordingId.current);
    queueIndex.current=index;
    const recording = records[index];
    recordingId.current=recording?.id;
    useEffect(()=>{api('/api/vocabulary/families').then(p=>{setFamilies(p.families);setMemberships(p.memberships);}).catch(()=>{});},[]);
    useEffect(()=>{
        if (!word) return;
        if (word.translation) {setWordStatus('ready');return;}
        let alive=true, timer:ReturnType<typeof setTimeout>, attempts=0;
        setWordStatus('loading');
        async function lookup(){try{
            const p=await api(`/api/words?recordingId=${encodeURIComponent(word!.recordingId)}&lineId=${encodeURIComponent(word!.lineId)}&wordId=${encodeURIComponent(word!.id)}`);
            if(!alive)return;setWordStatus(p.status);setWord(old=>old?.id===word!.id?{...old,...p.sense}:old);
            if(p.status==='pending' && ++attempts<30) timer=setTimeout(lookup,1500);
            else if(p.status==='pending')setWordStatus('unavailable');
            if(!seenLines.current.has(word!.id)){seenLines.current.add(word!.id);void api('/api/vocabulary',{wordIds:[word!.id],status:'encountered'}).then(()=>setProgress(old=>({...old,[word!.id]:{status:old[word!.id]?.status||'encountered',encounters:(old[word!.id]?.encounters||0)+1}}))).catch(()=>seenLines.current.delete(word!.id));}
        }catch{if(alive)setWordStatus('unavailable');}}
        void lookup();return()=>{alive=false;clearTimeout(timer);};
    },[word?.id,lookupRevision]);
    useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;gate.current?.cancel();if('speechSynthesis' in window)speechSynthesis.cancel();};},[]);
    const pack = recording ? packs[recording.id] : null;
    const position = recording && state.uri === recording.spotifyUri ? state.positionMs : 0;
    const lineIndex = pack ? activeLine(pack.lines, position) : -1;
    useEffect(() => { const player = new SpotifyPlayback(); adapter.current = player; const unsub = player.subscribe(setState); return () => { unsub(); player.disconnect(); }; }, []);
    useEffect(()=>{void adapter.current?.setVolume(volume).catch(e=>setNotice(e.message));},[volume]);
    useEffect(() => { if (connected) void adapter.current?.connect().catch(e => setNotice(e.message)); }, [connected]);
    useEffect(() => { api('/api/spotify/status').then(p => { setSignedIn(true); setConfigured(p.configured); setConnected(p.connected); setCatalogOwner(p.catalogOwner === true); }).catch(e => { if (e.status !== 401)
        setNotice(e.message); }); api('/api/vocabulary?canonical=1').then(p => setProgress(Object.fromEntries(p.progress.map((v: any) => [v.wordId, v])))).catch(() => { }); if (new URLSearchParams(location.search).get('spotify') === 'denied')
        setNotice('Spotify connection was cancelled. You can try again.'); }, []);
    useEffect(() => {
        if(initialTaste!==null)return;
        let alive=true;
        api('/api/preferences').then(p=>{
            if(!alive)return;
            setPreferences(p.value);setDraft(p.value);setSetup(p.revision===0);
        }).catch(e=>{
            if(!alive)return;
            if(e.status===401){
                let skipped=false;try{skipped=localStorage.getItem('sotto.guestTasteSkipped')==='yes';}catch{}
                setSetup(!skipped);
            }else{
                setSetup(false);setNotice('Saved styles could not load. Try refreshing, or open settings to retry.');
            }
        }).finally(()=>{if(alive)setTasteReady(true);});
        return()=>{alive=false;};
    },[initialTaste]);
    useEffect(() => { if (view === 'feed' && feed.current)
        feed.current.scrollTop = index * feed.current.clientHeight; }, [view]);
    useEffect(() => { if (signedIn && tasteReady && !setup)
        void fetchFeed(true); }, [signedIn, tasteReady, setup]);
    async function fetchFeed(reset = false) { if (loadingRef.current && !reset)
        return; const run = reset ? ++generation.current : generation.current; loadingRef.current = true; setLoading(true); try {
        const p = await api(`/api/feed${!reset && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
        if (run !== generation.current)
            return;
        if(reset)originalOrder.current=p.recordings;
        else originalOrder.current=[...originalOrder.current,...p.recordings.filter((r:Recording)=>!originalOrder.current.some(o=>o.id===r.id))];
        setRecords(old=>{const merged=reset?p.recordings:[...old,...p.recordings.filter((r:Recording)=>!old.some(o=>o.id===r.id))];return orderUpcoming(merged,reset?0:queueIndex.current,shuffled.current,originalOrder.current);});
        setCursor(p.cursor);
        setExhausted(p.exhausted);
        if (reset) {
            setIndex(0);
            feed.current?.scrollTo({ top: 0 });
        }
        setNotice('');
    }
    catch (e) {
        if (run === generation.current)
            setNotice((e as Error).message);
    }
    finally {
        if (run === generation.current) {
            loadingRef.current = false;
            setLoading(false);
        }
    } }
    useEffect(() => { if (records.length - index <= 5 && cursor && !exhausted && tasteReady && !setup)
        void fetchFeed(); }, [index, records.length, cursor, exhausted, tasteReady, setup]);
    useEffect(() => { if (!recording || Object.hasOwn(packs, recording.id))
        return; let alive = true; api(`/api/songs/${encodeURIComponent(recording.id)}/learning`).then(p => { if (alive)
        setPacks(old => ({ ...old, [recording.id]: p.package })); }).catch(() => { if (alive)
        setPacks(old => ({ ...old, [recording.id]: null })); }); return () => { alive = false; }; }, [recording?.id, packs]);
    useEffect(() => {
        if (!recording || pack?.translationStatus !== 'pending') return;
        let alive = true;
        const timer = setTimeout(() => { api(`/api/songs/${encodeURIComponent(recording.id)}/learning`).then(p => {
            if (alive && p.package) setPacks(old => ({ ...old, [recording.id]: p.package }));
        }).catch(() => {}); }, 3000);
        return () => { alive = false; clearTimeout(timer); };
    }, [recording?.id, pack]);
    function go(next: number, scroll = true) { if (next < 0 || next >= records.length || next === index)
        return; const continuePlaying = intent.current || !state.paused; adapter.current?.select(records[next]); endedHandled.current = false; setIndex(next); setWord(null); gate.current?.cancel(); if('speechSynthesis' in window)speechSynthesis.cancel(); resumeWord.current = null; if (scroll && feed.current)
        feed.current.scrollTo({ top: next * feed.current.clientHeight, behavior: Math.abs(next-index)>1 || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); if (continuePlaying) {
        intent.current = true;
        void adapter.current?.play(records[next]).catch(e => { intent.current = false; setNotice(e.message); });
    }
    else
        void adapter.current?.pause(); }
    function changeShuffle(){const enabled=!shuffle;shuffled.current=enabled;setShuffle(enabled);setRecords(old=>orderUpcoming(old,index,enabled,originalOrder.current));}
    function changeRepeat(){const mode=nextRepeat(repeat);setRepeat(mode);}
    useEffect(() => {
        if(!state.ended){endedHandled.current=false;return;}
        if(endedHandled.current || !recording || state.uri!==recording.spotifyUri || word || view!=='feed')return;
        const action=endedAction(index,records.length,repeat,exhausted);
        if(action.kind==='wait'){setNotice('Loading more songs…');if(cursor && !loadingRef.current)void fetchFeed();return;}
        endedHandled.current=true;intent.current=true;
        if(action.kind==='restart')void adapter.current?.play(recording).catch(e=>{intent.current=false;setNotice(e.message);});
        else if(action.kind==='next')go(action.index);
        else{intent.current=false;void adapter.current?.pause();setNotice('You’ve explored this catalog. Reshuffle to listen again.');}
    },[state.ended,index,records.length,repeat,exhausted,cursor,word,view]);
    useEffect(() => { function key(e: KeyboardEvent) { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)
        return; if (e.key === 'Escape') {
        if (word)
            closeWord();
        setSettings(false);
        return;
    } if (setup || settings || word || view !== 'feed')
        return; if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        void toggle();
    } if (e.key === 'ArrowDown') {
        e.preventDefault();
        go(index + 1);
    } if (e.key === 'ArrowUp') {
        e.preventDefault();
        go(index - 1);
    } } window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); });
    useEffect(() => { if (!settings && !setup)
        return; returnFocus.current = document.activeElement as HTMLElement; const target = dialog.current; target?.querySelector<HTMLElement>('button,a,input,select')?.focus(); function trap(e: KeyboardEvent) { if (e.key !== 'Tab' || !target)
        return; const items = [...target.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select')]; if (!items.length)
        return; const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    }
    else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    } } document.addEventListener('keydown', trap); return () => { document.removeEventListener('keydown', trap); returnFocus.current?.focus(); }; }, [settings, setup]);
    async function toggle() { if (!recording || busy)
        return; if (!connected) {
        setSettings(true);
        return;
    } try {
        setDismissedError(null);
        setNotice('');
        if (!state.paused && state.uri === recording.spotifyUri) {
            intent.current = false;
            await adapter.current?.pause();
        }
        else {
            intent.current = true;
            if (state.ready && state.uri === recording.spotifyUri)
                await adapter.current?.resume();
            else
                await adapter.current?.play(recording);
        }
    }
    catch (e) {
        intent.current = false;
        setNotice((e as Error).message);
    } }
    async function savePreferences(value: Preferences) { setBusy(true); try {
        await api('/api/preferences', value);
        setPreferences(value);
        setDraft(value);
        intent.current = false;
        setSetup(false);
        setSettings(false);
        try { await adapter.current?.pause(); } catch { /* Preference saving already succeeded. */ }
        if (!setup)
            await fetchFeed(true);
    }
    catch (e) {
        setNotice((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function connect() { setBusy(true); try {
        const p = await api('/api/spotify/connect', {});
        location.assign(p.url);
    }
    catch (e) {
        setNotice((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function disconnect() { setBusy(true); intent.current = false; adapter.current?.disconnect(); try {
        await api('/api/spotify/disconnect', {});
        setConnected(false);
        setNotice('Spotify disconnected. Your vocabulary and style choices are preserved.');
    }
    catch (e) {
        setNotice((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    function openWord(s: Sense, lineId: string, anchor: HTMLButtonElement) {
        if(!recording)return;wordAnchor.current=anchor;
        void gate.current?.open(recording.id,!state.paused && state.uri===recording.spotifyUri).catch(e=>setNotice(e.message));
        setWord(old=>old?.id===s.id?{...old,lineId,recordingId:recording.id}:{...s,lineId,recordingId:recording.id});
    }
    function closeWord() { setWord(null); if('speechSynthesis' in window)speechSynthesis.cancel();void gate.current?.close().catch(e=>setNotice(e.message)); }
    async function completeSavedMeaning(selection:WordSelection){
        if(!selection.id.startsWith('lw:')||selection.translation||translatingSaved.current.has(selection.id))return;
        translatingSaved.current.add(selection.id);
        try{for(let i=0;i<30&&mounted.current;i++){
            const p=await api(`/api/words?recordingId=${encodeURIComponent(selection.recordingId)}&lineId=${encodeURIComponent(selection.lineId)}&wordId=${encodeURIComponent(selection.id)}`);
            if(!mounted.current)return;
            if(p.status==='ready'){setProgress(old=>({...old}));return;}
            if(p.status!=='pending')return;
            await new Promise(r=>setTimeout(r,1500));
        }}catch{/* Saving remains available when translation is offline. */}finally{translatingSaved.current.delete(selection.id);}
    }
    async function saveFamily(selection:WordSelection,familyId:string,remove=false){
        const key=selection.id+familyId;if(saving.current.has(key))return;saving.current.add(key);
        if(!remove && soundEnabled.current) saveSound.current?.prepare();
        try{const result=await api('/api/vocabulary/families',{action:remove?'remove':'save',wordId:selection.id,familyId,recordingId:selection.recordingId,lineId:selection.lineId});
            if(result.added && mounted.current && soundEnabled.current)saveSound.current?.play();
            setMemberships(old=>remove?old.filter(m=>m.wordId!==selection.id||m.familyId!==familyId):old.some(m=>m.wordId===selection.id&&m.familyId===familyId)?old:[...old,{wordId:selection.id,familyId}]);
            if(!remove)setProgress(old=>({...old,[selection.id]:{status:old[selection.id]?.status==='learned'?'learned':'saved',encounters:old[selection.id]?.encounters||1}}));
            setNotice(remove?'Removed from family.':familyId==='favorites'?'Added to Favorites.':'Added to vocabulary family.');
            if(!remove)void completeSavedMeaning(selection);
        }catch(e){setNotice((e as Error).message);}finally{saving.current.delete(key);}
    }
    async function createFamily(name:string){if(!word)return;if(soundEnabled.current)saveSound.current?.prepare();try{const p=await api('/api/vocabulary/families',{action:'create',name});setFamilies(old=>old.some(f=>f.id===p.family.id)?old:[...old,p.family]);await saveFamily(word,p.family.id);}catch(e){setNotice((e as Error).message);}}
    async function saveWord(id: string, status: string) { setBusy(true); try {
        await api('/api/vocabulary', { wordIds: [id], status });
        setProgress(old => ({ ...old, [id]: { status, encounters: old[id]?.encounters || 0 } }));
        setNotice(status === 'learned' ? 'Marked as learned.' : 'Saved to vocabulary.');
    }
    catch (e) {
        setNotice((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    useEffect(() => { if (!pack || lineIndex < 0 || state.paused || !signedIn)
        return; const line = pack.lines[lineIndex]; if (seenLines.current.has(line.id))
        return; const ids = [...new Set(line.tokens.flatMap(t => t.sense?.translation ? [t.sense.id] : []))]; if (!ids.length)
        return; seenLines.current.add(line.id); api('/api/vocabulary', { wordIds: ids, status: 'encountered' }).then(() => setProgress(old => { const next = { ...old }; for (const id of ids)
        next[id] = { status: old[id]?.status || 'encountered', encounters: (old[id]?.encounters || 0) + 1 }; return next; })).catch(() => seenLines.current.delete(line.id)); }, [pack, lineIndex, state.paused, signedIn]);
    const choices = <><h3>Your sound</h3><p>Choose up to three styles. Leave them empty for a balanced mix.</p><div className="beta-choices">{genres.map(g => <button key={g} aria-pressed={draft.genres.includes(g)} onClick={() => setDraft(p => ({ ...p, genres: p.genres.includes(g) ? p.genres.filter(x => x !== g) : p.genres.length < 3 ? [...p.genres, g] : p.genres }))}>{names[g]}</button>)}</div><h3>Your mood <small>optional</small></h3><div className="beta-choices">{moods.map(m => <button key={m} aria-pressed={draft.moods.includes(m)} onClick={() => setDraft(p => ({ ...p, moods: p.moods.includes(m) ? p.moods.filter(x => x !== m) : [...p.moods, m] }))}>{m}</button>)}</div><label className="beta-check"><input type="checkbox" checked={draft.learningOnly} onChange={e => setDraft(p => ({ ...p, learningOnly: e.target.checked }))}/> Learning-ready songs only</label><label className="beta-check"><input type="checkbox" checked={draft.explicit} onChange={e => setDraft(p => ({ ...p, explicit: e.target.checked }))}/> Allow explicit songs</label><label className="beta-check"><input type="checkbox" checked={backgroundMotion} onChange={e => changeBackgroundMotion(e.target.checked)}/> Animate background</label><label className="beta-check"><input type="checkbox" checked={soundEffects} onChange={e => changeSoundEffects(e.target.checked)}/> Word save sounds</label></>;
    return <div className="beta-shell" data-background-motion={backgroundMotion && tabVisible && !setup && !settings && !word && view === 'feed'}><header className="beta-header"><a href="/beta" className="mobile-brand">sotto<span>.</span></a><span className="beta-language">🇮🇹 Italian only</span><button aria-label="Discovery settings" onClick={() => { setDraft(preferences); setSettings(true); }}><Settings2 size={20}/></button></header>
 <main inert={setup || settings}>{view === 'feed' ? <>{records.length ? <div className="beta-feed" ref={feed} role="region" aria-label="Vertical Italian song feed" tabIndex={0} onScroll={e => { if (word || settings)
            return; const next = Math.round(e.currentTarget.scrollTop / e.currentTarget.clientHeight); if (next !== index)
            go(next, false); }}><div style={{ height: Math.max(0, index - 2) * 100 + 'dvh' }}/>{records.slice(Math.max(0, index - 2), index + 3).map((r, j) => { const card = Math.max(0, index - 2) + j; const current = card === index; return <section className="beta-card" key={r.id} aria-label={r.title} data-current={current}><div className="beta-backdrop" aria-hidden="true"><div className="beta-backdrop-shade"/></div><div className="beta-category"><span>{r.genres.map(g => names[g]).join(' · ')}</span>{current && <button onClick={() => { setDraft({ ...preferences, genres: [...new Set([...preferences.genres, ...r.genres])].slice(-3) }); setSettings(true); }}>More like this</button>}</div><div className="beta-content">{current && pack ? <div className="beta-lyrics"><p className="beta-lyric-status">{lineIndex < 0 ? position < pack.lines[0].startMs ? 'Instrumental introduction' : position >= pack.lines[pack.lines.length - 1].endMs ? 'End of learning excerpt' : 'Instrumental break' : pack.source ? 'Synced lyrics' : 'Tap a word to explore'}</p>{pack.lines.slice(Math.max(0, lineIndex - 1), Math.max(0, lineIndex - 1) + 3).map(l => <div className={`beta-line ${pack.lines[lineIndex]?.id === l.id ? 'active' : ''}`} key={l.id}><p lang="it">{l.tokens.map((t, k) => t.sense ? <LearningWord key={k} sense={t.sense} open={anchor=>openWord(t.sense!,l.id,anchor)} favorite={()=>{void saveFamily({...t.sense!,recordingId:r.id,lineId:l.id},'favorites');closeWord();}}/> : <span key={k}>{t.surface}</span>)}</p>{l.translation && translations !== 'off' && <p className="beta-translation">{translations === 'smart' && l.tokens.some(t => !!t.sense) && l.tokens.every(t => !t.sense || progress[t.sense.id]?.status === 'learned') ? 'You know this line' : l.translation}</p>}<button className="beta-replay" aria-label="Replay this lyric" onClick={() => void adapter.current?.seek(l.startMs).catch(e => setNotice(e.message))}>↻</button></div>)}{pack.source && <a className="beta-lyrics-source" href={pack.source.url} target="_blank" rel="noreferrer">Lyrics via {pack.source.provider} ↗</a>}{pack.translationStatus === 'pending' && <span className="beta-translation-status" role="status">Preparing English translation…</span>}{pack.translationProvider && <span className="beta-translation-status">Machine translated · {pack.translationProvider}</span>}</div> : <div className="beta-listening">{(current && state.uri === r.spotifyUri ? state.image : r.image) ? <img src={current && state.uri === r.spotifyUri ? state.image! : r.image!} alt={`${r.title} cover art`}/> : <Music2 size={60}/>}<span className="beta-mode">Listening only</span><h1>{r.title}</h1><p>{r.artist}</p><p className="beta-unavailable">Learning lyrics aren’t available for this song.</p></div>}</div><p className="beta-swipe"><ChevronDown size={14}/>{card === records.length - 1 && exhausted ? 'End of this discovery session' : 'Swipe for another Italian song'}</p></section>; })}<div style={{ height: Math.max(0, records.length - index - 3) * 100 + 'dvh' }}/></div> : <section className="beta-empty"><Music2 size={46}/><h1>{!tasteReady ? 'Loading your saved styles…' : loading ? 'Finding your next song…' : preferences.learningOnly ? 'No learning-ready songs yet' : connected ? 'Spotify is connected' : 'Your Italian feed is getting ready'}</h1><p>{preferences.learningOnly ? 'Try listening-only songs while learning coverage grows.' : connected ? 'There are no approved songs in this beta yet. Recordings need a Spotify match and a full language review before playback.' : 'Only reviewed Italian recordings appear here. Candidates awaiting review stay out of your feed.'}</p>{connected && <span className="beta-connection-success"><Check size={16}/>Account connected successfully</span>}{catalogOwner && <a href="/beta/review">Review catalog candidates</a>}<button onClick={() => void fetchFeed(true)} disabled={loading}>Refresh feed</button>{!signedIn && <a href="/signin-with-chatgpt?return_to=/beta" target="_top">Sign in with ChatGPT</a>}</section>}
 {recording && <footer className="beta-dock"><div className="beta-track">{(state.uri === recording.spotifyUri ? state.image : recording.image) && <img src={(state.uri === recording.spotifyUri ? state.image : recording.image)!} alt=""/>}<div><strong>{state.uri === recording.spotifyUri ? state.title || recording.title : recording.title}</strong><span>{state.uri === recording.spotifyUri ? state.artist || recording.artist : recording.artist}</span></div><button disabled={!pack?.lines.some(l => !!l.translation)} aria-label="Change translation help" onClick={() => setTranslations(v => v === 'all' ? 'smart' : v === 'smart' ? 'off' : 'all')}>{translations === 'all' ? 'EN' : translations === 'smart' ? 'Smart' : 'IT'}</button><a href={recording.spotifyUrl} target="_blank" rel="noreferrer">Spotify ↗</a></div><div className="beta-seek"><span>{clock(position)}</span><input aria-label="Playback position" type="range" min="0" max={state.uri === recording.spotifyUri ? state.durationMs : recording.durationMs} value={position} step="250" disabled={!state.ready || state.uri !== recording.spotifyUri} onChange={e => void adapter.current?.seek(Number(e.target.value)).catch(e => setNotice(e.message))}/><span>{clock(state.uri === recording.spotifyUri ? state.durationMs : recording.durationMs)}</span><VolumeControl value={volume} change={setVolume}/></div><span className="beta-player-status" role="status">{shuffle?'Shuffle on. ':'Shuffle off. '}{repeat==='one'?'Repeat one song.':repeat==='all'?'Repeat all songs.':'Repeat off.'}</span><div className="beta-controls"><button title={shuffle?'Turn shuffle off':'Shuffle upcoming songs'} aria-label="Shuffle" aria-pressed={shuffle} className="beta-mode-control" onClick={changeShuffle}><Shuffle size={20}/><span className="beta-active-dot"/></button><div><button aria-label="Previous song" disabled={index === 0 && !(repeat==='all' && exhausted && records.length>1)} onClick={() => go(index>0?index-1:records.length-1)}><SkipBack size={20}/></button><button className="beta-play" aria-label={!state.paused && state.uri === recording.spotifyUri ? 'Pause' : 'Play'} onClick={() => void toggle()}>{!state.paused && state.uri === recording.spotifyUri ? <Pause size={22} fill="currentColor"/> : <Play size={22} fill="currentColor"/>}</button><button aria-label="Next song" disabled={index === records.length - 1 && !(repeat==='all' && exhausted && records.length>1)} onClick={() => go(index+1<records.length?index+1:0)}><SkipForward size={20}/></button></div><button className="beta-mode-control" aria-label={`Repeat: ${repeat === 'one' ? 'one song' : repeat === 'all' ? 'all songs' : 'off'}`} aria-pressed={repeat!=='off'} title={repeat==='off'?'Repeat all songs':repeat==='all'?'Repeat this song':'Turn repeat off'} onClick={changeRepeat}>{repeat==='one'?<Repeat1 size={20}/>:<Repeat size={20}/>}<span className="beta-active-dot"/></button></div>{index === records.length - 1 && exhausted && <button className="beta-reshuffle" onClick={() => { intent.current = false; void adapter.current?.pause(); void fetchFeed(true); }}>Catalog explored · Reshuffle</button>}</footer>}</> : <section className="beta-vocabulary"><h1>Your vocabulary</h1><p>Your previously saved words are preserved.</p><Vocabulary progress={progress} update={saveWord} busy={busy} families={families} memberships={memberships}/></section>}
 <nav className="beta-nav"><button aria-current={view === 'feed' ? 'page' : undefined} onClick={() => setView('feed')}><Music2 size={18}/>Discover</button><button aria-current={view === 'vocab' ? 'page' : undefined} onClick={() => { intent.current = false; void adapter.current?.pause(); setView('vocab'); }}><Bookmark size={18}/>Vocabulary</button></nav></main>
 {(setup || settings) && <div className="modal-shade"><section ref={dialog} className="word-popup beta-settings" role="dialog" aria-modal="true" aria-label={setup ? 'Choose your musical taste' : 'Discovery settings'}>{!setup && <button className="popup-close" aria-label="Close settings" onClick={() => setSettings(false)}><X size={20}/></button>}<span className="eyebrow">ITALIAN, YOUR WAY</span><h2>{setup ? 'Find your sound' : 'Discovery settings'}</h2>{choices}<div className="beta-setup-status">{!signedIn ? <><p>Sign in to keep your preferences and connect Spotify.</p><a href="/signin-with-chatgpt?return_to=/beta" target="_top">Sign in with ChatGPT ↗</a></> : !configured ? <p>Spotify beta setup is pending. No recordings are presented as verified until catalog review is complete.</p> : connected ? <><p className="beta-connection-success"><Check size={16}/>Spotify connected</p><button onClick={() => void disconnect()} disabled={busy}>Disconnect Spotify</button></> : <button onClick={() => void connect()} disabled={busy}>Connect Spotify Premium</button>}</div><button className="accent-button" disabled={!signedIn || busy} onClick={() => void savePreferences(draft)}>{setup ? 'Start discovering' : 'Save preferences'}</button>{setup && <button className="beta-skip" disabled={busy} onClick={() => {
        if(signedIn){void savePreferences(defaultPreferences);return;}
        try{localStorage.setItem('sotto.guestTasteSkipped','yes');}catch{}
        setSetup(false);setPreferences(defaultPreferences);setDraft(defaultPreferences);
    }}>Skip taste setup</button>}<p className="popup-footnote">Personal learning prototype. LRCLIB lyrics are community supplied; timing and accuracy may vary. Provider terms still apply, and lyric reuse and translation permissions have not been established.</p><a href="/beta/privacy">Privacy & connection details</a></section></div>}
 {word && <WordPopup key={word.id} word={word} anchor={wordAnchor.current} status={wordStatus} favorite={memberships.some(m=>m.wordId===word.id&&m.familyId==='favorites')} families={families} memberships={memberships} close={closeWord} save={(familyId,remove)=>saveFamily(word,familyId,remove)} create={createFamily} wait={()=>gate.current!.wait()} retry={()=>setLookupRevision(v=>v+1)}/>}

 {(notice || (state.error && state.error !== dismissedError)) && <div className="toast" role="status"><span>{notice || state.error}</span><button aria-label="Dismiss message" onClick={() => { setNotice(''); setDismissedError(state.error); }}><X size={18}/></button></div>}
 </div>;
}
function Vocabulary({ progress, update, busy, families, memberships }: {
    progress: Record<string, {
        status: string;
        encounters: number;
    }>;
    update: (id: string, status: string) => Promise<void>;
    busy: boolean; families:Family[]; memberships:Membership[];
}) { const [filter,setFilter]=useState('all'); const [definitions, setDefinitions] = useState<Record<string, Sense>>({}); useEffect(() => { api('/api/vocabulary?canonical=1').then(p => setDefinitions(p.definitions || {})).catch(() => { }); }, [progress]); const entries = Object.entries(progress).filter(([, p]) => p.status !== 'encountered').filter(([id])=>filter==='all'||memberships.some(m=>m.wordId===id&&m.familyId===filter)); return <><div className="vocabulary-filters">{[{id:'all',name:'All words'},...families].map(f=><button key={f.id} aria-pressed={filter===f.id} onClick={()=>setFilter(f.id)}>{f.name}</button>)}</div>{entries.length ? <div className="vocab-grid">{entries.map(([id, p]) => <article className="vocab-card" key={id}><h2>{definitions[id]?.text || 'Loading word…'}</h2><p>{definitions[id]?.translation || 'Definition unavailable'}</p><span className="grammar">{definitions[id]?.grammar}</span><div><button disabled={busy} onClick={() => void update(id, p.status === 'learned' ? 'saved' : 'learned')}>{p.status === 'learned' ? 'Review again' : 'I know this'}</button></div></article>)}</div> : <p>No words here yet. Save a word from a song to start this collection.</p>}</>; }
