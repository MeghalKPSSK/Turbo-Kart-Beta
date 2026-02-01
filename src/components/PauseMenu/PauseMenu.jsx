// ========================================
// TURBO KART RACING - Pause Menu Component
// ========================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { audioManager } from '../../game/systems/audio';
import './PauseMenu.css';

export function PauseMenu({ onResume, onRestart, onQuit }) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [showSettings, setShowSettings] = useState(false);
    const [masterVolume, setMasterVolume] = useState(Math.round(audioManager.settings.masterVolume * 100));
    const [musicVolume, setMusicVolume] = useState(Math.round(audioManager.settings.musicVolume * 100));
    const [sfxVolume, setSfxVolume] = useState(Math.round(audioManager.settings.sfxVolume * 100));
    
    const handleSettingsToggle = useCallback(() => {
        setShowSettings(prev => !prev);
    }, []);
    
    const menuItems = useMemo(() => [
        { id: 'resume', label: 'Resume', icon: '▶️', action: onResume },
        { id: 'restart', label: 'Restart Race', icon: '🔄', action: onRestart },
        { id: 'settings', label: 'Settings', icon: '⚙️', action: handleSettingsToggle },
        { id: 'quit', label: 'Quit to Menu', icon: '🚪', action: onQuit }
    ], [onResume, onRestart, handleSettingsToggle, onQuit]);
    
    const handleMasterVolumeChange = (e) => {
        const value = parseInt(e.target.value);
        setMasterVolume(value);
        audioManager.setMasterVolume(value / 100);
    };
    
    const handleMusicVolumeChange = (e) => {
        const value = parseInt(e.target.value);
        setMusicVolume(value);
        audioManager.setMusicVolume(value / 100);
    };
    
    const handleSfxVolumeChange = (e) => {
        const value = parseInt(e.target.value);
        setSfxVolume(value);
        audioManager.setSfxVolume(value / 100);
        // Play a test sound when adjusting SFX volume
        audioManager.playSound('menu_select');
    };
    
    const handleKeyDown = useCallback((e) => {
        if (showSettings) {
            if (e.key === 'Escape' || e.key === 'Backspace') {
                setShowSettings(false);
            }
            return;
        }
        
        switch (e.key) {
            case 'ArrowUp':
                setSelectedIndex(prev => (prev - 1 + menuItems.length) % menuItems.length);
                break;
            case 'ArrowDown':
                setSelectedIndex(prev => (prev + 1) % menuItems.length);
                break;
            case 'Enter':
            case ' ':
                menuItems[selectedIndex].action?.();
                break;
            case 'Escape':
                onResume?.();
                break;
        }
    }, [menuItems, selectedIndex, onResume, showSettings]);
    
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
    
    return (
        <div className="pause-overlay">
            <div className="pause-menu">
                <h1 className="pause-title">PAUSED</h1>
                
                {!showSettings ? (
                    <>
                        <div className="pause-items">
                            {menuItems.map((item, index) => (
                                <button
                                    key={item.id}
                                    className={`pause-item ${index === selectedIndex ? 'selected' : ''}`}
                                    onClick={item.action}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    <span className="pause-icon">{item.icon}</span>
                                    <span className="pause-label">{item.label}</span>
                                </button>
                            ))}
                        </div>
                        
                        <div className="pause-footer">
                            <p>↑↓ Navigate • Enter to select • Escape to resume</p>
                        </div>
                    </>
                ) : (
                    <div className="pause-settings">
                        <h2 className="settings-title">⚙️ Audio Settings</h2>
                        
                        <div className="volume-control">
                            <label className="volume-label">
                                <span>🔊 Master Volume</span>
                                <span className="volume-value">{masterVolume}%</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={masterVolume}
                                onChange={handleMasterVolumeChange}
                                className="volume-slider"
                            />
                        </div>
                        
                        <div className="volume-control">
                            <label className="volume-label">
                                <span>🎵 Music Volume</span>
                                <span className="volume-value">{musicVolume}%</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={musicVolume}
                                onChange={handleMusicVolumeChange}
                                className="volume-slider"
                            />
                        </div>
                        
                        <div className="volume-control">
                            <label className="volume-label">
                                <span>🔔 SFX Volume</span>
                                <span className="volume-value">{sfxVolume}%</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={sfxVolume}
                                onChange={handleSfxVolumeChange}
                                className="volume-slider"
                            />
                        </div>
                        
                        <button 
                            className="settings-back-button"
                            onClick={() => setShowSettings(false)}
                        >
                            ← Back
                        </button>
                        
                        <div className="pause-footer">
                            <p>Escape to go back</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default PauseMenu;
