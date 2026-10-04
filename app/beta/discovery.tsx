'use client';
import { useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronDown, Music2, Pause, Play, Settings2, SkipBack, SkipForward, Volume2, VolumeX, X, Check, Plus } from 'lucide-react';
import { activeLine, defaultPreferences, genres, moods, type LearningPackage, type Preferences, type Recording, type Sense } from '../../lib/discovery';
import { SpotifyPlayback, type PlaybackState } from '../../lib/spotify-player';
const names = { pop: 'Pop', indie: 'Indie / alternative', rap: 'Rap / urban', rock: 'Rock', classics: 'Songwriters / classics' };
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
async function api(path: string, body?: unknown) { const r = await fetch(path, { cache: 'no-store', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }); const p: any = await r.json(); if (!r.ok)
    throw Object.assign(new Error(p.error || 'Request failed.'), { code: p.code, status: r.status }); return p; }
const initialState: PlaybackState = { positionMs: 0, durationMs: 0, paused: true, buffering: false, ready: false, uri: null, ended: false, error: null, image: null, title: null, artist: null };
export default function Discovery() {
    const [preferences, setPreferences] = useState<Preferences>(defaultPreferences), [draft, setDraft] = useState<Preferences>(defaultPreferences), [setup, setSetup] = useState(true), [settings, setSettings] = useState(false), [signedIn, setSignedIn] = useState(false), [configured, setConfigured] = useState(false), [connected, setConnected] = useState(false), [records, setRecords] = useState<Recording[]>([]), [index, setIndex] = useState(0), [cursor, setCursor] = useState<string | null>(null), [exhausted, setExhausted] = useState(false), [loading, setLoading] = useState(false), [notice, setNotice] = useState(''), [state, setState] = useState(initialState), [packs, setPacks] = useState<Record<string, LearningPackage | null>>({}), [word, setWord] = useState<Sense | null>(null), [progress, setProgress] = useState<Record<string, {
        status: string;
        encounters: number;
    }>>({}), [view, setView] = useState<'feed' | 'vocab'>('feed'), [dismissedError, setDismissedError] = useState<string | null>(null), [translations, setTranslations] = useState<'all' | 'smart' | 'off'>('all'), [muted, setMuted] = useState(false), [busy, setBusy] = useState(false);
    const adapter = useRef<SpotifyPlayback | null>(null), feed = useRef<HTMLDivElement>(null), loadingRef = useRef(false), generation = useRef(0), resumeWord = useRef<string | null>(null), seenLines = useRef(new Set<string>()), endedHandled = useRef(false), returnFocus = useRef<HTMLElement | null>(null), dialog = useRef<HTMLElement | null>(null), intent = useRef(false);
    const recording = records[index];
    const pack = recording ? packs[recording.id] : null;
    const position = recording && state.uri === recording.spotifyUri ? state.positionMs : 0;
    const lineIndex = pack ? activeLine(pack.lines, position) : -1;
    useEffect(() => { const player = new SpotifyPlayback(); adapter.current = player; const unsub = player.subscribe(setState); return () => { unsub(); player.disconnect(); }; }, []);
    useEffect(() => { api('/api/spotify/status').then(p => { setSignedIn(true); setConfigured(p.configured); setConnected(p.connected); }).catch(e => { if (e.status !== 401)
        setNotice(e.message); }); api('/api/preferences').then(p => { setPreferences(p.value); setDraft(p.value); setSetup(!p.revision); }).catch(() => { }); api('/api/vocabulary?canonical=1').then(p => setProgress(Object.fromEntries(p.progress.map((v: any) => [v.wordId, v])))).catch(() => { }); if (new URLSearchParams(location.search).get('spotify') === 'denied')
        setNotice('Spotify connection was cancelled. You can try again.'); }, []);
    useEffect(() => { if (view === 'feed' && feed.current)
        feed.current.scrollTop = index * feed.current.clientHeight; }, [view]);
    useEffect(() => { if (signedIn && !setup)
        void fetchFeed(true); }, [signedIn, setup]);
    async function fetchFeed(reset = false) { if (loadingRef.current && !reset)
        return; const run = reset ? ++generation.current : generation.current; loadingRef.current = true; setLoading(true); try {
        const p = await api(`/api/feed${!reset && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
        if (run !== generation.current)
            return;
        setRecords(old => reset ? p.recordings : [...old, ...p.recordings.filter((r: Recording) => !old.some(o => o.id === r.id))]);
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
    useEffect(() => { if (records.length - index <= 5 && cursor && !exhausted && !setup)
        void fetchFeed(); }, [index, records.length, cursor, exhausted, setup]);
    useEffect(() => { if (!recording || Object.hasOwn(packs, recording.id))
        return; let alive = true; api(`/api/songs/${encodeURIComponent(recording.id)}/learning`).then(p => { if (alive)
        setPacks(old => ({ ...old, [recording.id]: p.package })); }).catch(() => { if (alive)
        setPacks(old => ({ ...old, [recording.id]: null })); }); return () => { alive = false; }; }, [recording?.id, packs]);
    function go(next: number, scroll = true) { if (next < 0 || next >= records.length || next === index)
        return; const continuePlaying = intent.current || !state.paused; endedHandled.current = false; setIndex(next); setWord(null); resumeWord.current = null; if (scroll && feed.current)
        feed.current.scrollTo({ top: next * feed.current.clientHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); if (continuePlaying) {
        intent.current = true;
        void adapter.current?.play(records[next]).catch(e => { intent.current = false; setNotice(e.message); });
    }
    else
        void adapter.current?.pause(); }
    useEffect(() => { if (!state.ended) {
        endedHandled.current = false;
        return;
    } if (!endedHandled.current && recording && state.uri === recording.spotifyUri) {
        endedHandled.current = true;
        if (index + 1 < records.length)
            go(index + 1);
        else {
            intent.current = false;
            void adapter.current?.pause();
            setNotice(exhausted ? 'You’ve explored this catalog. Reshuffle to listen again.' : 'Loading more songs…');
        }
    } }, [state.ended, index, records.length]);
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
    useEffect(() => { if (!word && !settings && !setup)
        return; returnFocus.current = document.activeElement as HTMLElement; const target = dialog.current; target?.querySelector<HTMLElement>('button,a,input,select')?.focus(); function trap(e: KeyboardEvent) { if (e.key !== 'Tab' || !target)
        return; const items = [...target.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select')]; if (!items.length)
        return; const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    }
    else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    } } document.addEventListener('keydown', trap); return () => { document.removeEventListener('keydown', trap); returnFocus.current?.focus(); }; }, [!!word, settings, setup]);
    async function toggle() { if (!recording || busy)
        return; if (!connected) {
        setSettings(true);
        return;
    } try {
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
        await adapter.current?.pause();
        setSetup(false);
        setSettings(false);
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
    function openWord(s: Sense) { resumeWord.current = !state.paused ? recording.id : null; void adapter.current?.pause(); setWord(s); }
    function closeWord() { setWord(null); if (resumeWord.current === recording?.id && connected) {
        intent.current = true;
        void adapter.current?.resume().catch(e => setNotice(e.message));
    } resumeWord.current = null; }
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
        return; const ids = [...new Set(line.tokens.flatMap(t => t.sense ? [t.sense.id] : []))]; if (!ids.length)
        return; seenLines.current.add(line.id); api('/api/vocabulary', { wordIds: ids, status: 'encountered' }).then(() => setProgress(old => { const next = { ...old }; for (const id of ids)
        next[id] = { status: old[id]?.status || 'encountered', encounters: (old[id]?.encounters || 0) + 1 }; return next; })).catch(() => seenLines.current.delete(line.id)); }, [pack, lineIndex, state.paused, signedIn]);
    const choices = <><h3>Your sound</h3><p>Choose up to three styles. Leave them empty for a balanced mix.</p><div className="beta-choices">{genres.map(g => <button key={g} aria-pressed={draft.genres.includes(g)} onClick={() => setDraft(p => ({ ...p, genres: p.genres.includes(g) ? p.genres.filter(x => x !== g) : p.genres.length < 3 ? [...p.genres, g] : p.genres }))}>{names[g]}</button>)}</div><h3>Your mood <small>optional</small></h3><div className="beta-choices">{moods.map(m => <button key={m} aria-pressed={draft.moods.includes(m)} onClick={() => setDraft(p => ({ ...p, moods: p.moods.includes(m) ? p.moods.filter(x => x !== m) : [...p.moods, m] }))}>{m}</button>)}</div><label className="beta-check"><input type="checkbox" checked={draft.learningOnly} onChange={e => setDraft(p => ({ ...p, learningOnly: e.target.checked }))}/> Learning-ready songs only</label><label className="beta-check"><input type="checkbox" checked={draft.explicit} onChange={e => setDraft(p => ({ ...p, explicit: e.target.checked }))}/> Allow explicit songs</label></>;
    return <div className="beta-shell"><header className="beta-header"><a href="/beta" className="mobile-brand">sotto<span>.</span></a><span className="beta-language">🇮🇹 Italian only</span><button aria-label="Discovery settings" onClick={() => { setDraft(preferences); setSettings(true); }}><Settings2 size={20}/></button></header>
 <main inert={setup || settings || !!word}>{view === 'feed' ? <>{records.length ? <div className="beta-feed" ref={feed} role="region" aria-label="Vertical Italian song feed" tabIndex={0} onScroll={e => { if (word || settings)
            return; const next = Math.round(e.currentTarget.scrollTop / e.currentTarget.clientHeight); if (next !== index)
            go(next, false); }}><div style={{ height: Math.max(0, index - 2) * 100 + 'dvh' }}/>{records.slice(Math.max(0, index - 2), index + 3).map((r, j) => { const card = Math.max(0, index - 2) + j; const current = card === index; return <section className="beta-card" key={r.id} aria-label={r.title}><div className="beta-backdrop"/><div className="beta-category"><span>{r.genres.map(g => names[g]).join(' · ')}</span>{current && <button onClick={() => { setDraft({ ...preferences, genres: [...new Set([...preferences.genres, ...r.genres])].slice(-3) }); setSettings(true); }}>More like this</button>}</div><div className="beta-content">{current && pack ? <div className="beta-lyrics"><p className="beta-lyric-status">{lineIndex < 0 ? position < pack.lines[0].startMs ? 'Instrumental introduction' : position >= pack.lines[pack.lines.length - 1].endMs ? 'End of learning excerpt' : 'Instrumental break' : 'Tap a word to explore'}</p>{pack.lines.slice(Math.max(0, lineIndex - 1), Math.max(0, lineIndex - 1) + 3).map(l => <div className={`beta-line ${pack.lines[lineIndex]?.id === l.id ? 'active' : ''}`} key={l.id}><p lang="it">{l.tokens.map((t, k) => t.sense ? <button key={k} onClick={() => openWord(t.sense!)}>{t.surface}</button> : <span key={k}>{t.surface}</span>)}</p>{translations !== 'off' && <p className="beta-translation">{translations === 'smart' && l.tokens.every(t => !t.sense || progress[t.sense.id]?.status === 'learned') ? 'You know this line' : l.translation}</p>}<button className="beta-replay" aria-label="Replay this lyric" onClick={() => void adapter.current?.seek(l.startMs).catch(e => setNotice(e.message))}>↻</button></div>)}</div> : <div className="beta-listening">{(current && state.uri === r.spotifyUri ? state.image : r.image) ? <img src={current && state.uri === r.spotifyUri ? state.image! : r.image!} alt={`${r.title} cover art`}/> : <Music2 size={60}/>}<span className="beta-mode">Listening only</span><h1>{r.title}</h1><p>{r.artist}</p><p className="beta-unavailable">Learning lyrics aren’t available for this song.</p></div>}</div><p className="beta-swipe"><ChevronDown size={14}/>{card === records.length - 1 && exhausted ? 'End of this discovery session' : 'Swipe for another Italian song'}</p></section>; })}<div style={{ height: Math.max(0, records.length - index - 3) * 100 + 'dvh' }}/></div> : <section className="beta-empty"><Music2 size={46}/><h1>{loading ? 'Finding your next song…' : preferences.learningOnly ? 'No learning-ready songs yet' : 'Your Italian feed is getting ready'}</h1><p>{preferences.learningOnly ? 'Try listening-only songs while learning coverage grows.' : 'Only reviewed Italian recordings appear here. Candidates awaiting review stay out of your feed.'}</p><button onClick={() => void fetchFeed(true)} disabled={loading}>Refresh feed</button>{!signedIn && <a href="/signin-with-chatgpt?return_to=/beta" target="_top">Sign in with ChatGPT</a>}</section>}
 {recording && <footer className="beta-dock"><div className="beta-track">{(state.uri === recording.spotifyUri ? state.image : recording.image) && <img src={(state.uri === recording.spotifyUri ? state.image : recording.image)!} alt=""/>}<div><strong>{state.uri === recording.spotifyUri ? state.title || recording.title : recording.title}</strong><span>{state.uri === recording.spotifyUri ? state.artist || recording.artist : recording.artist}</span></div><a href={recording.spotifyUrl} target="_blank" rel="noreferrer">Spotify ↗</a></div><div className="beta-seek"><span>{clock(position)}</span><input aria-label="Playback position" type="range" min="0" max={state.uri === recording.spotifyUri ? state.durationMs : recording.durationMs} value={position} step="250" disabled={!state.ready || state.uri !== recording.spotifyUri} onChange={e => void adapter.current?.seek(Number(e.target.value)).catch(e => setNotice(e.message))}/><span>{clock(state.uri === recording.spotifyUri ? state.durationMs : recording.durationMs)}</span></div><div className="beta-controls"><button disabled={!pack} aria-label="Change translation help" onClick={() => setTranslations(v => v === 'all' ? 'smart' : v === 'smart' ? 'off' : 'all')}>{translations === 'all' ? 'EN' : translations === 'smart' ? 'Smart' : 'IT'}</button><div><button aria-label="Previous song" disabled={index === 0} onClick={() => go(index - 1)}><SkipBack size={20}/></button><button className="beta-play" aria-label={!state.paused && state.uri === recording.spotifyUri ? 'Pause' : 'Play'} onClick={() => void toggle()}>{!state.paused && state.uri === recording.spotifyUri ? <Pause size={22} fill="currentColor"/> : <Play size={22} fill="currentColor"/>}</button><button aria-label="Next song" disabled={index === records.length - 1} onClick={() => go(index + 1)}><SkipForward size={20}/></button></div><button aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => { void adapter.current?.setVolume(muted ? .8 : 0).catch(e => setNotice(e.message)); setMuted(v => !v); }}>{muted ? <VolumeX size={20}/> : <Volume2 size={20}/>}</button></div>{index === records.length - 1 && exhausted && <button className="beta-reshuffle" onClick={() => { intent.current = false; void adapter.current?.pause(); void fetchFeed(true); }}>Catalog explored · Reshuffle</button>}</footer>}</> : <section className="beta-vocabulary"><h1>Your vocabulary</h1><p>Your previously saved words are preserved.</p><Vocabulary progress={progress} update={saveWord} busy={busy}/></section>}
 <nav className="beta-nav"><button aria-current={view === 'feed' ? 'page' : undefined} onClick={() => setView('feed')}><Music2 size={18}/>Discover</button><button aria-current={view === 'vocab' ? 'page' : undefined} onClick={() => { intent.current = false; void adapter.current?.pause(); setView('vocab'); }}><Bookmark size={18}/>Vocabulary</button></nav></main>
 {(setup || settings) && <div className="modal-shade"><section ref={dialog} className="word-popup beta-settings" role="dialog" aria-modal="true" aria-label={setup ? 'Choose your musical taste' : 'Discovery settings'}>{!setup && <button className="popup-close" aria-label="Close settings" onClick={() => setSettings(false)}><X size={20}/></button>}<span className="eyebrow">ITALIAN, YOUR WAY</span><h2>{setup ? 'Find your sound' : 'Discovery settings'}</h2>{choices}<div className="beta-setup-status">{!signedIn ? <><p>Sign in to keep your preferences and connect Spotify.</p><a href="/signin-with-chatgpt?return_to=/beta" target="_top">Sign in with ChatGPT ↗</a></> : !configured ? <p>Spotify beta setup is pending. No recordings are presented as verified until catalog review is complete.</p> : connected ? <button onClick={() => void disconnect()} disabled={busy}>Disconnect Spotify</button> : <button onClick={() => void connect()} disabled={busy}>Connect Spotify Premium</button>}</div><button className="accent-button" disabled={!signedIn || busy} onClick={() => void savePreferences(draft)}>{setup ? 'Start discovering' : 'Save preferences'}</button>{setup && <button className="beta-skip" onClick={() => { setSetup(false); setPreferences(defaultPreferences); setDraft(defaultPreferences); if (signedIn)
        void savePreferences(defaultPreferences); }}>Skip taste setup</button>}<p className="popup-footnote">A personal beta. No paid APIs or services.</p><a href="/beta/privacy">Privacy & connection details</a></section></div>}
 {word && <div className="modal-shade" onClick={closeWord}><section ref={dialog} className="word-popup" role="dialog" aria-modal="true" aria-label={`Definition of ${word.text}`} onClick={e => e.stopPropagation()}><button className="popup-close" aria-label="Close word definition" onClick={closeWord}><X size={20}/></button><h2 lang="it">{word.text}</h2><p className="word-meaning">{word.translation}</p><div className="word-details"><div><span>Base form</span><strong>{word.lemma}</strong></div><div><span>Grammar</span><strong>{word.grammar}</strong></div></div><div className="word-actions"><button disabled={busy} onClick={() => void saveWord(word.id, 'saved')}><Plus size={18}/>Save word</button><button disabled={busy} onClick={() => void saveWord(word.id, 'learned')}><Check size={18}/>I know this</button></div></section></div>}
 {(notice || (state.error && state.error !== dismissedError)) && <div className="toast" role="status"><span>{notice || state.error}</span><button aria-label="Dismiss message" onClick={() => { setNotice(''); setDismissedError(state.error); }}><X size={18}/></button></div>}
 </div>;
}
function Vocabulary({ progress, update, busy }: {
    progress: Record<string, {
        status: string;
        encounters: number;
    }>;
    update: (id: string, status: string) => Promise<void>;
    busy: boolean;
}) { const [definitions, setDefinitions] = useState<Record<string, Sense>>({}); useEffect(() => { api('/api/vocabulary?canonical=1').then(p => setDefinitions(p.definitions || {})).catch(() => { }); }, [progress]); const entries = Object.entries(progress).filter(([, p]) => p.status !== 'encountered'); return entries.length ? <div className="vocab-grid">{entries.map(([id, p]) => <article className="vocab-card" key={id}><h2>{definitions[id]?.text || id}</h2><p>{definitions[id]?.translation || 'Definition unavailable'}</p><span className="grammar">{definitions[id]?.grammar}</span><div><button disabled={busy} onClick={() => void update(id, p.status === 'learned' ? 'saved' : 'learned')}>{p.status === 'learned' ? 'Review again' : 'I know this'}</button></div></article>)}</div> : <p>Save a word from a learning-ready song to start your collection.</p>; }
