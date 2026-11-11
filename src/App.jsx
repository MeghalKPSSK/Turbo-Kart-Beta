import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ROAD_CAMPAIGN, ROAD_TRACKS, ROAD_VEHICLES, UPGRADE_MAX_LEVEL, upgradeCost } from './game/data/roadRacing';
import { RoadRaceGame } from './game/systems/RoadRaceGame';
import { loadProfile, saveProfile } from './state/profile';
import { QUALITY_LEVELS, loadSettings, saveSettings, wantsTouchControls } from './state/settings';
import { useRaceInput } from './input/useRaceInput';
import HomeScreen from './screens/HomeScreen';
import StoryScreen from './screens/StoryScreen';
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
    const [mode, setMode] = useState('career');
    const [storyStage, setStoryStage] = useState(0);
    const [category, setCategory] = useState('BIKE');
    const [vehicleId, setVehicleId] = useState('bike_nightjar');
    const [paint, setPaint] = useState(ROAD_VEHICLES[0].defaultPaint);
    const [trackId, setTrackId] = useState(ROAD_TRACKS[0].id);
    const [profile, setProfile] = useState(loadProfile);
    const [settings, setSettings] = useState(loadSettings);
    const [racePhase, setRacePhase] = useState('idle');
    const [raceSession, setRaceSession] = useState(0);
    const [countdown, setCountdown] = useState(3);
    const [hud, setHud] = useState(null);
    const [result, setResult] = useState(null);
    const [gameError, setGameError] = useState('');
    const [minimapPath, setMinimapPath] = useState([]);
    const appShellRef = useRef(null);
    const gameHostRef = useRef(null);
    const gameRef = useRef(null);

    const vehicle = useMemo(() => ROAD_VEHICLES.find((item) => item.id === vehicleId) || ROAD_VEHICLES[0], [vehicleId]);
    const track = useMemo(() => ROAD_TRACKS.find((item) => item.id === trackId) || ROAD_TRACKS[0], [trackId]);
    const garageEntry = profile.garage?.[vehicleId];
    const upgradeKey = JSON.stringify(garageEntry || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const vehicleUpgrades = useMemo(() => garageEntry || {}, [upgradeKey]);
    const chapter = mode === 'story' ? ROAD_CAMPAIGN[storyStage] : null;
    const trackOptions = chapter ? ROAD_TRACKS.filter((item) => item.id === chapter.trackId) : ROAD_TRACKS;
    const touch = useMemo(() => wantsTouchControls(settings.touch), [settings.touch]);

    useEffect(() => { saveProfile(profile); }, [profile]);
    useEffect(() => { saveSettings(settings); }, [settings]);
    useEffect(() => { gameRef.current?.setVolume(settings.volume); }, [settings.volume]);

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

    const selectChapter = (index) => {
        setStoryStage(index);
        setTrackId(ROAD_CAMPAIGN[index].trackId);
    };

    const openStory = () => {
        selectChapter(Math.min(profile.storyStage || 0, ROAD_CAMPAIGN.length - 1));
        setMode('story');
        setScreen('story');
    };

    // Also restarts: a new session number tears the running race down and builds a fresh one.
    const startRace = useCallback(() => {
        setResult(null);
        setHud(null);
        setGameError('');
        setRacePhase('loading');
        setCountdown(3);
        setRaceSession((value) => value + 1);
        setScreen('race');
    }, []);

    // The race itself. Settings are read through a ref so changing one never restarts a race.
    const settingsRef = useRef(settings);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    useEffect(() => {
        if (screen !== 'race' || !gameHostRef.current || gameRef.current) return undefined;
        let live = true;
        const game = new RoadRaceGame(gameHostRef.current, {
            track,
            vehicle,
            paint,
            upgrades: vehicleUpgrades,
            quality: QUALITY_LEVELS[settingsRef.current.quality],
            volume: settingsRef.current.volume,
            onReady: (info) => {
                if (!live) return;
                setMinimapPath(info?.minimapPath || []);
                setRacePhase('countdown');
                setCountdown(3);
            },
            onHUD: (data) => { if (live) setHud(data); },
            onFinish: (raceResult) => {
                if (!live) return;
                const chapterClear = chapter ? raceResult.position <= chapter.goal : false;
                const chapterFinal = Boolean(chapter) && storyStage === ROAD_CAMPAIGN.length - 1;
                setResult({ ...raceResult, mode, chapter, chapterClear, chapterFinal });
                setRacePhase('results');
                setScreen('result');
                setProfile((current) => ({
                    ...current,
                    credits: current.credits + raceResult.credits,
                    races: current.races + 1,
                    wins: current.wins + (raceResult.position === 1 ? 1 : 0),
                    bestFinish: Math.min(current.bestFinish, raceResult.position),
                    bestTime: current.bestTime === null ? raceResult.time : Math.min(current.bestTime, raceResult.time),
                    bestScore: Math.max(current.bestScore || 0, raceResult.score || 0),
                    totalPoints: (current.totalPoints || 0) + (raceResult.score || 0),
                    roadCoins: (current.roadCoins || 0) + (raceResult.coins || 0),
                    takedowns: (current.takedowns || 0) + (raceResult.takedowns || 0),
                    storyStage: chapterClear
                        ? Math.min(ROAD_CAMPAIGN.length - 1, Math.max(current.storyStage || 0, storyStage + 1))
                        : current.storyStage || 0,
                    storyComplete: Boolean(current.storyComplete || (chapterClear && chapterFinal))
                }));
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

    const exitRace = (nextScreen = 'home') => {
        // The race effect's cleanup disposes the game exactly once when the screen changes.
        setRacePhase('idle');
        setHud(null);
        setScreen(nextScreen);
    };

    const continueFromResult = () => {
        if (result?.mode === 'story') {
            const next = result.chapterClear && !result.chapterFinal ? Math.min(ROAD_CAMPAIGN.length - 1, storyStage + 1) : storyStage;
            selectChapter(next);
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

    const selectVehicle = (item) => {
        setVehicleId(item.id);
        setPaint(item.defaultPaint);
    };

    const selectCategory = (item) => {
        setCategory(item);
        const first = ROAD_VEHICLES.find((entry) => entry.type === item);
        if (first) selectVehicle(first);
    };

    return (
        <main ref={appShellRef} className={`app-shell ${screen === 'race' ? 'app-racing' : ''}`}>
            {screen === 'home' && (
                <HomeScreen profile={profile} vehicle={vehicle} paint={paint} keys={settings.keys}
                    onStory={openStory} onQuickRace={() => openGarage('quick')} onGarage={() => openGarage('garage')}
                    onRecords={() => setScreen('records')} onSettings={() => setScreen('settings')} />
            )}
            {screen === 'story' && (
                <StoryScreen profile={profile} storyStage={storyStage} onSelect={selectChapter}
                    onBack={() => setScreen('home')} onBuild={() => { selectChapter(storyStage); openGarage('story'); }} />
            )}
            {screen === 'garage' && (
                <GarageScreen profile={profile} mode={mode} vehicle={vehicle} paint={paint} category={category} upgrades={vehicleUpgrades}
                    onCategory={selectCategory} onVehicle={selectVehicle} onPaint={setPaint} onUpgrade={purchaseUpgrade}
                    onBack={() => setScreen(mode === 'story' ? 'story' : 'home')} onContinue={() => setScreen('courses')} />
            )}
            {screen === 'courses' && (
                <CourseScreen profile={profile} chapter={chapter} storyStage={storyStage} vehicle={vehicle} track={track} trackOptions={trackOptions}
                    onTrack={setTrackId} onBack={() => setScreen('garage')} onStart={startRace} />
            )}
            {screen === 'race' && (
                <RaceScreen hostRef={gameHostRef} phase={racePhase} countdown={countdown} hud={hud} vehicle={vehicle} track={track}
                    chapter={chapter} storyStage={storyStage} minimapPath={minimapPath} error={gameError} keys={settings.keys} touch={touch} press={press}
                    onPause={pauseRace} onResume={resumeRace} onRestart={startRace} onQuit={() => exitRace('home')} onBackToRoutes={() => exitRace('courses')} />
            )}
            {screen === 'result' && result && (
                <ResultScreen result={result} profile={profile} onContinue={continueFromResult} onRetry={startRace}
                    onGarage={() => openGarage(mode)} onHome={() => setScreen('home')} />
            )}
            {screen === 'records' && <RecordsScreen profile={profile} onBack={() => setScreen('home')} onRace={() => openGarage('career')} />}
            {screen === 'settings' && <SettingsScreen settings={settings} onChange={setSettings} onBack={() => setScreen('home')} />}
        </main>
    );
}
