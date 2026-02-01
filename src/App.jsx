// ========================================
// TURBO KART RACING - Main App Component
// ========================================

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useGameEngine } from './hooks/useGameEngine';
import { audioManager } from './game/systems/audio';
import {
    LoadingScreen,
    MainMenu,
    CharacterSelect,
    VehicleSelect,
    CupSelect,
    TrackSelect,
    BattleModeSelect,
    ArenaSelect,
    GameHUD,
    CountdownOverlay,
    RaceResults,
    Settings,
    PauseMenu,
    Jukebox
} from './components';
import './App.css';

function App() {
    // Game engine hook
    const {
        gameState,
        raceData,
        hudData,
        minimapData,
        raceComplete,
        finalResults,
        initGame,
        startRace,
        startRacing,
        resumeGame,
        quitToMenu
    } = useGameEngine();
    
    // UI state
    const [screen, setScreen] = useState('loading');
    const [gameMode, setGameMode] = useState(null);
    const [selectedCharacter, setSelectedCharacter] = useState(null);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [selectedCup, setSelectedCup] = useState(null);
    const [selectedTrack, setSelectedTrack] = useState(null);
    const [selectedBattleMode, setSelectedBattleMode] = useState(null);
    const [countdown, setCountdown] = useState(3);
    const [settings, setSettings] = useState({
        masterVolume: 80,
        musicVolume: 70,
        sfxVolume: 80,
        engineClass: '150cc',
        cpuDifficulty: 'normal',
        cameraMode: 'chase',
        showMinimap: true,
        showSpeedometer: true
    });
    
    // Canvas container ref
    const gameContainerRef = useRef(null);
    
    // Play music based on current screen
    useEffect(() => {
        if (screen === 'menu' || screen === 'settings' || screen === 'help' || screen === 'jukebox') {
            audioManager.playMusicForState('menu');
        } else if (screen === 'character') {
            audioManager.playMusicForState('character_select');
        } else if (screen === 'vehicle') {
            audioManager.playMusicForState('vehicle_select');
        } else if (screen === 'cup' || screen === 'track' || screen === 'arena') {
            audioManager.playMusicForState('track_select');
        } else if (screen === 'battleMode') {
            audioManager.playMusicForState('character_select');
        }
        // Note: game screen music is handled by useGameEngine
    }, [screen]);
    
    // Note: initGame is called in launchRace/launchBattle functions after container is ready
    
    // Handle loading complete - initialize audio
    const handleLoadComplete = useCallback(async () => {
        // Initialize audio system
        await audioManager.init();
        setScreen('menu');
    }, []);
    
    // Resume audio on any click (browser autoplay policy)
    useEffect(() => {
        const handleClick = () => {
            audioManager.resumeContext();
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);
    
    // Handle menu navigation
    const handleMenuSelect = useCallback((menuId) => {
        switch (menuId) {
            case 'grandprix':
            case 'timetrials':
            case 'vsrace':
                setGameMode(menuId);
                setScreen('character');
                break;
            case 'battle':
                setGameMode('battle');
                setScreen('battleMode');
                break;
            case 'settings':
                setScreen('settings');
                break;
            case 'help':
                setScreen('help');
                break;
            case 'jukebox':
                setScreen('jukebox');
                break;
            default:
                break;
        }
    }, []);
    
    // Handle character selection
    const handleCharacterSelect = useCallback((character) => {
        setSelectedCharacter(character);
        setScreen('vehicle');
    }, []);
    
    // Handle vehicle selection
    const handleVehicleSelect = useCallback((vehicle) => {
        setSelectedVehicle(vehicle);
        
        if (gameMode === 'grandprix') {
            setScreen('cup');
        } else if (gameMode === 'battle') {
            setScreen('arena');
        } else {
            setScreen('track');
        }
    }, [gameMode]);
    
    // Launch race - defined before handlers that use it
    const launchRace = useCallback((options) => {
        // Capture current values to avoid stale closures in setTimeout
        const currentCharacter = selectedCharacter;
        const currentVehicle = selectedVehicle;
        const currentMode = gameMode;
        const currentSettings = settings;
        
        console.log('launchRace called with selectedCharacter:', currentCharacter);
        setScreen('game');
        setCountdown(3);
        
        // Initialize game container first
        setTimeout(() => {
            if (gameContainerRef.current) {
                initGame(gameContainerRef.current);
                
                // Start race after game initializes
                setTimeout(() => {
                    console.log('startRace - passing character:', currentCharacter?.name, currentCharacter);
                    startRace({
                        mode: currentMode,
                        character: currentCharacter,
                        vehicle: currentVehicle,
                        cup: options.cup,
                        track: options.track,
                        engineClass: currentSettings.engineClass,
                        lapCount: 3
                    });
                    
                    // Start countdown
                    runCountdown();
                }, 500);
            }
        }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameMode, selectedCharacter, selectedVehicle, settings, initGame, startRace]);
    
    // Launch battle - defined before handlers that use it
    const launchBattle = useCallback((options) => {
        const currentCharacter = selectedCharacter;
        const currentVehicle = selectedVehicle;
        const currentBattleMode = selectedBattleMode;
        
        setScreen('game');
        setCountdown(3);
        
        setTimeout(() => {
            if (gameContainerRef.current) {
                initGame(gameContainerRef.current);
                
                setTimeout(() => {
                    startRace({
                        mode: 'battle',
                        character: currentCharacter,
                        vehicle: currentVehicle,
                        battleMode: currentBattleMode,
                        arena: options.arena
                    });
                    
                    runCountdown();
                }, 500);
            }
        }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCharacter, selectedVehicle, selectedBattleMode, initGame, startRace]);
    
    // Handle cup selection
    const handleCupSelect = useCallback((cup) => {
        setSelectedCup(cup);
        launchRace({ cup });
    }, [launchRace]);
    
    // Handle track selection
    const handleTrackSelect = useCallback((track) => {
        setSelectedTrack(track);
        launchRace({ track });
    }, [launchRace]);
    
    // Handle battle mode selection
    const handleBattleModeSelect = useCallback((mode) => {
        setSelectedBattleMode(mode);
        setScreen('character');
    }, []);
    
    // Handle arena selection
    const handleArenaSelect = useCallback((arena) => {
        launchBattle({ arena });
    }, [launchBattle]);
    
    // Countdown logic
    const runCountdown = useCallback(() => {
        let count = 3;
        const interval = setInterval(() => {
            count--;
            setCountdown(count);
            
            if (count === 0) {
                clearInterval(interval);
                setTimeout(() => {
                    setCountdown(-1);
                    startRacing();
                }, 1000);
            }
        }, 1000);
    }, [startRacing]);
    
    // Handle back navigation
    const handleBack = useCallback(() => {
        switch (screen) {
            case 'character':
                if (gameMode === 'battle' && selectedBattleMode) {
                    setScreen('battleMode');
                } else {
                    setScreen('menu');
                    setGameMode(null);
                }
                break;
            case 'vehicle':
                setScreen('character');
                setSelectedCharacter(null);
                break;
            case 'cup':
            case 'track':
                setScreen('vehicle');
                setSelectedVehicle(null);
                break;
            case 'battleMode':
                setScreen('menu');
                setGameMode(null);
                break;
            case 'arena':
                setScreen('vehicle');
                setSelectedVehicle(null);
                break;
            case 'settings':
            case 'help':
            case 'jukebox':
                setScreen('menu');
                break;
            default:
                setScreen('menu');
        }
    }, [screen, gameMode, selectedBattleMode]);
    
    // Handle quit to menu
    const handleQuit = useCallback(() => {
        quitToMenu();
        setScreen('menu');
        setGameMode(null);
        setSelectedCharacter(null);
        setSelectedVehicle(null);
        setSelectedCup(null);
        setSelectedTrack(null);
        setSelectedBattleMode(null);
        setCountdown(3);
    }, [quitToMenu]);
    
    // Render current screen
    const renderScreen = () => {
        switch (screen) {
            case 'loading':
                return <LoadingScreen onLoadComplete={handleLoadComplete} />;
                
            case 'menu':
                return <MainMenu onNavigate={handleMenuSelect} />;
                
            case 'character':
                return (
                    <CharacterSelect
                        onSelect={handleCharacterSelect}
                        onBack={handleBack}
                    />
                );
                
            case 'vehicle':
                return (
                    <VehicleSelect
                        character={selectedCharacter}
                        onSelect={handleVehicleSelect}
                        onBack={handleBack}
                    />
                );
                
            case 'cup':
                return (
                    <CupSelect
                        onSelect={handleCupSelect}
                        onBack={handleBack}
                    />
                );
                
            case 'track':
                return (
                    <TrackSelect
                        onSelect={handleTrackSelect}
                        onBack={handleBack}
                    />
                );
                
            case 'battleMode':
                return (
                    <BattleModeSelect
                        onSelect={handleBattleModeSelect}
                        onBack={handleBack}
                    />
                );
                
            case 'arena':
                return (
                    <ArenaSelect
                        battleMode={selectedBattleMode}
                        onSelect={handleArenaSelect}
                        onBack={handleBack}
                    />
                );
                
            case 'settings':
                return (
                    <Settings
                        settings={settings}
                        onSave={setSettings}
                        onBack={handleBack}
                    />
                );
                
            case 'help':
                return (
                    <div className="help-screen">
                        <div className="help-header">
                            <button className="back-button" onClick={handleBack}>← Back</button>
                            <h1>How to Play</h1>
                        </div>
                        <div className="help-content">
                            <section>
                                <h2>🎮 Controls</h2>
                                <p><strong>W/↑</strong> - Accelerate</p>
                                <p><strong>S/↓</strong> - Brake/Reverse</p>
                                <p><strong>A/← D/→</strong> - Steer</p>
                                <p><strong>Space</strong> - Drift / Handbrake</p>
                                <p><strong>Shift</strong> - Nitro Boost</p>
                            </section>
                            <section>
                                <h2>🏎️ Drifting</h2>
                                <p>Hold the drift button while turning to drift. The longer you drift, the bigger the boost!</p>
                                <p>🔵 Blue sparks → 🟠 Orange sparks → 🟣 Purple sparks</p>
                            </section>
                            <section>
                                <h2>⚡ Nitro</h2>
                                <p>Hold Shift to use nitro. It recharges over time during the race.</p>
                            </section>
                        </div>
                    </div>
                );
                
            case 'jukebox':
                return <Jukebox onBack={handleBack} />;
                
            case 'game':
                return (
                    <>
                        <div ref={gameContainerRef} className="game-container" />
                        
                        {gameState === 'racing' && (
                            <GameHUD
                                raceData={raceData}
                                hudData={hudData}
                                minimapData={minimapData}
                                showMinimap={settings.showMinimap}
                            />
                        )}
                        
                        {countdown >= 0 && (
                            <CountdownOverlay count={countdown} />
                        )}
                        
                        {gameState === 'paused' && (
                            <PauseMenu
                                onResume={resumeGame}
                                onRestart={() => launchRace({ cup: selectedCup, track: selectedTrack })}
                                onQuit={handleQuit}
                            />
                        )}
                        
                        {raceComplete && (
                            <RaceResults
                                results={finalResults}
                                onContinue={handleQuit}
                            />
                        )}
                    </>
                );
                
            default:
                return <LoadingScreen onLoadComplete={handleLoadComplete} />;
        }
    };
    
    return (
        <div className="app">
            {renderScreen()}
        </div>
    );
}

export default App;
