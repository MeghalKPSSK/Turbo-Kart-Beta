// ========================================
// TURBO KART RACING - Cup/Track Select Components
// ========================================

import React, { useState, useEffect } from 'react';
import { TRACKS } from '../../game/data/tracks';
import { audioManager } from '../../game/systems/audio';
import './TrackSelect.css';

export function CupSelect({ onSelect, onBack }) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    
    const cups = TRACKS.getAllCups();
    
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Resume audio context on user interaction
            audioManager.resumeContext();
            
            switch (e.key) {
                case 'ArrowLeft':
                    setSelectedIndex(prev => (prev - 1 + cups.length) % cups.length);
                    audioManager.playSound('menu_select');
                    break;
                case 'ArrowRight':
                    setSelectedIndex(prev => (prev + 1) % cups.length);
                    audioManager.playSound('menu_select');
                    break;
                case 'Enter':
                case ' ':
                    audioManager.playSound('menu_confirm');
                    onSelect?.(cups[selectedIndex]);
                    break;
                case 'Escape':
                case 'Backspace':
                    audioManager.playSound('menu_back');
                    onBack?.();
                    break;
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, cups, onSelect, onBack]);
    
    const selectedCup = cups[selectedIndex];
    
    return (
        <div className="track-select">
            <div className="select-header">
                <button className="back-button" onClick={onBack}>← Back</button>
                <h1>Select Cup</h1>
                <div className="header-spacer"></div>
            </div>
            
            <div className="select-content">
                <div className="cup-carousel">
                    {cups.map((cup, index) => (
                        <button
                            key={cup.id}
                            className={`cup-card ${index === selectedIndex ? 'selected' : ''}`}
                            onClick={() => {
                                setSelectedIndex(index);
                                onSelect?.(cup);
                            }}
                        >
                            <div className="cup-icon">{cup.icon}</div>
                            <span className="cup-name">{cup.name}</span>
                        </button>
                    ))}
                </div>
                
                {selectedCup && (
                    <div className="cup-preview">
                        <h2 className="preview-title">
                            {selectedCup.icon} {selectedCup.name}
                        </h2>
                        <div className="track-list">
                            {selectedCup.tracks.map((trackId, index) => {
                                const track = TRACKS.getTrack(trackId);
                                return (
                                    <div key={trackId} className="track-item">
                                        <span className="track-number">{index + 1}</span>
                                        <span className="track-name">{track?.name || trackId}</span>
                                        <span className="track-theme">{track?.theme}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
            
            <div className="select-footer">
                <p>←→ Select cup • Enter to confirm • Escape to go back</p>
            </div>
        </div>
    );
}

export function TrackSelect({ onSelect, onBack }) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    
    const tracks = TRACKS.getAllTracks();
    
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Resume audio context on user interaction
            audioManager.resumeContext();
            
            const cols = 4;
            switch (e.key) {
                case 'ArrowLeft':
                    setSelectedIndex(prev => (prev - 1 + tracks.length) % tracks.length);
                    audioManager.playSound('menu_select');
                    break;
                case 'ArrowRight':
                    setSelectedIndex(prev => (prev + 1) % tracks.length);
                    audioManager.playSound('menu_select');
                    break;
                case 'ArrowUp':
                    setSelectedIndex(prev => (prev - cols + tracks.length) % tracks.length);
                    audioManager.playSound('menu_select');
                    break;
                case 'ArrowDown':
                    setSelectedIndex(prev => (prev + cols) % tracks.length);
                    audioManager.playSound('menu_select');
                    break;
                case 'Enter':
                case ' ':
                    audioManager.playSound('menu_confirm');
                    onSelect?.(tracks[selectedIndex]);
                    break;
                case 'Escape':
                case 'Backspace':
                    audioManager.playSound('menu_back');
                    onBack?.();
                    break;
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, tracks, onSelect, onBack]);
    
    const selectedTrack = tracks[selectedIndex];
    
    return (
        <div className="track-select">
            <div className="select-header">
                <button className="back-button" onClick={onBack}>← Back</button>
                <h1>Select Track</h1>
                <div className="header-spacer"></div>
            </div>
            
            <div className="select-content">
                <div className="track-grid-container">
                    <div className="track-grid">
                        {tracks.map((track, index) => (
                            <button
                                key={track.id}
                                className={`track-card ${index === selectedIndex ? 'selected' : ''}`}
                                onClick={() => {
                                    setSelectedIndex(index);
                                    onSelect?.(track);
                                }}
                            >
                                <div className="track-preview-icon" data-theme={track.theme}>
                                    🏁
                                </div>
                                <span className="track-card-name">{track.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
                
                {selectedTrack && (
                    <div className="track-preview-panel">
                        <h2 className="preview-title">{selectedTrack.name}</h2>
                        <div className="track-info">
                            <div className="info-row">
                                <span className="info-label">Theme:</span>
                                <span className="info-value">{selectedTrack.theme}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Length:</span>
                                <span className="info-value">{selectedTrack.length}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Difficulty:</span>
                                <span className="info-value">{selectedTrack.difficulty}</span>
                            </div>
                        </div>
                        {selectedTrack.features && (
                            <div className="track-features">
                                <h4>Features:</h4>
                                <ul>
                                    {selectedTrack.features.map((feature, i) => (
                                        <li key={i}>{feature}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            <div className="select-footer">
                <p>Arrow keys to navigate • Enter to confirm • Escape to go back</p>
            </div>
        </div>
    );
}

export function BattleModeSelect({ onSelect, onBack }) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    
    const battleModes = TRACKS.getAllBattleModes();
    
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Resume audio context on user interaction
            audioManager.resumeContext();
            
            switch (e.key) {
                case 'ArrowUp':
                    setSelectedIndex(prev => (prev - 1 + battleModes.length) % battleModes.length);
                    audioManager.playSound('menu_select');
                    break;
                case 'ArrowDown':
                    setSelectedIndex(prev => (prev + 1) % battleModes.length);
                    audioManager.playSound('menu_select');
                    break;
                case 'Enter':
                case ' ':
                    audioManager.playSound('menu_confirm');
                    onSelect?.(battleModes[selectedIndex]);
                    break;
                case 'Escape':
                case 'Backspace':
                    audioManager.playSound('menu_back');
                    onBack?.();
                    break;
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, battleModes, onSelect, onBack]);
    
    return (
        <div className="track-select battle-mode-select">
            <div className="select-header">
                <button className="back-button" onClick={onBack}>← Back</button>
                <h1>Select Battle Mode</h1>
                <div className="header-spacer"></div>
            </div>
            
            <div className="select-content">
                <div className="battle-mode-list">
                    {battleModes.map((mode, index) => (
                        <button
                            key={mode.id}
                            className={`battle-mode-card ${index === selectedIndex ? 'selected' : ''}`}
                            onClick={() => {
                                setSelectedIndex(index);
                                onSelect?.(mode);
                            }}
                        >
                            <span className="mode-icon">{mode.icon}</span>
                            <div className="mode-info">
                                <span className="mode-name">{mode.name}</span>
                                <span className="mode-description">{mode.description}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="select-footer">
                <p>↑↓ Select mode • Enter to confirm • Escape to go back</p>
            </div>
        </div>
    );
}

export function ArenaSelect({ battleMode, onSelect, onBack }) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    
    const arenas = TRACKS.getAllArenas();
    
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Resume audio context on user interaction
            audioManager.resumeContext();
            
            const cols = 4;
            switch (e.key) {
                case 'ArrowLeft':
                    setSelectedIndex(prev => (prev - 1 + arenas.length) % arenas.length);
                    audioManager.playSound('menu_select');
                    break;
                case 'ArrowRight':
                    setSelectedIndex(prev => (prev + 1) % arenas.length);
                    audioManager.playSound('menu_select');
                    break;
                case 'ArrowUp':
                    setSelectedIndex(prev => (prev - cols + arenas.length) % arenas.length);
                    audioManager.playSound('menu_select');
                    break;
                case 'ArrowDown':
                    setSelectedIndex(prev => (prev + cols) % arenas.length);
                    audioManager.playSound('menu_select');
                    break;
                case 'Enter':
                case ' ':
                    audioManager.playSound('menu_confirm');
                    onSelect?.(arenas[selectedIndex]);
                    break;
                case 'Escape':
                case 'Backspace':
                    audioManager.playSound('menu_back');
                    onBack?.();
                    break;
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, arenas, onSelect, onBack]);
    
    const selectedArena = arenas[selectedIndex];
    
    return (
        <div className="track-select arena-select">
            <div className="select-header">
                <button className="back-button" onClick={onBack}>← Back</button>
                <h1>Select Arena</h1>
                <span className="mode-badge">{battleMode?.name || 'Battle'}</span>
            </div>
            
            <div className="select-content">
                <div className="arena-grid">
                    {arenas.map((arena, index) => (
                        <button
                            key={arena.id}
                            className={`arena-card ${index === selectedIndex ? 'selected' : ''}`}
                            onClick={() => {
                                setSelectedIndex(index);
                                onSelect?.(arena);
                            }}
                        >
                            <div className="arena-icon">⚔️</div>
                            <span className="arena-name">{arena.name}</span>
                        </button>
                    ))}
                </div>
                
                {selectedArena && (
                    <div className="arena-preview">
                        <h2>{selectedArena.name}</h2>
                        <p className="arena-theme">Theme: {selectedArena.theme}</p>
                    </div>
                )}
            </div>
            
            <div className="select-footer">
                <p>Arrow keys to navigate • Enter to confirm • Escape to go back</p>
            </div>
        </div>
    );
}

export default { CupSelect, TrackSelect, BattleModeSelect, ArenaSelect };
