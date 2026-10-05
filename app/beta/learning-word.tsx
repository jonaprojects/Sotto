'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus, Star, Volume2, X } from 'lucide-react';
import type { Sense } from '../../lib/discovery';
export type WordSelection = Sense & { recordingId: string; lineId: string };
export type Family = { id: string; name: string };
export type Membership = { wordId: string; familyId: string };
let lastWordClick = -Infinity;
export function LearningWord({ sense, open, favorite }: { sense: Sense; open: (anchor: HTMLButtonElement) => void; favorite: () => void }) {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null), last = useRef(0), lastFavorite = useRef(-Infinity);
    function instantFavorite() { if (timer.current) clearTimeout(timer.current); last.current=0; lastFavorite.current=performance.now(); favorite(); }
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
    return <button data-word-id={sense.id} aria-haspopup="dialog" aria-label={`Explore ${sense.text}`} onPointerEnter={e => {
        if (e.pointerType !== 'mouse' || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        const anchor = e.currentTarget;
        timer.current = setTimeout(() => { if (performance.now()-lastWordClick>500) open(anchor); }, 250);
    }} onPointerLeave={() => { if (timer.current) clearTimeout(timer.current); }} onClick={e => {
        if (timer.current) clearTimeout(timer.current);
        const now = performance.now();
        lastWordClick=now;
        if (e.detail >= 2 || (e.detail > 0 && last.current && now - last.current < 350)) instantFavorite();
        else { last.current = e.detail > 0 ? now : 0; open(e.currentTarget); }
    }} onDoubleClick={e => { e.preventDefault(); if (performance.now()-lastFavorite.current>350) instantFavorite(); }}>{sense.text}</button>;
}
export function WordPopup({ word, anchor, status, favorite, families, memberships, close, save, create, wait, retry }: {
    word: WordSelection; anchor: HTMLElement | null; status: string; favorite: boolean; families: Family[]; memberships: Membership[];
    close: () => void; save: (familyId: string, remove?: boolean) => Promise<void>; create: (name: string) => Promise<void>; wait: () => Promise<void>; retry: () => void;
}) {
    const box = useRef<HTMLElement>(null);
    const [chooser, setChooser] = useState(false), [name, setName] = useState(''), [busy, setBusy] = useState(false), [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]), [speaking, setSpeaking] = useState(false), [speechError, setSpeechError] = useState('');
    useEffect(() => {
        if (!('speechSynthesis' in window)) return;
        const load = () => setVoices(speechSynthesis.getVoices()); load();
        speechSynthesis.addEventListener('voiceschanged', load);
        return () => { speechSynthesis.removeEventListener('voiceschanged', load); speechSynthesis.cancel(); };
    }, []);
    useEffect(() => {
        const outside = (e: PointerEvent) => { const target = e.target as Node; if (!box.current?.contains(target) && !anchor?.contains(target) && !(target instanceof Element && target.closest('[data-word-id]'))) close(); };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [anchor, close]);
    const voice = voices.find(v => /^it(?:-|$)/i.test(v.lang));
    async function speak() {
        setSpeechError('');
        try {
            await wait(); if (!voice || !box.current) return;
            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(word.text);
            utterance.lang = 'it-IT'; utterance.voice = voice; utterance.rate = .85;
            utterance.onstart = () => setSpeaking(true); utterance.onend = () => setSpeaking(false);
            utterance.onerror = () => { setSpeaking(false); setSpeechError('Pronunciation could not play. Try again.'); };
            speechSynthesis.speak(utterance);
        } catch { setSpeechError('Pause the song before trying pronunciation again.'); }
    }
    async function action(fn: () => Promise<void>) { setBusy(true); try { await fn(); } finally { setBusy(false); } }
    const rect = anchor?.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24), left = Math.max(12, Math.min(rect?.left || 12, window.innerWidth - width - 12));
    const height = chooser ? 440 : 290;
    const below = (rect?.bottom || 100) + 10;
    const top = Math.max(12, below + height > window.innerHeight && rect && rect.top > height + 12 ? rect.top - height - 10 : Math.min(below, window.innerHeight - height));
    return <section ref={box} className="learning-popup" role="dialog" aria-label={`Definition of ${word.text}`} style={{ left, top, width, maxHeight: `calc(100dvh - ${top + 12}px)` }}>
        <button className="learning-close" aria-label="Close word definition" onClick={close}><X size={18}/></button>
        <span className="learning-label">ITALIAN → ENGLISH</span><h2 lang="it">{word.text}</h2>
        <p className="learning-meaning" role="status">{word.translation || (status === 'loading' || status === 'pending' ? 'Translating…' : 'Translation unavailable')}</p>
        {!word.translation && status === 'unavailable' && <button onClick={retry}>Try translation again</button>}
        {word.lemma && <p className="learning-meta">Base form: {word.lemma}</p>}{word.grammar && <p className="learning-meta">{word.grammar}</p>}
        <div className="learning-actions"><button disabled={!voice} aria-label={speaking ? 'Replay pronunciation' : 'Pronounce Italian word'} onClick={() => void speak()}><Volume2 size={21}/></button><button disabled={busy} aria-label={favorite ? 'Remove from Favorites' : 'Add to Favorites'} aria-pressed={favorite} onClick={() => void action(() => save('favorites', favorite))}><Star size={21} fill={favorite ? 'currentColor' : 'none'}/></button><button aria-label="Choose vocabulary family" aria-expanded={chooser} onClick={() => setChooser(v => !v)}><Plus size={22}/></button></div>
        {!voice && <p className="learning-note">An Italian voice isn’t available in this browser.</p>}{speechError && <p role="status" className="learning-note">{speechError}</p>}
        {chooser && <div className="learning-families"><strong>Add to a family</strong>{families.filter(f => f.id !== 'favorites').map(f => { const saved = memberships.some(m => m.wordId === word.id && m.familyId === f.id); return <button key={f.id} disabled={busy} onClick={() => void action(() => save(f.id, saved))}>{f.name}<span>{saved ? '✓' : '+'}</span></button>; })}<form onSubmit={e => { e.preventDefault(); if (name.trim()) void action(async () => { await create(name.trim()); setName(''); }); }}><input aria-label="New vocabulary family name" placeholder="New family, e.g. Emotions" maxLength={40} value={name} onChange={e => setName(e.target.value)}/><button disabled={busy || !name.trim()} aria-label="Create family and add word"><Plus size={20}/></button></form></div>}
        <p className="learning-note">{word.id.startsWith('lw:') ? 'Machine translation · meaning depends on context.' : 'Double tap a word to favorite it.'}</p>
    </section>;
}
