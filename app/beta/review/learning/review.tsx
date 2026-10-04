'use client';
import { useEffect, useState } from 'react';
export default function LearningReview() {
    const [packs, setPacks] = useState<any[]>([]), [notice, setNotice] = useState(''), [current, setCurrent] = useState<any>(null), [rights, setRights] = useState(false), [timing, setTiming] = useState(false), [match, setMatch] = useState(false), [source, setSource] = useState(''), [busy, setBusy] = useState(false);
    async function load() { const r = await fetch('/api/catalog/learning', { cache: 'no-store' }); const p: any = await r.json(); if (!r.ok)
        throw new Error(p.error); setPacks(p.packages); }
    useEffect(() => { load().catch(e => setNotice(e.message)); }, []);
    async function submit(approved: boolean) { setBusy(true); try {
        const r = await fetch('/api/catalog/learning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: current.id, approved, rightsVerified: rights, timingVerified: timing, recordingVerified: match, evidenceUrl: source }) });
        const p: any = await r.json();
        if (!r.ok)
            throw new Error(p.error);
        setCurrent(null);
        await load();
        setNotice('Package review saved. Provider suitability still controls learning availability.');
    }
    catch (e) {
        setNotice((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <main className="beta-document"><a href="/beta/review">← Catalog review</a><h1>Learning package review</h1><p>Approval does not enable Spotify synchronization. The separate provider-suitability gate must also pass.</p>{notice && <p role="status">{notice}</p>}{current ? <section className="beta-review-form"><h2>{current.title} · version {current.version}</h2><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(JSON.parse(current.rights_json), null, 2)}</pre><label>Review evidence URL<input type="url" value={source} onChange={e => setSource(e.target.value)}/></label>{[[rights, setRights, 'Source permits display, storage, translation and annotation'], [timing, setTiming, 'Timings were verified against this exact recording'], [match, setMatch, 'Text belongs to this exact recording']].map(([v, set, label], i) => <label key={i} className="beta-check"><input type="checkbox" checked={v as boolean} onChange={e => (set as (b: boolean) => void)(e.target.checked)}/>{label as string}</label>)}<div className="beta-review-actions"><button disabled={busy} onClick={() => void submit(true)}>Approve package</button><button disabled={busy} onClick={() => void submit(false)}>Withdraw approval</button><button onClick={() => setCurrent(null)}>Cancel</button></div></section> : packs.length ? <div className="vocab-grid">{packs.map(p => <article className="vocab-card" key={p.id}><h2>{p.title}</h2><p>{p.artist} · v{p.version} · {p.approved ? 'approved' : 'draft'}</p><button onClick={() => { setCurrent(p); setRights(false); setTiming(false); setMatch(false); setSource(''); }}>Review</button></article>)}</div> : <p>No learning packages imported. Listening-only songs remain available.</p>}</main>;
}
