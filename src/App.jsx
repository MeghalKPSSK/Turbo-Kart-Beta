import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PAINT_COLORS, ROAD_CAMPAIGN, ROAD_TRACKS, ROAD_VEHICLES, UPGRADES, UPGRADE_MAX_LEVEL, upgradeCost } from './game/data/roadRacing';
import { RoadRaceGame } from './game/systems/RoadRaceGame';
import { buildVehicleSpec, describeSpec } from './game/physics/specs';
import RoadVehiclePreview from './components/RoadVehiclePreview';
import RaceHUD from './components/RaceHUD';
import './App.css';

const PROFILE_KEY = 'turbo-road-league-profile-v2';
const LEGACY_PROFILE_KEY = 'turbo-road-league-profile-v1';
const freshProfile = () => ({ credits: 1200, races: 0, wins: 0, bestFinish: 9, bestTime: null, bestScore: 0, totalPoints: 0, roadCoins: 0, storyStage: 0, storyComplete: false, takedowns: 0, garage: {} });

function loadProfile() {
    try {
        const stored = localStorage.getItem(PROFILE_KEY);
        if (stored) return { ...freshProfile(), ...JSON.parse(stored) };
        const legacy = localStorage.getItem(LEGACY_PROFILE_KEY);
        if (legacy) {
            // Version 1 shared three global tunes; refund their coins at the new, larger scale.
            const old = JSON.parse(legacy);
            const spent = Object.values(old.tunes || {}).reduce((sum, level) => sum + [0, 4, 11, 21][Math.min(3, Number(level) || 0)], 0);
            const { tunes, ...rest } = old; // eslint-disable-line no-unused-vars
            return { ...freshProfile(), ...rest, roadCoins: (old.roadCoins || 0) + spent * 8 };
        }
    } catch {
        // fall through to a fresh profile
    }
    return freshProfile();
}

const UPGRADE_NOW = {
    speed: (d) => `${d.topSpeedKmh} km/h`,
    accel: (d) => `0-100 in ${d.accel0to100.toFixed(1)}s`,
    handling: (d) => `${d.gripG.toFixed(2)} grip`,
    nitro: (d) => `${d.nitroSeconds.toFixed(1)}s burn · ${d.nitroTopSpeedKmh} km/h`,
    armor: (d) => `${d.durability}% durability`
};

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '--:--.-';
    const minutes = Math.floor(seconds / 60);
    const remaining = (seconds % 60).toFixed(1).padStart(4, '0');
    return `${String(minutes).padStart(2, '0')}:${remaining}`;
}

function StatRow({ label, value }) {
    const safeValue = Math.min(10, Math.max(0, value));
    return (
        <div className="garage-stat">
            <span>{label}</span>
            <div className="garage-stat-track"><i style={{ width: `${safeValue / 10 * 100}%` }} /></div>
            <b>{safeValue}/10</b>
        </div>
    );
}

