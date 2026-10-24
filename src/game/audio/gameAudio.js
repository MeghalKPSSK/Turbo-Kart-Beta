// Procedural Web Audio: an RPM-driven engine, nitro whoosh, wind, tyre squeal and one-shot
// effects. Nothing is loaded from disk, and audio only starts after the first key press.

export class GameAudio {
    constructor() {
        this.context = null;
        this.nodes = null;
    }

    ensure() {
        if (this.context || typeof window === 'undefined') return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        try {
            const ctx = new AudioContextClass();
            const master = ctx.createGain();
            master.gain.value = 0.55;
            const compressor = ctx.createDynamicsCompressor();
            master.connect(compressor);
            compressor.connect(ctx.destination);

            // White noise source shared by wind, nitro and squeal.
            const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
            const makeNoise = () => {
                const source = ctx.createBufferSource();
                source.buffer = noiseBuffer;
                source.loop = true;
                source.start();
                return source;
            };

            // Engine: two saws a fifth apart plus a triangle sub, through a lowpass.
            const engineGain = ctx.createGain(); engineGain.gain.value = 0;
            const engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 900; engineFilter.Q.value = 2.2;
            const saw1 = ctx.createOscillator(); saw1.type = 'sawtooth';
            const saw2 = ctx.createOscillator(); saw2.type = 'sawtooth'; saw2.detune.value = 9;
            const sub = ctx.createOscillator(); sub.type = 'triangle';
            const g1 = ctx.createGain(); g1.gain.value = 0.5;
            const g2 = ctx.createGain(); g2.gain.value = 0.32;
            const g3 = ctx.createGain(); g3.gain.value = 0.55;
            saw1.connect(g1); saw2.connect(g2); sub.connect(g3);
            g1.connect(engineFilter); g2.connect(engineFilter); g3.connect(engineFilter);
            engineFilter.connect(engineGain); engineGain.connect(master);
            saw1.start(); saw2.start(); sub.start();

            // Wind.
            const windGain = ctx.createGain(); windGain.gain.value = 0;
            const windFilter = ctx.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 500;
            const wind = makeNoise();
            wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(master);

            // Nitro whoosh + roar.
            const nitroGain = ctx.createGain(); nitroGain.gain.value = 0;
            const nitroFilter = ctx.createBiquadFilter(); nitroFilter.type = 'bandpass'; nitroFilter.frequency.value = 1200; nitroFilter.Q.value = 0.9;
            const nitroNoise = makeNoise();
            nitroNoise.connect(nitroFilter); nitroFilter.connect(nitroGain); nitroGain.connect(master);
            const roar = ctx.createOscillator(); roar.type = 'sawtooth'; roar.frequency.value = 70;
            const roarGain = ctx.createGain(); roarGain.gain.value = 0;
            roar.connect(roarGain); roarGain.connect(master); roar.start();

            // Tyre squeal.
            const squealGain = ctx.createGain(); squealGain.gain.value = 0;
            const squealFilter = ctx.createBiquadFilter(); squealFilter.type = 'bandpass'; squealFilter.frequency.value = 1900; squealFilter.Q.value = 5;
            const squealNoise = makeNoise();
            squealNoise.connect(squealFilter); squealFilter.connect(squealGain); squealGain.connect(master);

            this.noiseBuffer = noiseBuffer;
            this.context = ctx;
            this.nodes = { master, engineGain, engineFilter, saw1, saw2, sub, windGain, windFilter, nitroGain, nitroFilter, roar, roarGain, squealGain, squealFilter };
            ctx.resume().catch(() => {});
        } catch (error) {
            console.warn('Audio is unavailable in this browser.', error);
        }
    }

    resume() {
        this.context?.resume().catch(() => {});
    }

