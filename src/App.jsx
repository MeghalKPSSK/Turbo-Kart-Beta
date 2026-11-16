import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ROAD_TRACKS, ROAD_VEHICLES } from './game/data/roadRacing';
import { CUPS, EVENT_TYPES, cupRace, eventRace, findEvent, trackById } from './game/data/career';
import { RoadRaceGame, preloadRace } from './game/systems/RoadRaceGame';
import { preloadCityLook } from './game/effects/cityLook';
import { abandonCup, applyRaceResult, buyUpgrade, buyVehicle, loadProfile, ownsVehicle, saveProfile, startCup } from './state/profile';
import { QUALITY_LEVELS, loadSettings, saveSettings, wantsTouchControls } from './state/settings';
import { useRaceInput } from './input/useRaceInput';
import { uiAudio } from './state/uiAudio';
import HomeScreen from './screens/HomeScreen';
import CareerScreen from './screens/CareerScreen';
import CupsScreen from './screens/CupsScreen';
import GarageScreen from './screens/GarageScreen';
import CourseScreen from './screens/CourseScreen';
import RaceScreen from './screens/RaceScreen';
import ResultScreen from './screens/ResultScreen';
import RecordsScreen from './screens/RecordsScreen';
import SettingsScreen from './screens/SettingsScreen';
import './App.css';

// Race phases in which the player's inputs are tracked (see useRaceInput).
const INPUT_PHASES = ['loading', 'countdown', 'running', 'paused'];

