// ========================================
// TURBO KART RACING - Settings Component
// ========================================

import React, { useState } from 'react';
import { audioManager } from '../../game/systems/audio';
import './Settings.css';

// UI Components defined outside to avoid recreation on each render
const Slider = ({ label, value, onChange, min = 0, max = 100 }) => (
    <div className="setting-slider">
        <label>{label}</label>
        <div className="slider-container">
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value))}
            />
            <span className="slider-value">{value}</span>
        </div>
    </div>
);

const Select = ({ label, value, options, onChange }) => (
    <div className="setting-select">
        <label>{label}</label>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
            {options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    </div>
);

const Toggle = ({ label, value, onChange }) => (
    <div className="setting-toggle">
        <label>{label}</label>
        <button 
            className={`toggle-button ${value ? 'active' : ''}`}
            onClick={() => onChange(!value)}
        >
            {value ? 'ON' : 'OFF'}
        </button>
    </div>
);

const tabs = [
    { id: 'audio', label: 'Audio', icon: '🔊' },
    { id: 'gameplay', label: 'Gameplay', icon: '🎮' },
    { id: 'display', label: 'Display', icon: '🖥️' },
    { id: 'controls', label: 'Controls', icon: '⌨️' }
];

export function Settings({ onBack, settings: initialSettings, onSave }) {
    const [settings, setSettings] = useState(initialSettings || {
        masterVolume: 80,
        musicVolume: 70,
        sfxVolume: 80,
        engineClass: '150cc',
        cpuDifficulty: 'normal',
        cameraMode: 'chase',
        showMinimap: true,
        showSpeedometer: true,
        vibration: true,
        autoAccelerate: false
    });
    
    const [activeTab, setActiveTab] = useState('audio');
    
    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        
        // Apply audio settings immediately
        if (key === 'masterVolume') {
            audioManager.setMasterVolume(value / 100);
        } else if (key === 'musicVolume') {
            audioManager.setMusicVolume(value / 100);
        } else if (key === 'sfxVolume') {
            audioManager.setSFXVolume(value / 100);
        }
    };
    
    const handleSave = () => {
        onSave?.(settings);
        onBack?.();
    };
    
    return (
        <div className="settings-screen">
            <div className="settings-header">
                <button className="back-button" onClick={onBack}>← Back</button>
                <h1>Settings</h1>
                <button className="save-button" onClick={handleSave}>Save</button>
            </div>
            
            <div className="settings-content">
                <div className="settings-tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <span className="tab-icon">{tab.icon}</span>
                            <span className="tab-label">{tab.label}</span>
                        </button>
                    ))}
                </div>
                
                <div className="settings-panel">
                    {activeTab === 'audio' && (
                        <div className="settings-group">
                            <h2>Audio Settings</h2>
                            <Slider 
                                label="Master Volume" 
                                value={settings.masterVolume}
                                onChange={(v) => updateSetting('masterVolume', v)}
                            />
                            <Slider 
                                label="Music Volume" 
                                value={settings.musicVolume}
                                onChange={(v) => updateSetting('musicVolume', v)}
                            />
                            <Slider 
                                label="SFX Volume" 
                                value={settings.sfxVolume}
                                onChange={(v) => updateSetting('sfxVolume', v)}
                            />
                            <button 
                                className="test-sound-button"
                                onClick={() => audioManager.playSound('coin_collect')}
                            >
                                🔊 Test Sound
                            </button>
                        </div>
                    )}
                    
                    {activeTab === 'gameplay' && (
                        <div className="settings-group">
                            <h2>Gameplay Settings</h2>
                            <Select
                                label="Engine Class"
                                value={settings.engineClass}
                                options={[
                                    { value: '50cc', label: '50cc - Easy' },
                                    { value: '100cc', label: '100cc - Normal' },
                                    { value: '150cc', label: '150cc - Hard' },
                                    { value: '200cc', label: '200cc - Expert' },
                                    { value: 'mirror', label: 'Mirror' }
                                ]}
                                onChange={(v) => updateSetting('engineClass', v)}
                            />
                            <Select
                                label="CPU Difficulty"
                                value={settings.cpuDifficulty}
                                options={[
                                    { value: 'easy', label: 'Easy' },
                                    { value: 'normal', label: 'Normal' },
                                    { value: 'hard', label: 'Hard' }
                                ]}
                                onChange={(v) => updateSetting('cpuDifficulty', v)}
                            />
                            <Toggle
                                label="Auto-Accelerate"
                                value={settings.autoAccelerate}
                                onChange={(v) => updateSetting('autoAccelerate', v)}
                            />
                            <Toggle
                                label="Vibration"
                                value={settings.vibration}
                                onChange={(v) => updateSetting('vibration', v)}
                            />
                        </div>
                    )}
                    
                    {activeTab === 'display' && (
                        <div className="settings-group">
                            <h2>Display Settings</h2>
                            <Select
                                label="Camera Mode"
                                value={settings.cameraMode}
                                options={[
                                    { value: 'chase', label: 'Chase Camera' },
                                    { value: 'close', label: 'Close Camera' },
                                    { value: 'far', label: 'Far Camera' }
                                ]}
                                onChange={(v) => updateSetting('cameraMode', v)}
                            />
                            <Toggle
                                label="Show Minimap"
                                value={settings.showMinimap}
                                onChange={(v) => updateSetting('showMinimap', v)}
                            />
                            <Toggle
                                label="Show Speedometer"
                                value={settings.showSpeedometer}
                                onChange={(v) => updateSetting('showSpeedometer', v)}
                            />
                        </div>
                    )}
                    
                    {activeTab === 'controls' && (
                        <div className="settings-group">
                            <h2>Keyboard Controls</h2>
                            <div className="controls-display">
                                <div className="control-row">
                                    <span className="control-action">Accelerate</span>
                                    <span className="control-keys">W / ↑</span>
                                </div>
                                <div className="control-row">
                                    <span className="control-action">Brake / Reverse</span>
                                    <span className="control-keys">S / ↓ / Space</span>
                                </div>
                                <div className="control-row">
                                    <span className="control-action">Steer Left</span>
                                    <span className="control-keys">A / ←</span>
                                </div>
                                <div className="control-row">
                                    <span className="control-action">Steer Right</span>
                                    <span className="control-keys">D / →</span>
                                </div>
                                <div className="control-row">
                                    <span className="control-action">Drift / Hop</span>
                                    <span className="control-keys">Space</span>
                                </div>
                                <div className="control-row">
                                    <span className="control-action">Nitro Boost</span>
                                    <span className="control-keys">Shift</span>
                                </div>
                                <div className="control-row">
                                    <span className="control-action">Look Back</span>
                                    <span className="control-keys">Q / X</span>
                                </div>
                                <div className="control-row">
                                    <span className="control-action">Pause</span>
                                    <span className="control-keys">Escape</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Settings;