    setMuted(muted) {
        if (!this.nodes) return;
        this.nodes.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.context.currentTime, 0.05);
    }

    // state: { rpm, throttle, speedRatio, nitro (0..1), slip (0..1), airborne, running }
    update(state) {
        if (!this.nodes) return;
        const { context: ctx, nodes: n } = this;
        const now = ctx.currentTime;
        const running = state.running;
        const rpm = state.rpm;
        const base = 38 + rpm * 118 + state.speedRatio * 24;
        n.saw1.frequency.setTargetAtTime(base, now, 0.04);
        n.saw2.frequency.setTargetAtTime(base * 1.503, now, 0.04);
        n.sub.frequency.setTargetAtTime(base * 0.5, now, 0.04);
        n.engineFilter.frequency.setTargetAtTime(420 + rpm * 1500 + state.throttle * 900, now, 0.06);
        n.engineGain.gain.setTargetAtTime(running ? 0.05 + state.throttle * 0.085 + rpm * 0.03 : 0, now, 0.06);
        n.windGain.gain.setTargetAtTime(running ? Math.min(0.16, state.speedRatio * state.speedRatio * 0.2) : 0, now, 0.1);
        n.windFilter.frequency.setTargetAtTime(300 + state.speedRatio * 1400, now, 0.1);
        n.nitroGain.gain.setTargetAtTime(state.nitro * 0.22, now, 0.05);
        n.nitroFilter.frequency.setTargetAtTime(900 + state.nitro * 1800 + state.speedRatio * 500, now, 0.08);
        n.roarGain.gain.setTargetAtTime(state.nitro * 0.1, now, 0.06);
        n.roar.frequency.setTargetAtTime(62 + state.speedRatio * 60, now, 0.06);
        n.squealGain.gain.setTargetAtTime(running && !state.airborne ? state.slip * 0.1 : 0, now, 0.04);
        n.squealFilter.frequency.setTargetAtTime(1500 + state.slip * 900 + state.speedRatio * 400, now, 0.08);
    }

    tone(frequency, duration, type = 'sine', end = frequency, volume = 0.2, attack = 0.012) {
        if (!this.context) return;
        const ctx = this.context;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(volume, t + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.connect(gain); gain.connect(this.nodes.master);
        osc.start(t); osc.stop(t + duration + 0.03);
    }

    noiseBurst(duration, frequency, volume, q = 1, type = 'bandpass') {
        if (!this.context) return;
        const ctx = this.context;
        const t = ctx.currentTime;
        const source = ctx.createBufferSource();
        source.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = type; filter.frequency.value = frequency; filter.Q.value = q;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        source.connect(filter); filter.connect(gain); gain.connect(this.nodes.master);
        source.start(t, Math.random()); source.stop(t + duration + 0.05);
    }

    coin() { this.tone(1318, 0.09, 'sine', 1318, 0.16); setTimeout(() => this.tone(1760, 0.16, 'sine', 1760, 0.16), 55); }
    nitroPickup() { this.tone(420, 0.35, 'sawtooth', 1500, 0.1); this.tone(840, 0.35, 'sine', 2400, 0.12); }
    nitroStart() { this.noiseBurst(0.55, 1400, 0.3, 0.7); this.tone(120, 0.5, 'sawtooth', 380, 0.12); }
    impact(severity = 1) {
        this.noiseBurst(0.22 + severity * 0.2, 260 + severity * 200, 0.28 + severity * 0.3, 0.6, 'lowpass');
        this.tone(95, 0.25, 'square', 42, 0.16 + severity * 0.12);
    }
    scrape() { this.noiseBurst(0.14, 2600, 0.1, 1.5); }
    landing(severity = 1) { this.noiseBurst(0.3, 180, 0.3 * Math.min(1.4, severity), 0.5, 'lowpass'); this.tone(70, 0.28, 'sine', 40, 0.25 * Math.min(1.4, severity)); }
    takedown() { this.impact(1.4); this.tone(220, 0.5, 'sawtooth', 880, 0.16); setTimeout(() => this.tone(660, 0.35, 'square', 990, 0.1), 120); }
    wrecked() { this.noiseBurst(0.7, 400, 0.4, 0.5, 'lowpass'); this.tone(150, 0.7, 'sawtooth', 40, 0.22); }
    countdown(final = false) { this.tone(final ? 880 : 520, final ? 0.5 : 0.18, 'square', final ? 880 : 520, 0.12); }
    horn() { this.tone(330, 0.4, 'square', 330, 0.07); }

    dispose() {
        if (!this.context) return;
        try { this.nodes.engineGain.gain.setTargetAtTime(0, this.context.currentTime, 0.02); } catch { /* ignore */ }
        this.context.close().catch(() => {});
        this.context = null;
        this.nodes = null;
    }
}
