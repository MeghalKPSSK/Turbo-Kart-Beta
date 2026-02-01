// ========================================
// TURBO KART RACING - Character Select Component
// ========================================

import React, { useState, useEffect, useCallback } from 'react';
import { CHARACTERS, CHARACTER_COLORS } from '../../game/data/characters';
import { audioManager } from '../../game/systems/audio';
import './CharacterSelect.css';

export function CharacterSelect({ playerIndex = 1, onSelect, onBack }) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [hoveredCharacter, setHoveredCharacter] = useState(null);
    
    const characters = CHARACTERS.getAllCharacters();
    const weightClasses = ['FEATHER', 'LIGHT', 'MEDIUM', 'CRUISER', 'HEAVY'];
    
    const currentCharacter = hoveredCharacter || characters[selectedIndex];
    
    const handleKeyDown = useCallback((e) => {
        // Resume audio context on user interaction
        audioManager.resumeContext();
        
        const cols = 7;
        const total = characters.length;
        
        switch (e.key) {
            case 'ArrowLeft':
                setSelectedIndex(prev => (prev - 1 + total) % total);
                audioManager.playSound('menu_select');
                break;
            case 'ArrowRight':
                setSelectedIndex(prev => (prev + 1) % total);
                audioManager.playSound('menu_select');
                break;
            case 'ArrowUp':
                setSelectedIndex(prev => (prev - cols + total) % total);
                audioManager.playSound('menu_select');
                break;
            case 'ArrowDown':
                setSelectedIndex(prev => (prev + cols) % total);
                audioManager.playSound('menu_select');
                break;
            case 'Enter':
            case ' ':
                audioManager.playSound('menu_confirm');
                onSelect?.(characters[selectedIndex]);
                break;
            case 'Escape':
            case 'Backspace':
                audioManager.playSound('menu_back');
                onBack?.();
                break;
        }
    }, [characters, selectedIndex, onSelect, onBack]);
    
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
    
    const handleCharacterClick = useCallback((character, globalIdx) => {
        setSelectedIndex(globalIdx);
        audioManager.playSound('menu_confirm');
        onSelect?.(character);
    }, [onSelect]);
    
    const handleCharacterHover = useCallback((character, globalIdx) => {
        setHoveredCharacter(character);
        setSelectedIndex(globalIdx);
        audioManager.playSound('menu_select');
    }, []);
    
    const getStatBar = (value) => {
        const maxValue = 10;
        return (
            <div className="stat-bar-container">
                <div 
                    className="stat-bar-fill" 
                    style={{ width: `${(value / maxValue) * 100}%` }}
                />
            </div>
        );
    };
    
    return (
        <div className="character-select">
            <div className="select-header">
                <button className="back-button" onClick={() => { audioManager.playSound('menu_back'); onBack?.(); }}>← Back</button>
                <h1>Select Character</h1>
                <span className="player-indicator">Player {playerIndex}</span>
            </div>
            
            <div className="select-content">
                <div className="character-grid">
                    {weightClasses.map(weightClass => (
                        <div key={weightClass} className="weight-class-section">
                            <h3 className="weight-class-label">{weightClass}</h3>
                            <div className="character-row">
                                {characters
                                    .filter(c => c.weightClass === weightClass)
                                    .map((character) => {
                                        const globalIdx = characters.indexOf(character);
                                        const colors = CHARACTER_COLORS[character.id] || CHARACTER_COLORS.default;
                                        
                                        return (
                                            <button
                                                key={character.id}
                                                className={`character-card ${globalIdx === selectedIndex ? 'selected' : ''}`}
                                                onClick={() => handleCharacterClick(character, globalIdx)}
                                                onMouseEnter={() => handleCharacterHover(character, globalIdx)}
                                                onMouseLeave={() => setHoveredCharacter(null)}
                                                style={{
                                                    '--primary-color': colors.primary,
                                                    '--secondary-color': colors.secondary
                                                }}
                                            >
                                                <div className="character-avatar">
                                                    {character.emoji || character.icon || character.name.charAt(0)}
                                                </div>
                                                <span className="character-name">{character.name}</span>
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>
                    ))}
                </div>
                
                <div className="character-preview">
                    {currentCharacter && (
                        <>
                            <div 
                                className="preview-avatar"
                                style={{
                                    background: `linear-gradient(135deg, ${CHARACTER_COLORS[currentCharacter.id]?.primary || '#666'}, ${CHARACTER_COLORS[currentCharacter.id]?.secondary || '#444'})`
                                }}
                            >
                                {currentCharacter.emoji || currentCharacter.icon || currentCharacter.name.charAt(0)}
                            </div>
                            <h2 className="preview-name">{currentCharacter.name}</h2>
                            <p className="preview-series">{currentCharacter.series}</p>
                            
                            <div className="stats-container">
                                <div className="stat-row">
                                    <span className="stat-label">Speed</span>
                                    {getStatBar(currentCharacter.stats?.speed || 0)}
                                </div>
                                <div className="stat-row">
                                    <span className="stat-label">Acceleration</span>
                                    {getStatBar(currentCharacter.stats?.acceleration || 0)}
                                </div>
                                <div className="stat-row">
                                    <span className="stat-label">Weight</span>
                                    {getStatBar(currentCharacter.stats?.weight || 0)}
                                </div>
                                <div className="stat-row">
                                    <span className="stat-label">Handling</span>
                                    {getStatBar(currentCharacter.stats?.handling || 0)}
                                </div>
                                <div className="stat-row">
                                    <span className="stat-label">Traction</span>
                                    {getStatBar(currentCharacter.stats?.traction || 0)}
                                </div>
                                <div className="stat-row">
                                    <span className="stat-label">Mini-Turbo</span>
                                    {getStatBar(currentCharacter.stats?.miniturbo || 3)}
                                </div>
                            </div>
                            
                            <div className="weight-badge" data-weight={currentCharacter.weightClass}>
                                {currentCharacter.weightClass.toUpperCase()}
                            </div>
                        </>
                    )}
                </div>
            </div>
            
            <div className="select-footer">
                <p>Use Arrow Keys to navigate • Enter to confirm • Escape to go back</p>
            </div>
        </div>
    );
}

export default CharacterSelect;
