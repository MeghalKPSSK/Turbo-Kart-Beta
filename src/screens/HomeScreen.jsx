import { useState } from 'react';
import { ROAD_TRACKS, ROAD_VEHICLES } from '../game/data/roadRacing';
import RoadVehiclePreview from '../components/RoadVehiclePreview';
import { CreditChip } from '../components/Chrome';
import { pad2 } from '../utils/format';
import { keyLabel } from '../state/settings';

export default function HomeScreen({ profile, vehicle, paint, keys, onStory, onQuickRace, onGarage, onRecords, onSettings }) {
    const [showTips, setShowTips] = useState(false);
    const key = (action) => keyLabel(keys[action][0]);
    return (
        <section className="home-screen">
            <header className="topbar">
                <div className="brand-lockup"><span className="brand-mark">TR</span><span>TURBO <b>ROAD LEAGUE</b></span></div>
                <div className="topbar-meta"><span className="season-tag">SEASON 01 · NIGHT RUNS</span><CreditChip credits={profile.credits} /><button className="topbar-settings" onClick={onSettings}>SETTINGS</button></div>
            </header>
            <div className="home-hero">
                <div className="hero-copy">
                    <div className="eyebrow"><i /> THE ROAD IS YOURS TO TAKE</div>
                    <h1>OWN THE<br /><em>ROAD.</em></h1>
                    <p>Race a bike or a formula car across a league of closed mountain circuits. Find the fast line, drift clean, and launch off the crests.</p>
                    <div className="home-actions">
                        <button className="button-primary" onClick={onStory}>STORY MODE <span>↗</span></button>
                        <button className="button-secondary" onClick={onQuickRace}>QUICK RACE</button>
                    </div>
                    <button className="text-button" onClick={() => setShowTips((current) => !current)}>{showTips ? 'CLOSE RIDER GUIDE' : 'RACE CONTROLS + RULES'} <span>＋</span></button>
                    {showTips && <div className="home-tips">{key('accelerate')} accelerate · {key('brake')} brake, then reverse · {key('left')}/{key('right')} steer · hold {key('boost')} for blue-flame nitro · {key('drift')} while steering drifts · {key('reset')} resets you to the track. A gamepad works too: left stick steers, triggers are the pedals, A is nitro, X drifts. Drive through blue nitro canisters, collect coins to upgrade each vehicle, ram rivals for TAKEDOWNS, and hit ramps with the whole car for air. Going the wrong way triggers a warning.</div>}
                    <div className="home-stats"><div><b>{pad2(ROAD_TRACKS.length)}</b><span>ORIGINAL ROUTES</span></div><i /><div><b>{pad2(ROAD_VEHICLES.length)}</b><span>VEHICLES</span></div><i /><div><b>{pad2(profile.races)}</b><span>RACES RUN</span></div></div>
                </div>
                <div className="home-machine-wrap">
                    <div className="hero-vehicle-halo" />
                    <RoadVehiclePreview vehicle={vehicle} paint={paint} className="hero-vehicle" />
                    <div className="hero-sweep-line" />
                    <div className="hero-model-label"><span>GARAGE SPOTLIGHT</span><b>{vehicle.name}</b><small>{vehicle.type} · FACTORY SPEC</small></div>
                    <button className="hero-garage-link" onClick={onGarage}>CHANGE VEHICLE <span>→</span></button>
                </div>
            </div>
            <div className="home-footer">
                <div><span className="live-dot" /> CAMPAIGN OPEN</div>
                <p>ROAD CARS &amp; BIKES · SCENIC CLOSED COURSES · RACE YOUR WAY</p>
                <button onClick={onRecords}>RACE RECORDS ↗</button>
            </div>
        </section>
    );
}
