import RaceHUD from '../components/RaceHUD';
import TouchControls from '../components/TouchControls';

export default function RaceScreen({ hostRef, phase, countdown, hud, vehicle, track, label, title, rule, progress = 0, minimapPath, error, keys, touch, press, onPause, onResume, onRestart, onQuit, onBackToRoutes }) {
    return (
        <section className="race-screen">
            <div className="race-canvas" ref={hostRef} />
            {phase === 'loading' && <div className="race-message"><div className="loading-wheel" /><span>PREPARING THE GRID · {Math.round(progress * 100)}%</span><div className="loading-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div><small>{track.name} · {vehicle.name}</small>{rule && <p>{rule}</p>}</div>}
            {phase === 'countdown' && <div className="race-countdown"><span>{countdown > 0 ? countdown : 'RIDE!'}</span><small>{title.toUpperCase()}</small></div>}
            {phase === 'running' && hud && (
                <RaceHUD
                    hud={hud}
                    vehicle={vehicle}
                    minimapPath={minimapPath}
                    keys={keys}
                    showKeys={!touch}
                    eventLabel={label}
                    eventTitle={title}
                    onPause={onPause}
                />
            )}
            {touch && (phase === 'running' || phase === 'countdown') && <TouchControls press={press} />}
            {phase === 'paused' && (
                <div className="race-overlay"><div className="overlay-card">
                    <span className="eyebrow">TAKE A BREATHER</span><h2>RACE PAUSED</h2><p>{track.name} · {vehicle.name}</p>
                    <button className="button-primary" onClick={onResume}>BACK TO THE ROAD <span>↗</span></button>
                    <button className="button-secondary" onClick={onRestart}>RESTART RACE</button>
                    <button className="button-secondary" onClick={onQuit}>QUIT TO HOME</button>
                </div></div>
            )}
            {phase === 'error' && (
                <div className="race-overlay"><div className="overlay-card">
                    <span className="eyebrow">RACE SETUP</span><h2>COULD NOT LOAD</h2><p>{error}</p>
                    <button className="button-primary" onClick={onRestart}>TRY AGAIN <span>↗</span></button>
                    <button className="button-secondary" onClick={onBackToRoutes}>BACK</button>
                </div></div>
            )}
        </section>
    );
}