export default function App() {
    const [screen, setScreen] = useState('home');
    const [mode, setMode] = useState('career');
    const [storyStage, setStoryStage] = useState(0);
    const [category, setCategory] = useState('BIKE');
    const [vehicleId, setVehicleId] = useState('bike_nightjar');
    const [paint, setPaint] = useState(ROAD_VEHICLES[0].defaultPaint);
    const [trackId, setTrackId] = useState(ROAD_TRACKS[0].id);
    const [profile, setProfile] = useState(loadProfile);
    const [racePhase, setRacePhase] = useState('idle');
    const [raceSession, setRaceSession] = useState(0);
    const [countdown, setCountdown] = useState(3);
    const [hud, setHud] = useState(null);
    const [result, setResult] = useState(null);
    const [gameError, setGameError] = useState('');
    const [showTips, setShowTips] = useState(false);
    const [minimapPath, setMinimapPath] = useState([]);
    const appShellRef = useRef(null);
    const gameHostRef = useRef(null);
    const gameRef = useRef(null);

    const vehicle = useMemo(() => ROAD_VEHICLES.find((item) => item.id === vehicleId) || ROAD_VEHICLES[0], [vehicleId]);
    const track = useMemo(() => ROAD_TRACKS.find((item) => item.id === trackId) || ROAD_TRACKS[0], [trackId]);
    const garageVehicles = useMemo(() => ROAD_VEHICLES.filter((item) => item.type === category), [category]);
    const garageEntry = profile.garage?.[vehicleId];
    const upgradeKey = JSON.stringify(garageEntry || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const vehicleUpgrades = useMemo(() => garageEntry || {}, [upgradeKey]);
    const specNow = useMemo(() => buildVehicleSpec(vehicle, vehicleUpgrades), [vehicle, vehicleUpgrades]);
    const describeWith = (key, level) => describeSpec(buildVehicleSpec(vehicle, { ...vehicleUpgrades, [key]: level }));
    const chapter = mode === 'story' ? ROAD_CAMPAIGN[storyStage] : null;
    const trackOptions = mode === 'story' && chapter
        ? ROAD_TRACKS.filter((item) => item.id === chapter.trackId)
        : ROAD_TRACKS;

    useEffect(() => {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }, [profile]);

    useLayoutEffect(() => {
        if (appShellRef.current) {
            appShellRef.current.scrollTop = 0;
            const screenElement = appShellRef.current.firstElementChild;
            if (screenElement instanceof HTMLElement) screenElement.scrollTop = 0;
        }
    }, [screen]);

    const openGarage = (nextMode = 'career') => {
        setMode(nextMode);
        setScreen('garage');
    };

    const openStory = () => {
        const nextStage = Math.min(profile.storyStage || 0, ROAD_CAMPAIGN.length - 1);
        setStoryStage(nextStage);
        setTrackId(ROAD_CAMPAIGN[nextStage].trackId);
        setMode('story');
        setScreen('story');
    };

    const startRace = useCallback(() => {
        setResult(null);
        setHud(null);
        setGameError('');
        setRacePhase('loading');
        setCountdown(3);
        setRaceSession((value) => value + 1);
        setScreen('race');
    }, []);

    useEffect(() => {
        if (screen !== 'race' || !gameHostRef.current || gameRef.current) return undefined;
        let live = true;
        const game = new RoadRaceGame(gameHostRef.current, {
            track,
            vehicle,
            paint,
            upgrades: vehicleUpgrades,
            onReady: (info) => {
                if (!live) return;
                setMinimapPath(info?.minimapPath || []);
                setRacePhase('countdown');
                setCountdown(3);
            },
            onHUD: (data) => { if (live) setHud(data); },
            onFinish: (raceResult) => {
                if (!live) return;
                const chapterClear = mode === 'story' && chapter
                    ? raceResult.position <= chapter.goal
                    : false;
                const normalized = {
                    ...raceResult,
                    mode,
                    chapter,
                    chapterClear,
                    chapterFinal: mode === 'story' && storyStage === ROAD_CAMPAIGN.length - 1
                };
                setResult(normalized);
                setRacePhase('results');
                setScreen('result');
                setProfile((current) => {
                    const bestTime = current.bestTime === null ? raceResult.time : Math.min(current.bestTime, raceResult.time);
                    return {
                        ...current,
                        credits: current.credits + raceResult.credits,
                        races: current.races + 1,
                        wins: current.wins + (raceResult.position === 1 ? 1 : 0),
                        bestFinish: Math.min(current.bestFinish, raceResult.position),
                        bestTime,
                        bestScore: Math.max(current.bestScore || 0, raceResult.score || 0),
                        totalPoints: (current.totalPoints || 0) + (raceResult.score || 0),
                        roadCoins: (current.roadCoins || 0) + (raceResult.coins || 0),
                        takedowns: (current.takedowns || 0) + (raceResult.takedowns || 0),
                        storyStage: chapterClear
                            ? Math.min(ROAD_CAMPAIGN.length - 1, Math.max(current.storyStage || 0, storyStage + 1))
                            : current.storyStage || 0,
                        storyComplete: Boolean(current.storyComplete || (chapterClear && storyStage === ROAD_CAMPAIGN.length - 1))
                    };
                });
            },
            onError: (error) => {
                if (!live) return;
                setGameError(error?.message || 'The race scene could not be loaded.');
                setRacePhase('error');
            }
        });
        gameRef.current = game;
        return () => {
            live = false;
            game.dispose();
            gameRef.current = null;
        };
    }, [screen, raceSession, track, vehicle, paint, vehicleUpgrades, mode, chapter, storyStage]);

    useEffect(() => {
        if (screen !== 'race' || racePhase !== 'countdown') return undefined;
        const timer = window.setTimeout(() => {
            if (countdown > 1) {
                setCountdown(countdown - 1);
            } else {
                setCountdown(0);
                setRacePhase('running');
                gameRef.current?.setPaused(false);
            }
        }, countdown === 0 ? 650 : 850);
        return () => window.clearTimeout(timer);
    }, [screen, racePhase, countdown]);

    useEffect(() => {
        if (screen !== 'race' || racePhase !== 'running') return undefined;
        const keyNames = {
            ArrowUp: 'accelerate', w: 'accelerate',
            ArrowDown: 'brake', s: 'brake',
            ArrowLeft: 'left', a: 'left',
            ArrowRight: 'right', d: 'right',
            Shift: 'boost', ' ': 'drift'
        };
        const handleDown = (event) => {
            if (event.repeat) {
                if (event.key.startsWith('Arrow') || event.key === ' ') event.preventDefault();
                return;
            }
            const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
            if (event.key.startsWith('Arrow') || event.key === ' ') event.preventDefault();
            if (event.key === 'Escape') {
                event.preventDefault();
                setRacePhase('paused');
                gameRef.current?.setPaused(true);
            } else if (key === 'r') {
                gameRef.current?.setInput('reset', true);
            } else if (keyNames[key]) {
                gameRef.current?.setInput(keyNames[key], true);
            }
        };
        const handleUp = (event) => {
            const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
            if (keyNames[key]) gameRef.current?.setInput(keyNames[key], false);
        };
        const handleBlur = () => ['accelerate', 'brake', 'left', 'right', 'boost', 'drift'].forEach((name) => gameRef.current?.setInput(name, false));
        window.addEventListener('keydown', handleDown);
        window.addEventListener('keyup', handleUp);
        window.addEventListener('blur', handleBlur);
        return () => {
            window.removeEventListener('keydown', handleDown);
            window.removeEventListener('keyup', handleUp);
            window.removeEventListener('blur', handleBlur);
        };
    }, [screen, racePhase]);

    const resumeRace = () => {
        gameRef.current?.setPaused(false);
        setRacePhase('running');
    };

    const exitRace = () => {
        gameRef.current?.dispose();
        gameRef.current = null;
        setRacePhase('idle');
        setScreen('home');
    };

    const continueFromResult = () => {
        if (result?.mode === 'story') {
            const next = result.chapterClear && !result.chapterFinal
                ? Math.min(ROAD_CAMPAIGN.length - 1, storyStage + 1)
                : storyStage;
            setStoryStage(next);
            setTrackId(ROAD_CAMPAIGN[next].trackId);
            setScreen('story');
            return;
        }
        setScreen('courses');
    };

    const purchaseUpgrade = (key) => {
        const level = vehicleUpgrades[key] || 0;
        const cost = upgradeCost(level);
        if (level >= UPGRADE_MAX_LEVEL || (profile.roadCoins || 0) < cost) return;
        setProfile((current) => ({
            ...current,
            roadCoins: Math.max(0, (current.roadCoins || 0) - cost),
            garage: { ...(current.garage || {}), [vehicleId]: { ...(current.garage?.[vehicleId] || {}), [key]: (current.garage?.[vehicleId]?.[key] || 0) + 1 } }
        }));
    };

    const enterCourseSelect = () => setScreen('courses');

    const selectedPaint = PAINT_COLORS.find((item) => item.color === paint) || PAINT_COLORS[0];

    return (
        <main ref={appShellRef} className={`app-shell ${screen === 'race' ? 'app-racing' : ''}`}>
            {screen === 'home' && (
                <section className="home-screen">
                    <header className="topbar">
                        <div className="brand-lockup"><span className="brand-mark">TR</span><span>TURBO <b>ROAD LEAGUE</b></span></div>
                        <div className="topbar-meta"><span className="season-tag">SEASON 01 · NIGHT RUNS</span><span className="credit-chip"><i>¢</i>{profile.credits.toLocaleString()}</span></div>
                    </header>
                    <div className="home-hero">
                        <div className="hero-copy">
                            <div className="eyebrow"><i /> THE ROAD IS YOURS TO TAKE</div>
                            <h1>OWN THE<br /><em>ROAD.</em></h1>
                            <p>Race a bike or a formula car across a league of closed mountain circuits. Find the fast line, drift clean, and launch off the crests.</p>
                            <div className="home-actions">
                                <button className="button-primary" onClick={openStory}>STORY MODE <span>↗</span></button>
                                <button className="button-secondary" onClick={() => openGarage('quick')}>QUICK RACE</button>
                            </div>
                            <button className="text-button" onClick={() => setShowTips((current) => !current)}>{showTips ? 'CLOSE RIDER GUIDE' : 'RACE CONTROLS + RULES'} <span>＋</span></button>
                            {showTips && <div className="home-tips">W accelerate · S brake, then reverse · A/D steer · hold Shift for blue-flame nitro · Space while steering drifts · R resets you to the track. Drive through blue nitro canisters, collect coins to upgrade each vehicle, ram rivals for TAKEDOWNS, and hit ramps with the whole car for air. Going the wrong way triggers a warning.</div>}
                            <div className="home-stats"><div><b>08</b><span>ORIGINAL ROUTES</span></div><i /><div><b>{String(ROAD_VEHICLES.length).padStart(2, '0')}</b><span>VEHICLES</span></div><i /><div><b>{profile.races.toString().padStart(2, '0')}</b><span>RACES RUN</span></div></div>
                        </div>
                        <div className="home-machine-wrap">
                            <div className="hero-vehicle-halo" />
                            <RoadVehiclePreview vehicle={vehicle} paint={paint} className="hero-vehicle" />
                            <div className="hero-sweep-line" />
                            <div className="hero-model-label"><span>GARAGE SPOTLIGHT</span><b>{vehicle.name}</b><small>{vehicle.type} · FACTORY SPEC</small></div>
                            <button className="hero-garage-link" onClick={() => openGarage('garage')}>CHANGE VEHICLE <span>→</span></button>
                        </div>
                    </div>
                    <div className="home-footer">
                        <div><span className="live-dot" /> CAMPAIGN OPEN</div>
                        <p>ROAD CARS &amp; BIKES · SCENIC CLOSED COURSES · RACE YOUR WAY</p>
                        <button onClick={() => setScreen('records')}>RACE RECORDS ↗</button>
                    </div>
                </section>
            )}

            {screen === 'story' && (
                <section className="setup-screen story-screen">
                    <header className="setup-header">
                        <button className="back-link" onClick={() => setScreen('home')}>← LEAGUE</button>
                        <div><span className="eyebrow">TURBO ROAD LEAGUE · STORY CAMPAIGN</span><h1>ROAD TO THE CROWN</h1></div>
                        <div className="garage-wallet"><span className="credit-chip"><i>¢</i>{profile.credits.toLocaleString()}</span><span className="coin-wallet-chip"><i>◈</i>{(profile.roadCoins || 0).toLocaleString()}<small>ROAD COINS</small></span></div>
                    </header>
                    <div className="story-intro">
                        <div><span>YOUR CREW · GRIDBREAKERS</span><h2>{profile.storyComplete ? 'THE CROWN IS YOURS' : 'Eight chapters. One road crown.'}</h2><p>{profile.storyComplete ? 'You have cleared the whole championship. Replay any unlocked event or chase a cleaner finish.' : 'Start with a rookie run, earn your way through the crews, then take on the championship finale.'}</p></div>
                        <b>{profile.storyComplete ? '08 / 08' : `${String(Math.min((profile.storyStage || 0) + 1, ROAD_CAMPAIGN.length)).padStart(2, '0')} / 08`}<small>CHAPTERS</small></b>
                    </div>
                    <div className="story-grid">
                        {ROAD_CAMPAIGN.map((item, index) => {
                            const unlocked = index <= (profile.storyStage || 0) || profile.storyComplete;
                            const selected = index === storyStage;
                            const chapterTrack = ROAD_TRACKS.find((candidate) => candidate.id === item.trackId);
                            const cleared = profile.storyComplete || index < (profile.storyStage || 0);
                            return <button key={item.id} className={`story-card ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}`} disabled={!unlocked} onClick={() => { setStoryStage(index); setTrackId(item.trackId); }} style={{ '--course-tone': chapterTrack.tone, '--course-sky': chapterTrack.sky }}>
                                <div className="story-card-art"><div className="course-art-ridge" /><div className="course-art-road" /><span>CHAPTER {String(index + 1).padStart(2, '0')}</span><b>{unlocked ? (cleared ? 'CLEARED' : 'UNLOCKED') : 'LOCKED'}</b></div>
                                <div className="story-card-copy"><small>{item.crew} · {chapterTrack.biome}</small><strong>{item.title}</strong><p>{item.chapter}</p><div><span>RIVAL · {item.rival.toUpperCase()}</span><span>{item.goal === 1 ? 'WIN' : `TOP ${item.goal}`}</span></div></div>
                            </button>;
                        })}
                    </div>
                    <div className="story-launch"><div><span>SELECTED CHAPTER</span><b>{ROAD_CAMPAIGN[storyStage].title} · {ROAD_CAMPAIGN[storyStage].briefing}</b></div><button className="button-primary" onClick={() => { setTrackId(ROAD_CAMPAIGN[storyStage].trackId); openGarage('story'); }}>BUILD YOUR RIDE <span>↗</span></button></div>
                </section>
            )}

            {screen === 'garage' && (
                <section className="setup-screen garage-screen">
                    <header className="setup-header">
                        <button className="back-link" onClick={() => setScreen('home')}>← BACK</button>
                        <div><span className="eyebrow">BUILD YOUR MACHINE</span><h1>THE GARAGE</h1></div>
                        <div className="garage-wallet"><span className="credit-chip"><i>¢</i>{profile.credits.toLocaleString()}</span><span className="coin-wallet-chip"><i>◈</i>{(profile.roadCoins || 0).toLocaleString()}<small>ROAD COINS</small></span></div>
                    </header>
                    <div className="garage-layout">
                        <div className="garage-preview-panel">
                            <div className="garage-scene-grid" />
                            <RoadVehiclePreview vehicle={vehicle} paint={paint} className="garage-model" />
                            <span className="garage-preview-badge">LIVE VEHICLE PREVIEW</span>
                            <div className="garage-model-caption"><span>{String(ROAD_VEHICLES.indexOf(vehicle) + 1).padStart(2, '0')} / {String(ROAD_VEHICLES.length).padStart(2, '0')}</span><b>{vehicle.name}</b><small>{vehicle.description}</small></div>
                        </div>
                        <div className="garage-controls">
                            <div className="section-kicker">01 / CHOOSE YOUR CLASS</div>
                            <div className="segmented-control">
                                {['BIKE', 'CAR'].map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => {
                                    setCategory(item);
                                    const first = ROAD_VEHICLES.find((entry) => entry.type === item);
                                    if (first) { setVehicleId(first.id); setPaint(first.defaultPaint); }
                                }}>{item === 'BIKE' ? 'BIKES' : 'CARS'}</button>)}
                            </div>
                            <div className="vehicle-card-grid">
                                {garageVehicles.map((item, index) => (
                                    <button key={item.id} className={`vehicle-option ${item.id === vehicle.id ? 'selected' : ''}`} onClick={() => {
                                        setVehicleId(item.id);
                                        setPaint(item.defaultPaint);
                                    }}>
                                        <span className="option-index">0{index + 1}</span><span className="option-class">{item.type}</span>
                                        <b>{item.name}</b><small>{item.description}</small>
                                        <span className="option-arrow">↗</span>
                                    </button>
                                ))}
                            </div>
                            <div className="garage-section-title"><span>02 / FINISH</span><b>{selectedPaint.name}</b></div>
                            <div className="paint-swatches" aria-label="Choose paint colour">
                                {PAINT_COLORS.map((item) => <button key={item.name} title={item.name} aria-label={item.name} className={paint === item.color ? 'selected' : ''} style={{ '--swatch': `#${item.color.toString(16).padStart(6, '0')}` }} onClick={() => setPaint(item.color)} />)}
                            </div>
                            <div className="garage-stats">
                                <div className="garage-section-title"><span>03 / PERFORMANCE</span><b>STOCK + UPGRADES</b></div>
                                <StatRow label="TOP SPEED" value={vehicle.stats.speed + (vehicleUpgrades.speed || 0)} />
                                <StatRow label="ACCELERATION" value={vehicle.stats.acceleration + (vehicleUpgrades.accel || 0)} />
                                <StatRow label="HANDLING" value={vehicle.stats.handling + (vehicleUpgrades.handling || 0)} />
                                <StatRow label="DURABILITY" value={vehicle.stats.armor + (vehicleUpgrades.armor || 0)} />
                            </div>
                            <div className="garage-section-title tune-heading"><span>04 / COIN UPGRADES</span><b>◈ {(profile.roadCoins || 0).toLocaleString()} COINS · SAVED PER VEHICLE</b></div>
                            <div className="upgrade-list">
                                {UPGRADES.map((upgrade) => {
                                    const level = vehicleUpgrades[upgrade.key] || 0;
                                    const maxed = level >= UPGRADE_MAX_LEVEL;
                                    const cost = upgradeCost(level);
                                    const affordable = !maxed && (profile.roadCoins || 0) >= cost;
                                    const now = UPGRADE_NOW[upgrade.key](describeWith(upgrade.key, level));
                                    const next = maxed ? null : UPGRADE_NOW[upgrade.key](describeWith(upgrade.key, level + 1));
                                    return (
                                        <div key={upgrade.key} className={`upgrade-row ${maxed ? 'maxed' : ''}`}>
                                            <div className="upgrade-name"><b>{upgrade.label}</b><small>{upgrade.detail}</small></div>
                                            <div className="upgrade-pips">{Array.from({ length: UPGRADE_MAX_LEVEL }, (_, i) => <i key={i} className={i < level ? 'on' : ''} />)}</div>
                                            <div className="upgrade-effect">{now}{next && <> <span>→</span> <em>{next}</em></>}</div>
                                            <button className="upgrade-buy" disabled={!affordable} onClick={() => purchaseUpgrade(upgrade.key)}>{maxed ? 'MAX' : `◈ ${cost}`}</button>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="spec-readout"><span>{specNow.isBike ? 'BIKE' : 'CAR'} · {Math.round(specNow.mass)} KG</span><span>NITRO TOP SPEED {describeSpec(specNow).nitroTopSpeedKmh} KM/H</span></div>
                            <button className="button-primary garage-continue" onClick={enterCourseSelect}>{mode === 'story' ? 'ENTER CHAPTER' : 'PICK A ROUTE'} <span>↗</span></button>
                        </div>
                    </div>
                </section>
            )}

            {screen === 'courses' && (
                <section className="setup-screen course-screen">
                    <header className="setup-header">
                        <button className="back-link" onClick={() => setScreen(mode === 'story' ? 'story' : 'garage')}>← {mode === 'story' ? 'STORY' : 'GARAGE'}</button>
                        <div><span className="eyebrow">{mode === 'story' ? `STORY CHAPTER ${String(storyStage + 1).padStart(2, '0')} · ${chapter.crew}` : 'OPEN EVENT'}</span><h1>{mode === 'story' ? chapter.title.toUpperCase() : 'CHOOSE YOUR ROAD'}</h1></div>
                        <span className="credit-chip"><i>¢</i>{profile.credits.toLocaleString()}</span>
                    </header>
                    <div className="course-heading"><div><span>{mode === 'story' ? `RIVAL · ${chapter.rival.toUpperCase()}` : `INDEPENDENT CIRCUITS · ${ROAD_TRACKS.length} ROUTES`}</span><p>{mode === 'story' ? chapter.briefing : 'Every course is a closed race loop with its own terrain, pacing, and risk.'}</p></div><div className="course-loadout"><span>{vehicle.type}</span><b>{vehicle.name}</b></div></div>
                    <div className="course-grid">
                        {trackOptions.map((item) => {
                            const index = ROAD_TRACKS.indexOf(item);
                            return <button key={item.id} className={`course-card ${item.id === track.id ? 'selected' : ''}`} style={{ '--course-tone': item.tone, '--course-sky': item.sky }} onClick={() => setTrackId(item.id)}>
                                <div className="course-card-art"><div className="course-art-ridge" /><div className="course-art-road" /><span className="course-number">0{index + 1}</span><span className="course-grade">{item.grade}</span></div>
                                <div className="course-info"><small>{item.region} · {item.biome}</small><b>{item.name}</b><p>{item.description}</p><div><span>{item.laps} LAPS</span><span>ROAD RACE</span></div></div>
                            </button>;
                        })}
                    </div>
                    <div className="course-launch-bar"><div><span>{mode === 'story' ? `TARGET · ${chapter.goal === 1 ? 'WIN THE EVENT' : `FINISH TOP ${chapter.goal}`}` : 'SELECTED ROUTE'}</span><b>{track.name}</b></div><button className="button-primary" onClick={startRace}>{mode === 'story' ? 'RACE CHAPTER' : 'ENTER THE RACE'} <span>↗</span></button></div>
                </section>
            )}

            {screen === 'race' && (
                <section className="race-screen">
                    <div className="race-canvas" ref={gameHostRef} />
                    {racePhase === 'loading' && <div className="race-message"><div className="loading-wheel" /><span>PREPARING THE GRID</span><small>{track.name} · {vehicle.name}</small></div>}
                    {racePhase === 'countdown' && <div className="race-countdown"><span>{countdown > 0 ? countdown : 'RIDE!'}</span><small>{track.name.toUpperCase()}</small></div>}
                    {racePhase === 'running' && hud && (
                        <RaceHUD
                            hud={hud}
                            vehicle={vehicle}
                            minimapPath={minimapPath}
                            eventLabel={mode === 'story' ? `STORY ${String(storyStage + 1).padStart(2, '0')} · VS ${chapter.rival.toUpperCase()}` : 'TRL / OPEN SERIES'}
                            eventTitle={mode === 'story' ? chapter.title : track.name}
                            onPause={() => { setRacePhase('paused'); gameRef.current?.setPaused(true); }}
                        />
                    )}
                    {racePhase === 'paused' && <div className="race-overlay"><div className="overlay-card"><span className="eyebrow">TAKE A BREATHER</span><h2>RACE PAUSED</h2><p>{track.name} · {vehicle.name}</p><button className="button-primary" onClick={resumeRace}>BACK TO THE ROAD <span>↗</span></button><button className="button-secondary" onClick={exitRace}>QUIT TO THE LEAGUE</button></div></div>}
                    {racePhase === 'error' && <div className="race-overlay"><div className="overlay-card"><span className="eyebrow">RACE SETUP</span><h2>COULD NOT LOAD</h2><p>{gameError}</p><button className="button-primary" onClick={() => setScreen('courses')}>BACK TO ROUTES <span>↗</span></button></div></div>}
                </section>
            )}

            {screen === 'result' && result && (
                <section className="result-screen">
                    <header className="setup-header"><button className="back-link" onClick={() => setScreen('home')}>← LEAGUE</button><div><span className="eyebrow">EVENT COMPLETE · {result.track.name}</span><h1>RACE REPORT</h1></div><span className="credit-chip"><i>¢</i>{profile.credits.toLocaleString()}</span></header>
                    <div className="result-layout"><div className="result-place-panel"><span>FINISH POSITION</span><b>{String(result.position).padStart(2, '0')}<i>/09</i></b><small>{result.position === 1 ? 'THE ROAD BELONGS TO YOU' : result.position <= 3 ? 'PODIUM FINISH' : 'THE NEXT RUN IS YOURS'}</small></div><div className="result-details"><span className="section-kicker">RACE STATS</span><div className="result-stat"><span>TIME</span><b>{formatTime(result.time)}</b></div><div className="result-stat"><span>RACE SCORE</span><b>{(result.score || 0).toLocaleString()}</b></div><div className="result-stat"><span>ROAD COINS</span><b>{result.coins || 0}</b></div><div className="result-stat"><span>TAKEDOWNS</span><b>{result.takedowns || 0}</b></div><div className="result-stat"><span>BEST LAP</span><b>{formatTime(result.bestLap)}</b></div><div className="result-stat"><span>VEHICLE CONDITION</span><b>{100 - result.damage}%</b></div>{result.mode === 'story' && <div className={`chapter-result ${result.chapterClear ? 'clear' : ''}`}><b>{result.chapterClear ? (result.chapterFinal ? 'CHAMPIONSHIP COMPLETE' : 'CHAPTER CLEARED') : 'CHAPTER NOT CLEARED'}</b><span>{result.chapterClear ? 'Your result unlocked the next race.' : `Finish ${result.chapter.goal === 1 ? '1st' : `in the top ${result.chapter.goal}`} to advance.`}</span></div>}<div className="result-reward"><span>{result.mode === 'story' ? 'CHAPTER PAYOUT' : 'RACE PAYOUT'} · COINS WORTH ¢{(result.coins || 0) * 25}</span><b>+¢{result.credits}</b></div><button className="button-primary" onClick={continueFromResult}>{result.mode === 'story' ? (result.chapterClear ? (result.chapterFinal ? 'REPLAY CAMPAIGN' : 'NEXT CHAPTER') : 'RETRY CHAPTER') : 'NEXT EVENT'} <span>↗</span></button><button className="button-secondary" onClick={() => openGarage(mode)}>RETURN TO GARAGE</button></div></div>
                </section>
            )}

            {screen === 'records' && (
                <section className="setup-screen records-screen"><header className="setup-header"><button className="back-link" onClick={() => setScreen('home')}>← LEAGUE</button><div><span className="eyebrow">YOUR CAREER PROFILE</span><h1>RACE RECORDS</h1></div><span className="credit-chip"><i>¢</i>{profile.credits.toLocaleString()}</span></header><div className="record-grid"><div><span>RACES ENTERED</span><b>{profile.races}</b></div><div><span>VICTORIES</span><b>{profile.wins}</b></div><div><span>BEST FINISH</span><b>{profile.races ? `${profile.bestFinish}${profile.bestFinish === 1 ? 'ST' : profile.bestFinish === 2 ? 'ND' : profile.bestFinish === 3 ? 'RD' : 'TH'}` : '—'}</b></div><div><span>FASTEST FINISH</span><b>{formatTime(profile.bestTime)}</b></div><div><span>CAREER POINTS</span><b>{(profile.totalPoints || 0).toLocaleString()}</b></div><div><span>ROAD COINS</span><b>{profile.roadCoins || 0}</b></div><div><span>BEST RACE SCORE</span><b>{(profile.bestScore || 0).toLocaleString()}</b></div></div><button className="button-primary records-cta" onClick={() => openGarage('career')}>GET BACK OUT THERE <span>↗</span></button></section>
            )}
        </main>
    );
}
