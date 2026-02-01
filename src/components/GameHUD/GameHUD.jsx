// ========================================
// TURBO KART RACING - Game HUD Component
// ========================================

import React from 'react';
import './GameHUD.css';

export function GameHUD({ 
    raceData = {}, 
    hudData = {}, 
    minimapData = {},
    showMinimap = true,
    showItemSlot = true 
}) {
    const {
        lap = 1,
        totalLaps = 3,
        time = 0,
        position = 1,
        totalRacers = 12,
        isTimeTrial = false,
        timeRemaining = null,
        bestLapTime = null
    } = raceData;
    
    const {
        speed = 0,
        coins = 0,
        driftLevel = 0,
        nitro = 0,
        wrongWay = false
    } = hudData;
    
    const formatTime = (ms) => {
        if (ms === null || ms === undefined) return '--:--.--';
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const milliseconds = Math.floor((ms % 1000) / 10);
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    };
    
    const getPositionSuffix = (pos) => {
        if (pos === 1) return 'st';
        if (pos === 2) return 'nd';
        if (pos === 3) return 'rd';
        return 'th';
    };
    
    
    const getDriftIndicator = () => {
        if (driftLevel === 0) return null;
        
        const colors = ['blue', 'orange', 'purple'];
        const level = Math.min(driftLevel, 3) - 1;
        
        return (
            <div className={`drift-indicator drift-${colors[level]}`}>
                {'🔥'.repeat(driftLevel)}
            </div>
        );
    };
    
    const { trackPoints = [], racers = [], checkpoint = null } = minimapData;

    const minimapPath = trackPoints.length
        ? trackPoints.map((p, i) => {
            const x = Math.min(100, Math.max(0, (p.x - (minimapData.bounds?.minX || 0)) / (minimapData.bounds?.width || 1) * 100));
            const y = Math.min(100, Math.max(0, (p.z - (minimapData.bounds?.minZ || 0)) / (minimapData.bounds?.height || 1) * 100));
            return `${i === 0 ? 'M' : 'L'} ${x} ${100 - y}`;
        }).join(' ')
        : '';

    return (
        <div className="game-hud">
            {/* Position Display */}
            <div className="hud-position">
                <span className="position-number">{position}</span>
                <span className="position-suffix">{getPositionSuffix(position)}</span>
                <span className="position-total">/{totalRacers}</span>
            </div>
            
            {/* Lap Counter */}
            <div className="hud-lap">
                <span className="lap-label">LAP</span>
                <span className="lap-current">{lap}</span>
                <span className="lap-divider">/</span>
                <span className="lap-total">{totalLaps}</span>
            </div>
            
            {/* Timer */}
            <div className="hud-time">
                {isTimeTrial && timeRemaining !== null ? (
                    <>
                        <span className="time-label time-remaining-label">TIME LEFT</span>
                        <span className={`time-value ${timeRemaining < 30000 ? 'time-critical' : ''}`}>
                            {formatTime(timeRemaining)}
                        </span>
                    </>
                ) : (
                    <>
                        <span className="time-label">TIME</span>
                        <span className="time-value">{formatTime(time)}</span>
                    </>
                )}
            </div>
            
            {/* Best Lap (Time Trial only) */}
            {isTimeTrial && (
                <div className="hud-best-lap">
                    <span className="best-lap-label">BEST LAP</span>
                    <span className="best-lap-value">
                        {bestLapTime && bestLapTime < Infinity ? formatTime(bestLapTime) : '--:--.--'}
                    </span>
                </div>
            )}
            
            {/* Speed */}
            <div className="hud-speed">
                <div className="speed-value">{speed}</div>
                <div className="speed-unit">km/h</div>
                <div className="speed-bar">
                    <div 
                        className="speed-fill" 
                        style={{ width: `${Math.min(100, (speed / 200) * 100)}%` }}
                    />
                </div>
            </div>
            
            {/* Coins */}
            <div className="hud-coins">
                <span className="coin-icon">🪙</span>
                <span className="coin-count">{coins}</span>
            </div>
            
            {/* Nitro Booster */}
            <div className="hud-nitro">
                <div className="nitro-label">NITRO</div>
                <div className="nitro-bar">
                    <div className="nitro-fill" style={{ width: `${Math.min(100, Math.max(0, nitro * 100))}%` }} />
                </div>
                <div className="nitro-hint">Shift</div>
            </div>
            
            {/* Drift Indicator */}
            {getDriftIndicator()}
            
            {/* Minimap */}
            {showMinimap && (
                <div className="hud-minimap">
                    <div className="minimap-track">
                        <svg viewBox="0 0 100 100" className="minimap-svg">
                            {minimapPath && (
                                <path
                                    d={minimapPath}
                                    fill="none"
                                    stroke="rgba(255,255,255,0.5)"
                                    strokeWidth="6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            )}
                            {checkpoint && (
                                <circle
                                    cx={checkpoint.x * 100}
                                    cy={(1 - checkpoint.y) * 100}
                                    r={4}
                                    className="minimap-checkpoint"
                                />
                            )}
                            {racers.map((r, idx) => (
                                <circle
                                    key={idx}
                                    cx={r.x * 100}
                                    cy={(1 - r.y) * 100}
                                    r={r.isPlayer ? 4 : 3}
                                    className={r.isPlayer ? 'minimap-player' : 'minimap-enemy'}
                                />
                            ))}
                        </svg>
                    </div>
                </div>
            )}
            
            {/* Wrong Way Warning */}
            {wrongWay && (
                <div className="wrong-way-warning">
                    <span className="wrong-way-icon">⚠️</span>
                    <span className="wrong-way-text">WRONG WAY!</span>
                </div>
            )}
            
        </div>
    );
}

export function CountdownOverlay({ count, onComplete }) {
    React.useEffect(() => {
        if (count === 0) {
            const timer = setTimeout(() => {
                onComplete?.();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [count, onComplete]);
    
    return (
        <div className="countdown-overlay">
            <div className={`countdown-number ${count === 0 ? 'go' : ''}`}>
                {count > 0 ? count : 'GO!'}
            </div>
        </div>
    );
}

export function RaceResults({ results, onContinue }) {
    // Handle both old format (array) and new format (object with results)
    const isNewFormat = results && !Array.isArray(results);
    const resultsList = isNewFormat ? results.results : results;
    const resultType = isNewFormat ? results.resultType : 'finish';
    const playerWon = isNewFormat ? results.playerWon : true;
    const playerPosition = isNewFormat ? results.playerPosition : 1;
    const mode = isNewFormat ? results.mode : 'grandprix';
    const timeUp = isNewFormat ? results.timeUp : false;
    const bestLapTime = isNewFormat ? results.bestLapTime : null;
    
    // Format time from milliseconds to MM:SS.mm
    const formatTime = (ms) => {
        if (!ms || ms === 0 || ms === 'TIME UP') return ms === 'TIME UP' ? 'TIME UP' : '--:--.--';
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const milliseconds = Math.floor((ms % 1000) / 10);
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    };

    // Points based on position
    const getPoints = (position) => {
        const pointsTable = [15, 12, 10, 8, 6, 5, 4, 3, 2, 1, 0, 0];
        return pointsTable[position - 1] || 0;
    };
    
    // Get title based on result type
    const getTitle = () => {
        if (timeUp) return '⏱️ TIME UP! ⏱️';
        if (resultType === 'win') {
            if (mode === 'timetrials') return '🏆 TIME TRIAL COMPLETE! 🏆';
            if (mode === 'vsrace') return '🎉 YOU WIN! 🎉';
            return '🏆 VICTORY! 🏆';
        }
        if (resultType === 'lose') {
            if (mode === 'vsrace') return '😔 YOU LOSE 😔';
            return '💔 BETTER LUCK NEXT TIME 💔';
        }
        return '🏁 RACE COMPLETE 🏁';
    };
    
    // Get title class
    const getTitleClass = () => {
        if (timeUp) return 'results-title time-up';
        if (resultType === 'win') return 'results-title victory';
        if (resultType === 'lose') return 'results-title defeat';
        return 'results-title';
    };

    // Only show top 10 results
    const topResults = (resultsList || []).slice(0, 10);

    return (
        <div className={`race-results ${resultType}`}>
            <h1 className={getTitleClass()}>{getTitle()}</h1>
            
            {/* Show best lap for time trials */}
            {mode === 'timetrials' && bestLapTime && bestLapTime < Infinity && (
                <div className="best-lap-result">
                    <span className="best-lap-label">Best Lap:</span>
                    <span className="best-lap-time">{formatTime(bestLapTime)}</span>
                </div>
            )}
            
            {/* VS Race special display */}
            {mode === 'vsrace' && (
                <div className="vs-result-banner">
                    <span className="vs-position">Position: {playerPosition}{playerPosition === 1 ? 'st' : 'nd'}</span>
                </div>
            )}
            
            <div className="results-list">
                {topResults.map((result, index) => (
                    <div 
                        key={index} 
                        className={`result-row ${result.isPlayer ? 'player' : ''}`}
                    >
                        <span className="result-position">{result.position || index + 1}</span>
                        <span className="result-emoji">{result.emoji || '🏎️'}</span>
                        <span className="result-name">{result.name || `Racer ${index + 1}`}</span>
                        <span className="result-time">{formatTime(result.time)}</span>
                        {mode !== 'timetrials' && (
                            <span className="result-points">+{getPoints(result.position || index + 1)} pts</span>
                        )}
                    </div>
                ))}
            </div>
            
            <button className="continue-button" onClick={onContinue}>
                Continue →
            </button>
        </div>
    );
}

export default GameHUD;
