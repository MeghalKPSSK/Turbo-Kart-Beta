import { useEffect, useState } from 'react';
import { SetupHeader } from '../components/Chrome';
import { ACTIONS, QUALITY_LEVELS, TOUCH_MODES, defaultSettings, keyId, keyLabel, rebindKey } from '../state/settings';

function Choice({ options, value, onChange }) {
    return (
        <div className="segmented-control settings-choice">
            {Object.entries(options).map(([id, option]) => <button key={id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>{option.label.toUpperCase()}</button>)}
        </div>
    );
}

export default function SettingsScreen({ settings, onChange, onBack }) {
    // The action waiting for a key press, or null.
    const [listening, setListening] = useState(null);

    useEffect(() => {
        if (!listening) return undefined;
        const capture = (event) => {
            event.preventDefault();
            event.stopPropagation();
            // Escape cancels, unless it is the pause key itself being rebound.
            if (event.key !== 'Escape' || listening === 'pause') onChange({ ...settings, keys: rebindKey(settings.keys, listening, keyId(event)) });
            setListening(null);
        };
        window.addEventListener('keydown', capture, true);
        return () => window.removeEventListener('keydown', capture, true);
    }, [listening, settings, onChange]);

    return (
        <section className="setup-screen settings-screen">
            <SetupHeader back="LEAGUE" onBack={onBack} eyebrow="SOUND · GRAPHICS · CONTROLS" title="SETTINGS">
                <button className="button-secondary settings-reset" onClick={() => onChange(defaultSettings())}>RESET ALL</button>
            </SetupHeader>
            <div className="settings-grid">
                <div className="settings-panel">
                    <div className="section-kicker">01 / SOUND</div>
                    <label className="settings-row">
                        <span>Volume<small>Engine, tyres and impacts. The game has no music.</small></span>
                        <input type="range" min="0" max="100" step="5" value={Math.round(settings.volume * 100)} onChange={(event) => onChange({ ...settings, volume: Number(event.target.value) / 100 })} />
                        <b>{Math.round(settings.volume * 100)}%</b>
                    </label>
                    <div className="section-kicker">02 / GRAPHICS</div>
                    <div className="settings-row">
                        <span>Quality<small>{QUALITY_LEVELS[settings.quality].detail} Applies from the next race.</small></span>
                        <Choice options={QUALITY_LEVELS} value={settings.quality} onChange={(quality) => onChange({ ...settings, quality })} />
                    </div>
                    <div className="section-kicker">03 / TOUCH</div>
                    <div className="settings-row">
                        <span>On-screen buttons<small>{TOUCH_MODES[settings.touch].detail}</small></span>
                        <Choice options={TOUCH_MODES} value={settings.touch} onChange={(touch) => onChange({ ...settings, touch })} />
                    </div>
                    <div className="settings-row">
                        <span>Brake assist<small>Slows you when you arrive far too fast for a corner. Turn it off for full control.</small></span>
                        <Choice options={{ on: { label: 'On' }, off: { label: 'Off' } }} value={settings.assist ? 'on' : 'off'} onChange={(value) => onChange({ ...settings, assist: value === 'on' })} />
                    </div>
                    <div className="section-kicker">04 / GAMEPAD</div>
                    <p className="settings-note">Plug in a controller and press any button. Left stick or d-pad steers, right trigger accelerates, left trigger brakes, A is nitro, X or right bumper drifts, Y resets, Start pauses.</p>
                </div>
                <div className="settings-panel">
                    <div className="section-kicker">05 / KEYBOARD</div>
                    <p className="settings-note">Select an action, then press the key you want. Esc cancels.</p>
                    <div className="keybind-list">
                        {ACTIONS.map(({ id, label }) => (
                            <button key={id} className={`keybind-row ${listening === id ? 'listening' : ''}`} onClick={() => setListening(listening === id ? null : id)}>
                                <span>{label}</span>
                                <b>{listening === id ? 'PRESS A KEY…' : settings.keys[id].map((key) => <kbd key={key}>{keyLabel(key)}</kbd>)}</b>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
