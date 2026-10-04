import type { Recording } from './discovery';
export type PlaybackState = {
    positionMs: number;
    durationMs: number;
    paused: boolean;
    buffering: boolean;
    ready: boolean;
    uri: string | null;
    ended: boolean;
    error: string | null;
    image: string | null;
    title: string | null;
    artist: string | null;
};
export interface PlaybackAdapter {
    connect(): Promise<void>;
    play(recording: Recording): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    seek(ms: number): Promise<void>;
    setVolume(volume: number): Promise<void>;
    disconnect(): void;
    subscribe(listener: (state: PlaybackState) => void): () => void;
}
type SdkState = {
    position: number;
    duration: number;
    paused: boolean;
    loading: boolean;
    track_window: {
        current_track: {
            uri: string;
            name: string;
            artists: {
                name: string;
            }[];
            album: {
                images: {
                    url: string;
                }[];
            };
        };
    };
};
type SdkPlayer = {
    addListener: (event: string, callback: (data: any) => void) => void;
    connect: () => Promise<boolean>;
    disconnect: () => void;
    activateElement: () => Promise<void>;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    seek: (ms: number) => Promise<void>;
    setVolume: (volume: number) => Promise<void>;
    getCurrentState: () => Promise<SdkState | null>;
};
declare global {
    interface Window {
        Spotify?: {
            Player: new (options: {
                name: string;
                getOAuthToken: (callback: (token: string) => void) => void;
                volume: number;
            }) => SdkPlayer;
        };
        onSpotifyWebPlaybackSDKReady?: () => void;
    }
}
let sdkPromise: Promise<void> | null = null;
function loadSdk() { if (window.Spotify)
    return Promise.resolve(); if (!sdkPromise)
    sdkPromise = new Promise<void>((resolve, reject) => { const timer = setTimeout(() => { sdkPromise = null; reject(new Error('Spotify player did not load. Try an external supported browser.')); }, 15000); window.onSpotifyWebPlaybackSDKReady = () => { clearTimeout(timer); resolve(); }; let script = document.querySelector<HTMLScriptElement>('script[data-sotto-spotify]'); if (!script) {
        script = document.createElement('script');
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.dataset.sottoSpotify = 'true';
        script.async = true;
        document.head.appendChild(script);
    } script.onerror = () => { clearTimeout(timer); script?.remove(); sdkPromise = null; reject(new Error('Spotify player could not load. Check your connection.')); }; }); return sdkPromise; }
