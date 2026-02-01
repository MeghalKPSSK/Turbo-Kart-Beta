// ========================================
// TURBO KART RACING - Vehicle Select Component
// ========================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { VEHICLES } from '../../game/data/vehicles';
import { audioManager } from '../../game/systems/audio';
import './VehicleSelect.css';

// StatBar component defined outside to avoid recreation on each render
const StatBar = ({ value, label }) => (
    <div className="vehicle-stat">
        <span className="stat-label">{label}</span>
        <div className="stat-bar-bg">
            <div className="stat-bar-fill" style={{ width: `${(value / 10) * 100}%` }} />
        </div>
    </div>
);

const tabs = [
    { id: 'body', label: 'Body', icon: '🏎️' },
    { id: 'wheels', label: 'Wheels', icon: '🛞' },
    { id: 'glider', label: 'Glider', icon: '🪂' }
];

export function VehicleSelect({ character, onSelect, onBack }) {
    const [activeTab, setActiveTab] = useState('body');
    const [selectedBody, setSelectedBody] = useState(0);
    const [selectedWheels, setSelectedWheels] = useState(0);
    const [selectedGlider, setSelectedGlider] = useState(0);
    
    const bodies = useMemo(() => VEHICLES.getAllBodies(), []);
    const wheels = useMemo(() => VEHICLES.getAllWheels(), []);
    const gliders = useMemo(() => VEHICLES.getAllGliders(), []);
    
    const getCurrentItems = useCallback(() => {
        switch (activeTab) {
            case 'body': return bodies;
            case 'wheels': return wheels;
            case 'glider': return gliders;
            default: return [];
        }
    }, [activeTab, bodies, wheels, gliders]);
    
    const getCurrentIndex = useCallback(() => {
        switch (activeTab) {
            case 'body': return selectedBody;
            case 'wheels': return selectedWheels;
            case 'glider': return selectedGlider;
            default: return 0;
        }
    }, [activeTab, selectedBody, selectedWheels, selectedGlider]);
    
    const setCurrentIndex = useCallback((index) => {
        switch (activeTab) {
            case 'body': setSelectedBody(index); break;
            case 'wheels': setSelectedWheels(index); break;
            case 'glider': setSelectedGlider(index); break;
        }
    }, [activeTab]);
    
    const handleConfirm = useCallback(() => {
        onSelect?.({
            body: bodies[selectedBody],
            wheels: wheels[selectedWheels],
            glider: gliders[selectedGlider]
        });
    }, [onSelect, bodies, selectedBody, wheels, selectedWheels, gliders, selectedGlider]);
    
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Resume audio context on user interaction
            audioManager.resumeContext();
            
            const items = getCurrentItems();
            const currentIndex = getCurrentIndex();
            
            switch (e.key) {
                case 'ArrowLeft':
                    setCurrentIndex((currentIndex - 1 + items.length) % items.length);
                    audioManager.playSound('menu_select');
                    break;
                case 'ArrowRight':
                    setCurrentIndex((currentIndex + 1) % items.length);
                    audioManager.playSound('menu_select');
                    break;
                case 'ArrowUp':
                    {
                        const tabIndex = tabs.findIndex(t => t.id === activeTab);
                        setActiveTab(tabs[(tabIndex - 1 + tabs.length) % tabs.length].id);
                        audioManager.playSound('menu_select');
                    }
                    break;
                case 'ArrowDown':
                    {
                        const tabIndex = tabs.findIndex(t => t.id === activeTab);
                        setActiveTab(tabs[(tabIndex + 1) % tabs.length].id);
                        audioManager.playSound('menu_select');
                    }
                    break;
                case 'Enter':
                case ' ':
                    audioManager.playSound('menu_confirm');
                    handleConfirm();
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
    }, [activeTab, getCurrentItems, getCurrentIndex, setCurrentIndex, handleConfirm, onBack]);
    
    const calculateTotalStats = () => {
        const body = bodies[selectedBody];
        const wheel = wheels[selectedWheels];
        const glider = gliders[selectedGlider];
        
        // Access stats from the nested stats object
        const bodyStats = body?.stats || {};
        const wheelStats = wheel?.stats || {};
        const gliderStats = glider?.stats || {};
        
        return {
            speed: Math.min(10, Math.max(0, (bodyStats.speed || 0) + (wheelStats.speed || 0) + (gliderStats.speed || 0))),
            acceleration: Math.min(10, Math.max(0, (bodyStats.acceleration || 0) + (wheelStats.acceleration || 0) + (gliderStats.acceleration || 0))),
            weight: Math.min(10, Math.max(0, (bodyStats.weight || 0) + (wheelStats.weight || 0) + (gliderStats.weight || 0))),
            handling: Math.min(10, Math.max(0, (bodyStats.handling || 0) + (wheelStats.handling || 0) + (gliderStats.handling || 0))),
            traction: Math.min(10, Math.max(0, (bodyStats.traction || 0) + (wheelStats.traction || 0) + (gliderStats.traction || 0))),
            miniturbo: Math.min(10, Math.max(0, (bodyStats.miniturbo || 3) + (wheelStats.miniturbo || 0) + (gliderStats.miniturbo || 0)))
        };
    };
    
    const totalStats = calculateTotalStats();
    
    return (
        <div className="vehicle-select">
            <div className="select-header">
                <button className="back-button" onClick={onBack}>← Back</button>
                <h1>Customize Vehicle</h1>
                <div className="character-badge">
                    {character?.name || 'Driver'}
                </div>
            </div>
            
            <div className="select-content">
                <div className="vehicle-tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`vehicle-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <span className="tab-icon">{tab.icon}</span>
                            <span className="tab-label">{tab.label}</span>
                        </button>
                    ))}
                </div>
                
                <div className="vehicle-selection">
                    <div className="part-grid">
                        {getCurrentItems().map((item, index) => (
                            <button
                                key={item.id}
                                className={`part-card ${getCurrentIndex() === index ? 'selected' : ''}`}
                                onClick={() => setCurrentIndex(index)}
                            >
                                <div className="part-icon">
                                    {activeTab === 'body' ? '🏎️' : activeTab === 'wheels' ? '🛞' : '🪂'}
                                </div>
                                <span className="part-name">{item.name}</span>
                                {item.type && <span className="part-type">{item.type}</span>}
                            </button>
                        ))}
                    </div>
                </div>
                
                <div className="vehicle-preview">
                    <div className="preview-vehicle">
                        <div className="vehicle-display">
                            <div className="vehicle-body">🏎️</div>
                            <div className="vehicle-details">
                                <p><strong>Body:</strong> {bodies[selectedBody]?.name}</p>
                                <p><strong>Wheels:</strong> {wheels[selectedWheels]?.name}</p>
                                <p><strong>Glider:</strong> {gliders[selectedGlider]?.name}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="total-stats">
                        <h3>Combined Stats</h3>
                        <StatBar value={totalStats.speed} label="Speed" />
                        <StatBar value={totalStats.acceleration} label="Accel" />
                        <StatBar value={totalStats.weight} label="Weight" />
                        <StatBar value={totalStats.handling} label="Handling" />
                        <StatBar value={totalStats.traction} label="Traction" />
                        <StatBar value={totalStats.miniturbo} label="Mini-Turbo" />
                    </div>
                    
                    <button className="confirm-button" onClick={handleConfirm}>
                        Confirm Selection →
                    </button>
                </div>
            </div>
            
            <div className="select-footer">
                <p>↑↓ Change category • ←→ Select part • Enter to confirm</p>
            </div>
        </div>
    );
}

export default VehicleSelect;
