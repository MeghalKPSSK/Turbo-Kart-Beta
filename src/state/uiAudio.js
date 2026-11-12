// Interface sounds: button ticks, purchases and the result sting. Synthesised with Web Audio
// like the race sounds, on its own context so they keep playing between screens. Browsers only
// allow audio after a user gesture, so the context is created on the first click.

let context = null;
let master = null;
let volume = 0.8;

function ready() {
    if (typeof window === 'undefined') return false;
    if (!context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return false;
        try {
            context = new AudioContextClass();
            master = context.createGain();
            master.gain.value = volume * 0.5;
            master.connect(context.destination);
        } catch {
            context = null;
            return false;
        }
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
    return true;
}

function tone(frequency, duration, { type = 'sine', end = frequency, gain = 0.2, delay = 0 } = {}) {
    if (!ready() || volume <= 0) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
}

export const uiAudio = {
    setVolume(value) {
        volume = Math.min(1, Math.max(0, Number(value) || 0));
        if (master) master.gain.setTargetAtTime(volume * 0.5, context.currentTime, 0.03);
    },
    click() { tone(520, 0.05, { type: 'triangle', end: 380, gain: 0.12 }); },
    buy() { tone(660, 0.09, { gain: 0.16 }); tone(990, 0.16, { gain: 0.16, delay: 0.07 }); },
    denied() { tone(180, 0.14, { type: 'square', end: 120, gain: 0.07 }); },
    // One rising note per star, or a flat pair for none.
    stars(count) {
        if (count <= 0) { tone(300, 0.18, { type: 'triangle', end: 220, gain: 0.12 }); return; }
        [523, 659, 784].slice(0, count).forEach((note, index) => tone(note, 0.22, { gain: 0.18, delay: index * 0.16 }));
        if (count === 3) tone(1047, 0.45, { gain: 0.16, delay: 0.5 });
    },
    // Finishing position: a bright sting for a win, shorter ones for the podium.
    finish(position) {
        if (position === 1) [523, 659, 784, 1047].forEach((note, index) => tone(note, 0.3, { gain: 0.17, delay: index * 0.12 }));
        else if (position <= 3) [440, 554, 659].forEach((note, index) => tone(note, 0.24, { gain: 0.15, delay: index * 0.13 }));
        else tone(330, 0.3, { type: 'triangle', end: 262, gain: 0.12 });
    }
};
