// A quiet, rising two-note chime, synthesized locally without an audio download.
export class SaveSound {
    private context: AudioContext | null = null;
    private lastPlayed = -Infinity;
    prepare() {
        try {
            if (typeof window === 'undefined' || !window.AudioContext) return;
            this.context ??= new AudioContext();
            if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
        } catch { /* Audio feedback is optional; saving must still work. */ }
    }
    play() {
        const context = this.context;
        if (!context || context.state !== 'running' || document.hidden) return;
        const now = context.currentTime;
        if (now - this.lastPlayed < .25) return;
        this.lastPlayed = now;
        try {
            for (const [frequency, delay] of [[659.25, 0], [830.61, .085]]) {
                const oscillator = context.createOscillator(), gain = context.createGain();
                const start = now + delay;
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(frequency, start);
                gain.gain.setValueAtTime(0, start);
                gain.gain.linearRampToValueAtTime(.065, start + .008);
                gain.gain.exponentialRampToValueAtTime(.0001, start + .2);
                oscillator.connect(gain); gain.connect(context.destination);
                oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
                oscillator.start(start); oscillator.stop(start + .22);
            }
        } catch { /* Unsupported audio never interrupts a successful save. */ }
    }
    close() {
        const context = this.context; this.context = null; this.lastPlayed = -Infinity;
        if (context) void context.close().catch(() => {});
    }
}