export default function App() {
    const [screen, setScreen] = useState('home');
    // What the player is setting up a race for: 'career' (one event), 'cup' (the next round of
    // the cup in progress), 'quick' (any route) or 'garage' (just visiting the garage).
    const [mode, setMode] = useState('quick');
    const [eventId, setEventId] = useState(null);
    const [category, setCategory] = useState('BIKE');
    const [vehicleId, setVehicleId] = useState('bike_nightjar');
    const [paint, setPaint] = useState(ROAD_VEHICLES[0].defaultPaint);
    const [trackId, setTrackId] = useState(ROAD_TRACKS[0].id);
    const [profile, setProfile] = useState(loadProfile);
    const [settings, setSettings] = useState(loadSettings);
    // Everything one race needs, fixed when it starts: route, rules, vehicle and labels.
    const [setup, setSetup] = useState(null);
    const [racePhase, setRacePhase] = useState('idle');
    const [raceSession, setRaceSession] = useState(0);
    const [countdown, setCountdown] = useState(3);
    const [hud, setHud] = useState(null);
    const [result, setResult] = useState(null);
    const [gameError, setGameError] = useState('');
    const [minimapPath, setMinimapPath] = useState([]);
    const [loadFraction, setLoadFraction] = useState(0);
    const appShellRef = useRef(null);
    const gameHostRef = useRef(null);
    const gameRef = useRef(null);

    const vehicle = useMemo(() => ROAD_VEHICLES.find((item) => item.id === vehicleId) || ROAD_VEHICLES[0], [vehicleId]);
    const track = useMemo(() => ROAD_TRACKS.find((item) => item.id === trackId) || ROAD_TRACKS[0], [trackId]);
    const garageEntry = profile.garage?.[vehicleId];
    const upgradeKey = JSON.stringify(garageEntry || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const vehicleUpgrades = useMemo(() => garageEntry || {}, [upgradeKey]);
    const touch = useMemo(() => wantsTouchControls(settings.touch), [settings.touch]);
    const activeCup = profile.activeCup ? CUPS.find((cup) => cup.id === profile.activeCup.id) : null;

    useEffect(() => { saveProfile(profile); }, [profile]);
    useEffect(() => { saveSettings(settings); }, [settings]);
    useEffect(() => {
        gameRef.current?.setVolume(settings.volume);
        uiAudio.setVolume(settings.volume);
    }, [settings.volume]);

    // Fetch what every race needs while the player is still in the menus: first the physics
    // engine, then the city sky, textures and trees, then the vehicle models. Skipped when the
    // browser reports a data-saver connection.
    useEffect(() => {
        if (navigator.connection?.saveData) return undefined;
        let cancelled = false;
        const timer = window.setTimeout(async () => {
            await preloadRace();
            if (cancelled) return;
            await preloadCityLook();
            if (!cancelled) preloadRace({ vehicles: true });
        }, 1500);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, []);

    // Every button ticks. Race controls are excluded: they have the engine to listen to.
    useEffect(() => {
        const handleClick = (event) => {
            const button = event.target instanceof Element ? event.target.closest('button') : null;
            if (button && !button.disabled && !button.closest('.touch-controls')) uiAudio.click();
        };
        document.addEventListener('click', handleClick, true);
        return () => document.removeEventListener('click', handleClick, true);
    }, []);

    // Results are applied to the latest save, and settings never restart a race: both are read
    // through refs from inside the race callbacks.
    const profileRef = useRef(profile);
    const settingsRef = useRef(settings);
    useEffect(() => { profileRef.current = profile; }, [profile]);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    useLayoutEffect(() => {
        if (appShellRef.current) {
            appShellRef.current.scrollTop = 0;
            const screenElement = appShellRef.current.firstElementChild;
            if (screenElement instanceof HTMLElement) screenElement.scrollTop = 0;
        }
    }, [screen]);

    const openGarage = (nextMode) => {
        setMode(nextMode);
        setScreen('garage');
    };

    // Builds the race for the current mode with the vehicle chosen in the garage.
    const buildSetup = () => {
        const machine = { vehicle, paint, upgrades: vehicleUpgrades };
        if (mode === 'career') {
            const item = findEvent(eventId);
            if (!item) return null;
            return { ...machine, mode, event: item, track: trackById(item.trackId), rules: eventRace(item),
                label: `CAREER · ${EVENT_TYPES[item.type].label}`, title: item.name, rule: EVENT_TYPES[item.type].rule };
        }
        if (mode === 'cup' && activeCup) {
            const round = profile.activeCup.round;
            const cupTrack = trackById(activeCup.tracks[round]);
            return { ...machine, mode, track: cupTrack, rules: cupRace(activeCup),
                label: `${activeCup.name} · ROUND ${round + 1} OF ${activeCup.tracks.length}`, title: cupTrack.name, rule: 'Points for every finishing position. Most points after the last round takes the cup.' };
        }
        return { ...machine, mode: 'quick', track, rules: null, label: 'TRL / OPEN SERIES', title: track.name, rule: '' };
    };

    // Also restarts: a new session number tears the running race down and builds a fresh one.
    const startRace = useCallback((nextSetup) => {
        if (nextSetup) setSetup(nextSetup);
        setResult(null);
        setHud(null);
        setGameError('');
        setLoadFraction(0);
        setRacePhase('loading');
        setCountdown(3);
        setRaceSession((value) => value + 1);
        setScreen('race');
    }, []);

    const launch = () => {
        const next = buildSetup();
        if (next) startRace(next);
    };

    useEffect(() => {
        if (screen !== 'race' || !setup || !gameHostRef.current || gameRef.current) return undefined;
        let live = true;
        const game = new RoadRaceGame(gameHostRef.current, {
            track: setup.track,
            vehicle: setup.vehicle,
            paint: setup.paint,
            upgrades: setup.upgrades,
            event: setup.rules,
            quality: QUALITY_LEVELS[settingsRef.current.quality],
            volume: settingsRef.current.volume,
            assist: settingsRef.current.assist,
            onReady: (info) => {
                if (!live) return;
                setMinimapPath(info?.minimapPath || []);
                setRacePhase('countdown');
                setCountdown(3);
            },
            onProgress: (fraction) => { if (live) setLoadFraction(fraction); },
            onHUD: (data) => { if (live) setHud(data); },
            onFinish: (raceResult) => {
                if (!live) return;
                const outcome = applyRaceResult(profileRef.current, raceResult, setup);
                profileRef.current = outcome.profile;
                setProfile(outcome.profile);
                setResult({ ...raceResult, summary: outcome.summary });
                if (outcome.summary.mode === 'career') uiAudio.stars(outcome.summary.stars);
                else uiAudio.finish(raceResult.position);
                setRacePhase('results');
                setScreen('result');
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
    }, [screen, raceSession, setup]);

    useEffect(() => {
        if (screen !== 'race' || racePhase !== 'countdown') return undefined;
        const timer = window.setTimeout(() => {
            if (countdown > 1) {
                gameRef.current?.countBeep();
                setCountdown(countdown - 1);
            } else {
                setCountdown(0);
                setRacePhase('running');
                gameRef.current?.setPaused(false);
            }
        }, 850);
        return () => window.clearTimeout(timer);
    }, [screen, racePhase, countdown]);

    const pauseRace = useCallback(() => {
        setRacePhase('paused');
        gameRef.current?.setPaused(true);
    }, []);

    const resumeRace = useCallback(() => {
        gameRef.current?.setPaused(false);
        setRacePhase('running');
    }, []);

    // The pause key and the gamepad Start button toggle.
    const togglePause = useCallback(() => {
        if (racePhase === 'running') pauseRace();
        else if (racePhase === 'paused') resumeRace();
    }, [racePhase, pauseRace, resumeRace]);

    const press = useRaceInput({
        active: screen === 'race' && INPUT_PHASES.includes(racePhase),
        running: screen === 'race' && racePhase === 'running',
        gameRef,
        keys: settings.keys,
        onPause: togglePause
    });

    // Pause when the tab is hidden so the race does not run on unseen.
    useEffect(() => {
        if (screen !== 'race' || racePhase !== 'running') return undefined;
        const handleVisibility = () => { if (document.hidden) pauseRace(); };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [screen, racePhase, pauseRace]);

    const exitRace = (nextScreen) => {
        // The race effect's cleanup disposes the game exactly once when the screen changes.
        setRacePhase('idle');
        setHud(null);
        setScreen(nextScreen);
    };

    // Where a race was entered from, for the quit and back buttons.
    const lobby = setup?.mode === 'career' ? 'career' : setup?.mode === 'cup' ? 'cups' : 'courses';

    const continueFromResult = () => {
        if (result?.summary.cup && !result.summary.cup.finished) {
            // Straight into the next round with the same machine.
            const cup = result.summary.cup.cup;
            const round = result.summary.cup.round;
            const cupTrack = trackById(cup.tracks[round]);
            startRace({ ...setup, track: cupTrack, title: cupTrack.name, label: `${cup.name} · ROUND ${round + 1} OF ${cup.tracks.length}` });
            return;
        }
        setScreen(lobby);
    };

    // One step back from wherever the player is. Escape and the browser's Back button both
    // do this, so neither ever drops the player out of the game from a menu.
    const goBack = () => {
        if (screen === 'race') {
            if (racePhase === 'running') pauseRace();
            else if (racePhase === 'paused' || racePhase === 'error') exitRace(lobby);
            return;
        }
        if (screen === 'result') { continueFromResult(); return; }
        if (screen === 'garage') { setScreen(mode === 'career' ? 'career' : mode === 'cup' ? 'cups' : 'home'); return; }
        if (screen === 'courses') { setScreen('garage'); return; }
        if (screen !== 'home') setScreen('home');
    };
    const goBackRef = useRef(goBack);
    goBackRef.current = goBack;

    // Escape steps back through the menus (in a race it is the pause key, handled with the controls).
    useEffect(() => {
        if (screen === 'race' || screen === 'home') return undefined;
        const handleKey = (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[data-listening="true"]')) return;
            goBackRef.current();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [screen]);

    // The browser's Back button: away from the home screen there is always one history entry
    // of ours to consume, so Back means "back one screen" until the player is home again.
    useEffect(() => {
        if (screen === 'home') return undefined;
        if (!window.history.state?.trl) window.history.pushState({ trl: true }, '');
        const handlePop = () => { goBackRef.current(); };
        window.addEventListener('popstate', handlePop);
        return () => window.removeEventListener('popstate', handlePop);
    }, [screen, racePhase]);

    const selectVehicle = (item) => {
        setVehicleId(item.id);
        setPaint(item.defaultPaint);
    };

    const selectCategory = (item) => {
        setCategory(item);
        const first = ROAD_VEHICLES.find((entry) => entry.type === item && ownsVehicle(profile, entry.id)) || ROAD_VEHICLES.find((entry) => entry.type === item);
        if (first) selectVehicle(first);
    };

    const continueLabel = mode === 'career' ? 'START EVENT' : mode === 'cup' ? 'START ROUND' : mode === 'quick' ? 'PICK A ROUTE' : 'DONE';
    const leaveGarage = () => {
        if (mode === 'quick') setScreen('courses');
        else if (mode === 'garage') setScreen('home');
        else launch();
    };

    return (
        <main ref={appShellRef} className={`app-shell ${screen === 'race' ? 'app-racing' : ''}`}>
            {screen === 'home' && (
                <HomeScreen profile={profile} vehicle={vehicle} paint={paint} keys={settings.keys}
                    onCareer={() => setScreen('career')} onCups={() => setScreen('cups')} onQuickRace={() => openGarage('quick')}
                    onGarage={() => openGarage('garage')} onRecords={() => setScreen('records')} onSettings={() => setScreen('settings')} />
            )}
            {screen === 'career' && (
                <CareerScreen profile={profile} selectedId={eventId} onSelect={(id) => { setEventId(id); preloadRace({ trackId: findEvent(id)?.trackId }); }}
                    onBack={() => setScreen('home')} onBuild={() => openGarage('career')} />
            )}
            {screen === 'cups' && (
                <CupsScreen profile={profile} onBack={() => setScreen('home')}
                    onStart={(cupId) => { setProfile((current) => startCup(current, cupId)); openGarage('cup'); }}
                    onContinue={() => openGarage('cup')} onAbandon={() => setProfile(abandonCup)} />
            )}
            {screen === 'garage' && (
                <GarageScreen profile={profile} continueLabel={continueLabel} vehicle={vehicle} paint={paint} category={category} upgrades={vehicleUpgrades}
                    onCategory={selectCategory} onVehicle={selectVehicle} onPaint={setPaint}
                    onUpgrade={(key) => { uiAudio.buy(); setProfile((current) => buyUpgrade(current, vehicleId, key)); }}
                    onBuy={(id) => { uiAudio.buy(); setProfile((current) => buyVehicle(current, id)); }}
                    onBack={() => setScreen(mode === 'career' ? 'career' : mode === 'cup' ? 'cups' : 'home')} onContinue={leaveGarage} />
            )}
            {screen === 'courses' && (
                <CourseScreen profile={profile} chapter={null} storyStage={0} vehicle={vehicle} track={track} trackOptions={ROAD_TRACKS}
                    onTrack={(id) => { setTrackId(id); preloadRace({ trackId: id }); }} onBack={() => setScreen('garage')} onStart={launch} />
            )}
            {screen === 'race' && setup && (
                <RaceScreen hostRef={gameHostRef} phase={racePhase} countdown={countdown} hud={hud} vehicle={setup.vehicle} track={setup.track}
                    label={setup.label} title={setup.title} rule={setup.rule} progress={loadFraction} minimapPath={minimapPath} error={gameError} keys={settings.keys} touch={touch} press={press}
                    onPause={pauseRace} onResume={resumeRace} onRestart={() => startRace()} onQuit={() => exitRace('home')} onBackToRoutes={() => exitRace(lobby)} />
            )}
            {screen === 'result' && result && (
                <ResultScreen result={result} profile={profile} onContinue={continueFromResult} onRetry={() => startRace()}
                    onGarage={() => openGarage('garage')} onHome={() => setScreen('home')} />
            )}
            {screen === 'records' && <RecordsScreen profile={profile} onBack={() => setScreen('home')} onRace={() => setScreen('career')} />}
            {screen === 'settings' && <SettingsScreen settings={settings} onChange={setSettings} onBack={() => setScreen('home')} />}
        </main>
    );
}
