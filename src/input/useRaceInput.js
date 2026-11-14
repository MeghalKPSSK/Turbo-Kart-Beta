import { useCallback, useEffect, useRef } from 'react';
import { HELD_ACTIONS, keyId, keyLookup } from '../state/settings';

const DEADZONE = 0.16;
const axis = (value) => (Math.abs(value) < DEADZONE ? 0 : (value - Math.sign(value) * DEADZONE) / (1 - DEADZONE));
const anyHeld = (held, action) => {
    for (const entry of held) if (entry.endsWith(`:${action}`)) return true;
    return false;
};
const pressed = (button) => Boolean(button && (button.pressed || button.value > 0.5));

// Keyboard, gamepad and touch input for a race.
//
// Inputs are tracked for as long as the race screen is up (`active`), including loading, the
// countdown and the pause menu, but only forwarded to the game while it is `running`. A key or
// button that is already held when the race starts or resumes therefore takes effect at once.
// `onPause` is called for the pause key or button in any phase; the caller decides whether
// that pauses or resumes. Returns `press(action, down)` for the on-screen touch buttons.
export function useRaceInput({ active, running, gameRef, keys, onPause }) {
    // "source:action" for everything currently held, e.g. "key:accelerate", "touch:left".
    const heldRef = useRef(new Set());
    const runningRef = useRef(running);
    const pauseRef = useRef(onPause);

    useEffect(() => { pauseRef.current = onPause; }, [onPause]);

    const setHeld = useCallback((source, action, down) => {
        const held = heldRef.current;
        const entry = `${source}:${action}`;
        if (down === held.has(entry)) return;
        if (down) held.add(entry); else held.delete(entry);
        if (runningRef.current) gameRef.current?.setInput(action, anyHeld(held, action));
    }, [gameRef]);

    // One-shot actions. Pause is passed on in every phase so the same key can also resume.
    const trigger = useCallback((action) => {
        if (action === 'pause') pauseRef.current?.();
        else if (action === 'reset' && runningRef.current) gameRef.current?.setInput('reset', true);
    }, [gameRef]);

    // Hand everything that is held to the game the moment it starts running.
    useEffect(() => {
        runningRef.current = running;
        if (running) for (const action of HELD_ACTIONS) gameRef.current?.setInput(action, anyHeld(heldRef.current, action));
    }, [running, gameRef]);

    useEffect(() => {
        const held = heldRef.current;
        if (!active) {
            held.clear();
            return undefined;
        }
        const lookup = keyLookup(keys);
        const handleDown = (event) => {
            const action = lookup[keyId(event)];
            if (!action) return;
            // Stop the page scrolling on arrows and space while racing.
            // Also stop Control shortcuts (save, bookmark, select all) firing while it is held for nitro.
            if (event.key.startsWith('Arrow') || event.key === ' ' || event.ctrlKey) event.preventDefault();
            if (event.repeat) return;
            if (HELD_ACTIONS.includes(action)) setHeld('key', action, true);
            else if (action === 'reset') trigger('reset');
            else if (action === 'pause') { event.preventDefault(); trigger('pause'); }
        };
        const handleUp = (event) => {
            const action = lookup[keyId(event)];
            if (action && HELD_ACTIONS.includes(action)) setHeld('key', action, false);
        };
        const releaseAll = () => {
            held.clear();
            for (const action of HELD_ACTIONS) gameRef.current?.setInput(action, false);
            gameRef.current?.setAnalog();
        };
        window.addEventListener('keydown', handleDown);
        window.addEventListener('keyup', handleUp);
        window.addEventListener('blur', releaseAll);

        // Gamepad (standard mapping): left stick or d-pad steers, RT/LT are the pedals,
        // A = nitro, X or RB = drift, Y = reset, Start = pause.
        let frame = 0;
        let hadPad = false;
        const edge = { reset: false, pause: false };
        const poll = () => {
            frame = requestAnimationFrame(poll);
            const pad = [...(navigator.getGamepads?.() || [])].find((candidate) => candidate && candidate.connected);
            if (!pad) {
                if (hadPad) { hadPad = false; for (const action of HELD_ACTIONS) setHeld('pad', action, false); gameRef.current?.setAnalog(); }
                return;
            }
            hadPad = true;
            const b = pad.buttons;
            setHeld('pad', 'left', pressed(b[14]));
            setHeld('pad', 'right', pressed(b[15]));
            setHeld('pad', 'boost', pressed(b[0]));
            setHeld('pad', 'drift', pressed(b[2]) || pressed(b[5]));
            for (const [action, index] of [['reset', 3], ['pause', 9]]) {
                const down = pressed(b[index]);
                if (down && !edge[action]) trigger(action);
                edge[action] = down;
            }
            if (runningRef.current) {
                gameRef.current?.setAnalog({
                    steer: -axis(pad.axes[0] || 0),
                    throttle: Math.max(b[7]?.value || 0, pressed(b[12]) ? 1 : 0),
                    brake: Math.max(b[6]?.value || 0, pressed(b[13]) ? 1 : 0)
                });
            }
        };
        frame = requestAnimationFrame(poll);

        return () => {
            window.removeEventListener('keydown', handleDown);
            window.removeEventListener('keyup', handleUp);
            window.removeEventListener('blur', releaseAll);
            cancelAnimationFrame(frame);
        };
    }, [active, keys, gameRef, setHeld, trigger]);

    const press = useCallback((action, down) => {
        if (HELD_ACTIONS.includes(action)) setHeld('touch', action, down);
        else if (down) trigger(action);
    }, [setHeld, trigger]);

    return press;
}
