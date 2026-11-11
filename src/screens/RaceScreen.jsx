import RaceHUD from '../components/RaceHUD';
import TouchControls from '../components/TouchControls';
import { pad2 } from '../utils/format';

export default function RaceScreen({ hostRef, phase, countdown, hud, vehicle, track, chapter, storyStage, minimapPath, error, keys, touch, press, onPause, onResume, onRestart, onQuit, onBackToRoutes }) {
    const story = Boolean(chapter);
    return (
        <section className="race-screen">
            <div className="race-canvas" ref={hostRef} />
            {phase === 'loading' && <div className="race-message"><div className="loading-wheel" /><span>PREPARING THE GRID</span><small>{track.name} · {vehicle.name}</small></div>}
            {phase === 'countdown' && <div className="race-countdown"><span>{countdown > 0 ? countdown : 'RIDE!'}</span><small>{track.name.toUpperCase()}</small></div>}
            {phase === 'running' && hud && (
                <RaceHUD
                    hud={hud}
                    vehicle={vehicle}
                    minimapPath={minimapPath}
                    keys={keys}
                    showKeys={!touch}
                    eventLabel={story ? `STORY ${pad2(storyStage + 1)} · VS ${chapter.rival.toUpperCase()}` : 'TRL / OPEN SERIES'}
                    eventTitle={story ? chapter.title : track.name}
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
                    <button className="button-secondary" onClick={onBackToRoutes}>BACK TO ROUTES</button>
                </div></div>
            )}
        </section>
    );
}