export class SpotifyPlayback implements PlaybackAdapter {
    private retryAt = 0;
    private quotaExhausted = false;
    private sdk: SdkPlayer | null = null;
    private device: string | null = null;
    private connected: Promise<void> | null = null;
    private listeners = new Set<(s: PlaybackState) => void>();
    private sequence = 0;
    private commandQueue: Promise<void> = Promise.resolve();
    private timer: ReturnType<typeof setInterval> | null = null;
    private observedAt = 0;
    private basePosition = 0;
    private desiredUri: string | null = null;
    private disposed = false;
    private switching = false;
    private switchTimer: ReturnType<typeof setTimeout> | null = null;
    private state: PlaybackState = { positionMs: 0, durationMs: 0, paused: true, buffering: false, ready: false, uri: null, ended: false, error: null, image: null, title: null, artist: null };
    subscribe(listener: (s: PlaybackState) => void) { this.listeners.add(listener); listener(this.state); return () => { this.listeners.delete(listener); }; }
    private emit(value: Partial<PlaybackState>) { this.state = { ...this.state, ...value }; for (const l of this.listeners)
        l(this.state); }
    async connect() { if (this.connected)
        return this.connected; this.disposed = false; this.connected = this.initialize().catch(e => { this.connected = null; this.emit({ error: e.message, ready: false, paused: true }); throw e; }); return this.connected; }
    private async initialize() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = null;
        this.sdk?.disconnect();
        this.sdk = null;
        await loadSdk();
        if (this.disposed)
            throw new Error('Player closed.');
        this.sdk = new window.Spotify!.Player({ name: 'Sotto · Italian discovery', volume: .8, getOAuthToken: cb => { fetch('/api/spotify/token', { cache: 'no-store' }).then(async (r) => { const p: any = await r.json(); if (!r.ok)
                throw new Error(p.error); cb(p.accessToken); }).catch(e => this.emit({ error: e.message, paused: true, ready: false })); } });
        const ready = new Promise<void>((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Spotify did not connect. Check the developer app allowlist and Premium.')), 20000); this.sdk!.addListener('ready', ({ device_id }) => { clearTimeout(timeout); this.device = device_id; this.emit({ ready: true, error: null }); resolve(); }); for (const event of ['initialization_error', 'authentication_error', 'account_error', 'playback_error'])
            this.sdk!.addListener(event, () => { clearTimeout(timeout); const message = event === 'account_error' ? 'Spotify Premium is required.' : event === 'initialization_error' ? 'Spotify playback is unsupported here. Open Sotto in Chrome, Edge, Firefox or Safari.' : 'Spotify player could not continue. Reconnect and try again.'; this.emit({ error: message, paused: true, ready: false }); reject(new Error(message)); }); });
        this.sdk.addListener('not_ready', () => { this.device = null; this.connected = null; this.emit({ ready: false, paused: true, buffering: false, error: 'Spotify device disconnected. Tap Play to reconnect.' }); });
        this.sdk.addListener('autoplay_failed', () => this.emit({ paused: true, buffering: false, error: 'Tap Play to allow audio in this browser.' }));
        this.sdk.addListener('player_state_changed', (s: SdkState | null) => { if (!s) {
            this.emit({ paused: true, buffering: false });
            return;
        } const track = s.track_window.current_track; const was = this.state; if (this.desiredUri && track.uri !== this.desiredUri) {
            if (this.switching)
                return;
            void this.sdk?.pause();
            this.emit({ paused: true, buffering: false, error: 'Playback moved to another recording or device. Tap Play to return to this song.' });
            return;
        } this.switching = false; if (this.switchTimer)
            clearTimeout(this.switchTimer); this.switchTimer = null; this.basePosition = s.position; this.observedAt = performance.now(); this.emit({ positionMs: s.position, durationMs: s.duration, paused: s.paused, buffering: s.loading, uri: track.uri, image: track.album.images[0]?.url || null, title: track.name, artist: track.artists.map(a => a.name).join(', '), error: null, ended: s.paused && s.position === 0 && was.uri === track.uri && was.positionMs > Math.max(0, was.durationMs - 2000) }); });
        if (!await this.sdk.connect())
            throw new Error('Spotify could not connect.');
        await ready;
        if (this.disposed)
            throw new Error('Player closed.');
        this.timer = setInterval(() => { if (!this.state.paused && !this.state.buffering && this.state.ready) {
            const position = Math.min(this.state.durationMs, this.basePosition + performance.now() - this.observedAt);
            this.emit({ positionMs: position, ...(position >= this.state.durationMs && this.state.durationMs > 0 ? { paused: true, ended: true } : {}) });
        } }, 250);
    }
    async play(recording: Recording) {
        const request = ++this.sequence;
        this.desiredUri = recording.spotifyUri;
        this.switching = true;
        if (this.switchTimer)
            clearTimeout(this.switchTimer);
        this.switchTimer = setTimeout(() => { if (request === this.sequence) {
            this.switching = false;
            this.emit({ paused: true, buffering: false, error: 'Spotify did not start this recording. Tap Play to retry.' });
        } }, 20000);
        this.emit({ buffering: true, error: null, positionMs: 0, ended: false });
        if (this.sdk)
            await this.sdk.activateElement();
        await this.connect();
        if (request !== this.sequence || this.disposed)
            return;
        await this.sdk!.activateElement();
        const run = async () => { if (request !== this.sequence || this.disposed)
            return; await this.command({ command: 'transfer' }); if (request !== this.sequence || this.disposed)
            return; await this.command({ command: 'play', recordingId: recording.id }); };
        const next = this.commandQueue.catch(() => { }).then(run);
        this.commandQueue = next;
        try {
            await next;
        }
        catch (e) {
            if (request === this.sequence) {
                this.switching = false;
                if (this.switchTimer)
                    clearTimeout(this.switchTimer);
                this.emit({ buffering: false, paused: true, error: e instanceof Error ? e.message : 'Playback failed.' });
            }
            throw e;
        }
    }
    private async command(body: unknown) {
        if (this.quotaExhausted) throw new Error('Spotify API quota is exhausted. Try again after it resets.');
        if (Date.now() < this.retryAt) throw new Error(`Spotify is rate limiting requests. Try again in ${Math.ceil((this.retryAt-Date.now())/1000)} seconds.`);
        const res = await fetch('/api/spotify/play', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body as object, deviceId: this.device }), signal: AbortSignal.timeout(12000) }); if (!res.ok) {
        const p: any = await res.json();
        if (p.code === 'QUOTA_EXCEEDED') this.quotaExhausted = true;
        else if (res.status === 429) this.retryAt = Date.now() + Math.max(1, Number(res.headers.get('Retry-After') || 30))*1000;
        throw new Error(p.error || 'Spotify playback failed.');
    } }
    async pause() { ++this.sequence; this.switching = false; if (this.switchTimer)
        clearTimeout(this.switchTimer); await this.sdk?.pause(); this.emit({ paused: true, buffering: false }); }
    async resume() { if (!this.sdk || !this.state.ready)
        throw new Error('Reconnect the player first.'); await this.sdk.activateElement(); await this.sdk.resume(); }
    async seek(ms: number) { const value = Math.max(0, Math.min(this.state.durationMs, ms)); await this.sdk?.seek(value); this.basePosition = value; this.observedAt = performance.now(); this.emit({ positionMs: value }); }
    async setVolume(volume: number) { await this.sdk?.setVolume(Math.max(0, Math.min(1, volume))); }
    disconnect() { this.disposed = true; this.switching = false; if (this.switchTimer)
        clearTimeout(this.switchTimer); this.switchTimer = null; ++this.sequence; this.sdk?.disconnect(); this.sdk = null; this.device = null; this.connected = null; if (this.timer)
        clearInterval(this.timer); this.timer = null; this.emit({ paused: true, buffering: false, ready: false }); }
}
