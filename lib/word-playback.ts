export class WordPlaybackGate {
    private generation = 0;
    private active = false;
    private resumeId: string | null = null;
    private pending: Promise<void> = Promise.resolve();
    constructor(private pause: () => Promise<void>, private resume: () => Promise<void>, private current: () => string | undefined) {}
    open(id: string, playing: boolean) {
        this.generation++;
        if (this.active) return this.pending;
        this.active = true;
        this.resumeId = playing ? id : null;
        this.pending = this.pause();
        return this.pending;
    }
    async close() {
        const token = ++this.generation, id = this.resumeId;
        this.active = false; this.resumeId = null;
        await this.pending;
        if (id && token === this.generation && !this.active && this.current() === id) await this.resume();
    }
    cancel() { this.generation++; this.active = false; this.resumeId = null; }
    wait() { return this.pending; }
}
