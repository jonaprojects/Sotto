'use client';
import { useEffect, useState } from 'react';
import { genres, moods } from '../../../lib/discovery';
export default function Review() {
    const [filter, setFilter] = useState('pending'), [rows, setRows] = useState<any[]>([]), [counts, setCounts] = useState<any>({}), [notice, setNotice] = useState(''), [current, setCurrent] = useState<any>(null), [language, setLanguage] = useState('unknown'), [sources, setSources] = useState(''), [notes, setNotes] = useState(''), [listened, setListened] = useState(false), [match, setMatch] = useState(false), [tags, setTags] = useState<string[]>([]), [mood, setMood] = useState<string[]>([]), [explicit, setExplicit] = useState('unknown'), [busy, setBusy] = useState(false);
    async function load() { try {
        const res = await fetch(`/api/catalog/review?filter=${filter}`, { cache: 'no-store' });
        const p: any = await res.json();
        if (!res.ok)
            throw new Error(p.error);
        setRows(p.recordings);
        setCounts(p.counts);
    }
    catch (e) {
        setNotice((e as Error).message);
    } }
    useEffect(() => { void load(); }, [filter]);
    function select(r: any) { setCurrent(r); setLanguage(r.language_status || 'unknown'); setSources(''); setNotes(''); setListened(false); setMatch(false); setTags(JSON.parse(r.genres_json)); setMood(JSON.parse(r.moods_json)); setExplicit(r.explicit === null ? 'unknown' : r.explicit ? 'yes' : 'no'); }
    async function review(status: string) { setBusy(true); try {
        const res = await fetch('/api/catalog/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: current.id, status, languageStatus: language, sources: sources.split('\n').map(s => s.trim()).filter(Boolean), notes, listenedEntireRecording: listened, matchVerified: match, genres: tags, moods: mood, explicit: explicit === 'unknown' ? null : explicit === 'yes' }) });
        const p: any = await res.json();
        if (!res.ok)
            throw new Error(p.error);
        setCurrent(null);
        setNotice('Review saved.');
        await load();
    }
    catch (e) {
        setNotice((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <main className="beta-document"><a href="/beta">← Discovery</a><h1>Catalog review</h1><a href="/beta/review/learning">Review learning packages →</a><p>{counts.candidates || 0} candidates · {counts.approved || 0} approved · {counts.artists || 0} artists</p><p>Artist nationality and album language do not verify a recording’s sung language. Review the full exact recording before approval.</p><div className="beta-choices">{['pending', 'approved', 'rejected', 'unmatched', 'language'].map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div>{notice && <p role="status">{notice}</p>}
 {current ? <section className="beta-review-form"><h2>{current.title} · {current.artist}</h2><a href={current.source_url} target="_blank" rel="noreferrer">MusicBrainz record ↗</a>{current.spotify_uri && <a href={`https://open.spotify.com/track/${current.spotify_uri.split(':')[2]}`} target="_blank" rel="noreferrer">Exact Spotify candidate ↗</a>}<p>Match evidence: {current.match_evidence || 'No Spotify mapping yet. Run the local matching importer.'}</p><label>Language<select value={language} onChange={e => setLanguage(e.target.value)}>{['unknown', 'italian-throughout', 'mixed-language', 'dialect', 'instrumental'].map(v => <option key={v}>{v}</option>)}</select></label><label>Evidence URLs, one per line<textarea value={sources} onChange={e => setSources(e.target.value)}/></label><label>Review notes<textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000}/></label><label className="beta-check"><input type="checkbox" checked={listened} onChange={e => setListened(e.target.checked)}/>I reviewed the entire exact recording’s language</label><label className="beta-check"><input type="checkbox" checked={match} onChange={e => setMatch(e.target.checked)}/>I verified the Spotify recording match</label><h3>Editorial styles</h3><div className="beta-choices">{genres.map(g => <button key={g} aria-pressed={tags.includes(g)} onClick={() => setTags(v => v.includes(g) ? v.filter(x => x !== g) : [...v, g])}>{g}</button>)}</div><h3>Editorial moods</h3><div className="beta-choices">{moods.map(m => <button key={m} aria-pressed={mood.includes(m)} onClick={() => setMood(v => v.includes(m) ? v.filter(x => x !== m) : [...v, m])}>{m}</button>)}</div><label>Explicit content<select value={explicit} onChange={e => setExplicit(e.target.value)}><option value="unknown">Unknown</option><option value="yes">Explicit</option><option value="no">Not explicit</option></select></label><div className="beta-review-actions"><button disabled={busy} onClick={() => void review('approved')}>Approve</button><button disabled={busy} onClick={() => void review('rejected')}>Reject</button><button onClick={() => setCurrent(null)}>Cancel</button></div></section> : <div className="vocab-grid">{rows.map(r => <article className="vocab-card" key={r.id}><h2>{r.title}</h2><p>{r.artist}</p><span>{r.match_status || 'unmatched'} · {r.language_status || 'unknown language'}</span><button onClick={() => select(r)}>Review recording</button></article>)}</div>}</main>;
}
