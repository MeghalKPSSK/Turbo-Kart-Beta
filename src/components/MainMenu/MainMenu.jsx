// ========================================
// TURBO KART RACING - Main Menu Component
// ========================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { audioManager } from '../../game/systems/audio';
import './MainMenu.css';

const menuItems = [
    { id: 'grandprix', label: 'Grand Prix', icon: '🏆' },
    { id: 'timetrials', label: 'Time Trials', icon: '⏱️' },
    { id: 'vsrace', label: 'VS Race', icon: '🏁' },
    { id: 'battle', label: 'Battle', icon: '💥' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
    { id: 'help', label: 'Help', icon: '❓' },
    { id: 'jukebox', label: 'Jukebox', icon: '🎵' }
];

export function MainMenu({ onNavigate }) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const audioInitialized = useRef(false);
    
    // Initialize audio on first user interaction
    const initAudioOnInteraction = useCallback(async () => {
        if (!audioInitialized.current) {
            audioInitialized.current = true;
            await audioManager.init();
            audioManager.resumeContext(); // Ensure context is resumed
            audioManager.playMusic('menu');
        } else {
            audioManager.resumeContext(); // Always try to resume on interaction
        }
    }, []);
    
    const handleKeyDown = useCallback((e) => {
        initAudioOnInteraction();
        
        if (e.key === 'ArrowUp') {
            setSelectedIndex(prev => (prev - 1 + menuItems.length) % menuItems.length);
            audioManager.playSound('menu_select');
        } else if (e.key === 'ArrowDown') {
            setSelectedIndex(prev => (prev + 1) % menuItems.length);
            audioManager.playSound('menu_select');
        } else if (e.key === 'Enter' || e.key === ' ') {
            audioManager.playSound('menu_confirm');
            onNavigate?.(menuItems[selectedIndex].id);
        }
    }, [onNavigate, selectedIndex, initAudioOnInteraction]);
    
    const handleMenuClick = useCallback((itemId) => {
        initAudioOnInteraction();
        audioManager.playSound('menu_confirm');
        onNavigate?.(itemId);
    }, [onNavigate, initAudioOnInteraction]);
    
    const handleMouseEnter = useCallback((index) => {
        initAudioOnInteraction();
        setSelectedIndex(index);
        audioManager.playSound('menu_select');
    }, [initAudioOnInteraction]);
    
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
    
    return (
        <div className="main-menu">
            <div className="menu-background">
                <div className="racing-stripe stripe-1"></div>
                <div className="racing-stripe stripe-2"></div>
                <div className="racing-stripe stripe-3"></div>
            </div>
            
            <div className="menu-content">
                <h1 className="game-title">TURBO KART RACING</h1>
                <div className="menu-subtitle">⚡ Beta Edition ⚡</div>
                
                <div className="menu-items">
                    {menuItems.map((item, index) => (
                        <button
                            key={item.id}
                            className={`menu-item ${index === selectedIndex ? 'selected' : ''}`}
                            onClick={() => handleMenuClick(item.id)}
                            onMouseEnter={() => handleMouseEnter(index)}
                        >
                            <span className="menu-icon">{item.icon}</span>
                            <span className="menu-label">{item.label}</span>
                            {index === selectedIndex && (
                                <span className="menu-arrow">▶</span>
                            )}
                        </button>
                    ))}
                </div>
                
                <div className="menu-footer">
                    <p>Use ↑↓ to navigate • Enter to select</p>
                    <p className="version">v0.1.0 Beta</p>
                </div>
            </div>
        </div>
    );
}

export default MainMenu;
