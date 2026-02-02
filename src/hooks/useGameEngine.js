// ========================================
// TURBO KART RACING - React Game Hook
// ========================================

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GameRenderer } from '../game/systems/renderer';
import { VehiclePhysics } from '../game/systems/physics';
import { RacerAI } from '../game/systems/ai';
import { audioManager } from '../game/systems/audio';
import { TrackGenerator } from '../game/systems/trackGenerator';
import { CHARACTERS } from '../game/data/characters';
import { VEHICLES } from '../game/data/vehicles';
import { TRACKS } from '../game/data/tracks';
import { ITEMS } from '../game/data/items';
import { GAME_CONSTANTS } from '../game/constants';

// Helper functions defined outside the hook to avoid declaration order issues
function createAIRacersHelper(game, renderer) {
    const aiCount = game.settings.cpuCount;
    const availableCharacters = CHARACTERS.getAllCharacters().filter(
        c => c.id !== game.players[0]?.character?.id
    );
    
    game.aiRacers = [];
    
    for (let i = 0; i < aiCount; i++) {
        const character = availableCharacters[Math.floor(Math.random() * availableCharacters.length)];
        const bodies = VEHICLES.getAllBodies();
        const wheels = VEHICLES.getAllWheels();
        const gliders = VEHICLES.getAllGliders();
        
        const vehicleConfig = {
            body: bodies[Math.floor(Math.random() * bodies.length)]?.id || 'standard_kart',
            wheels: wheels[Math.floor(Math.random() * wheels.length)]?.id || 'standard',
            glider: gliders[Math.floor(Math.random() * gliders.length)]?.id || 'super_glider'
        };
        
        const physics = new VehiclePhysics(
            character?.id || 'luigi',
            vehicleConfig,
            renderer.scene
        );
        
        // Apply engine class speed modifier
        const classModifiers = { '50cc': 0.7, '100cc': 0.85, '150cc': 1.0, '200cc': 1.15, 'mirror': 1.0 };
        physics.maxSpeed *= classModifiers[game.settings.engineClass] || 1.0;
        physics.speedControl = 0.8;
        
        // Set start position
        const startPos = game.track.startPositions[i + 1];
        if (startPos) {
            physics.position.copy(startPos.position);
            physics.rotation.y = startPos.rotation;
            physics.quaternion.setFromEuler(physics.rotation);
            physics.mesh.position.copy(physics.position);
            physics.mesh.quaternion.copy(physics.quaternion);
            console.log('AI', i, 'starting at:', physics.position.x.toFixed(1), physics.position.z.toFixed(1));
        } else {
            console.warn('No start position for AI racer', i, '- using fallback');
            // Fallback: place on track at random position
            const t = 0.9 - (i * 0.03);
            const trackPoint = game.track.path.getPointAt(t);
            const tangent = game.track.path.getTangentAt(t);
            if (trackPoint && tangent) {
                physics.position.copy(trackPoint);
                physics.position.y = 0.5;
                physics.rotation.y = Math.atan2(tangent.x, tangent.z);
                physics.quaternion.setFromEuler(physics.rotation);
                physics.mesh.position.copy(physics.position);
                physics.mesh.quaternion.copy(physics.quaternion);
            }
        }
        
        // Create AI
        const difficulty = ['easy', 'normal', 'hard'][Math.floor(Math.random() * 3)];
        const ai = new RacerAI(physics, game.track?.path, difficulty);
        
        game.vehicles.push(physics);
        game.aiRacers.push({
            ai,
            vehicle: physics,
            character,
            coins: 0,
            lap: 1,
            checkpoint: 0,
            finished: false,
            item: null
        });
    }
}

// function checkItemBoxCollisionHelper(player, track) {
//     if (!track?.itemBoxes) return;
    
//     track.itemBoxes.forEach(box => {
//         if (!box.active) return;
        
//         const dist = player.vehicle.position.distanceTo(box.position);
//         if (dist < 3) {
//             // Get random item
//             const item = ITEMS.getRandomItem(player.vehicle.racePosition);
//             player.item = item;
//             box.active = false;
//             box.mesh.visible = false;
            
//             audioManager.playSound('item_get');
            
//             // Respawn timer
//             setTimeout(() => {
//                 box.active = true;
//                 box.mesh.visible = true;
//             }, box.respawnTime * 1000);
//         }
//     });
// }

function checkCoinCollisionHelper(player, track) {
    if (!track?.coins) return;
    
    track.coins.forEach(coin => {
        if (!coin.active) return;
        
        const dist = player.vehicle.position.distanceTo(coin.position);
        if (dist < 2) {
            player.coins = Math.min(player.coins + 1, GAME_CONSTANTS.PHYSICS.MAX_COINS);
            coin.active = false;
            coin.mesh.visible = false;
            
            audioManager.playSound('coin_collect');
            
            // Respawn timer
            setTimeout(() => {
                coin.active = true;
                coin.mesh.visible = true;
            }, 10000);
        }
    });
}

function resolveVehicleCollisionsHelper(vehicles) {
    const radius = 1.6;
    const minDist = radius * 2;
    
    for (let i = 0; i < vehicles.length; i++) {
        for (let j = i + 1; j < vehicles.length; j++) {
            const a = vehicles[i];
            const b = vehicles[j];
            if (!a || !b) continue;
            
            const delta = a.position.clone().sub(b.position);
            delta.y = 0;
            const dist = delta.length();
            if (dist === 0 || dist >= minDist) continue;
            
            const overlap = minDist - dist;
            const normal = delta.normalize();
            
            // Separate vehicles equally
            a.position.add(normal.clone().multiplyScalar(overlap * 0.5));
            b.position.add(normal.clone().multiplyScalar(-overlap * 0.5));
            
            // Play collision sound for player vehicle
            const impactSpeed = Math.abs(a.currentSpeed) + Math.abs(b.currentSpeed);
            if ((a.isPlayer || b.isPlayer) && impactSpeed > 8) {
                const playerVehicle = a.isPlayer ? a : b;
                if (!playerVehicle.soundCooldowns) {
                    playerVehicle.soundCooldowns = { carCollision: 0, railingHit: 0, brakeScreech: 0 };
                }
                if (!playerVehicle.soundCooldowns.carCollision || playerVehicle.soundCooldowns.carCollision <= 0) {
                    audioManager.playSound('car_collision');
                    playerVehicle.soundCooldowns.carCollision = 0.5;
                }
            }
            
            // Dampen speeds on collision
            a.currentSpeed *= 0.98;
            b.currentSpeed *= 0.98;
        }
    }
}

// function applyItemEffect(player) {
//     if (!player || !player.item) return;
    
//     const item = player.item;
//     console.log('Using item:', item.name || item.id);
    
//     // Apply item effect based on type
//     switch (item.type) {
//         case 'boost':
//             player.vehicle.applyBoost(item.boostPower || 1.5, item.boostDuration || 1.0);
//             audioManager.playSound('mushroom_boost');
//             break;
//         case 'trap':
//             audioManager.playSound('item_throw');
//             break;
//         case 'projectile':
//         case 'homing':
//             audioManager.playSound('shell_fire');
//             break;
//         case 'special':
//             player.vehicle.invincible = true;
//             player.vehicle.speedMultiplier = 1.3;
//             setTimeout(() => {
//                 if (player.vehicle) {
//                     player.vehicle.invincible = false;
//                     player.vehicle.speedMultiplier = 1.0;
//                 }
//             }, 8000);
//             audioManager.playSound('star_power');
//             break;
//         case 'explosive':
//             audioManager.playSound('bomb_throw');
//             break;
//         default:
//             audioManager.playSound('item_use');
//     }
    
//     player.item = null;
// }

function calculatePositionsHelper(game, setRaceComplete, setFinalResults) {
    const allRacers = [...game.players, ...game.aiRacers];
    const checkpointCount = game.track?.checkpointCount || 10;
    
    // Calculate total progress for each racer
    // Progress = (completed laps * checkpoints) + checkpoints passed + segment progress
    allRacers.forEach(racer => {
        const completedLaps = Math.max(0, (racer.lap || 1) - 1);
        const checkpointsPassed = racer.lastCheckpoint || 0;
        const segmentProgress = racer.vehicle.lapProgress || 0;
        
        // Total progress in "checkpoint units"
        racer.totalProgress = (completedLaps * checkpointCount) + checkpointsPassed + segmentProgress;
        racer.vehicle.totalProgress = racer.totalProgress;
    });
    
    // Sort by: finished status (finished first by time), then by total progress
    allRacers.sort((a, b) => {
        // Finished racers come first, sorted by finish time
        if (a.finished && b.finished) {
            return (a.finishTime || 0) - (b.finishTime || 0);
        }
        if (a.finished) return -1;
        if (b.finished) return 1;
        
        // Higher total progress = better position
        return b.totalProgress - a.totalProgress;
    });
    
    allRacers.forEach((racer, index) => {
        racer.vehicle.racePosition = index + 1;
    });
    
    // Check if race is complete (player finished)
    const player = game.players[0];
    if (player?.finished && !game.raceComplete) {
        game.raceComplete = true;
        
        // Stop engine sound when scorecard appears
        audioManager.stopEngineSound();
        
        // Play victory music
        audioManager.playMusicForState('victory');
        
        // Determine if player won or lost based on game mode
        const playerPosition = player.vehicle.racePosition || 1;
        let playerWon = false;
        let resultType = 'finish'; // 'win', 'lose', 'finish'
        
        if (game.mode === 'timetrials') {
            // Time trials: winning means completing all laps
            playerWon = player.finished && player.finishTime > 0;
            resultType = playerWon ? 'win' : 'finish';
        } else if (game.mode === 'vsrace') {
            // VS Race: must be 1st place to win
            playerWon = playerPosition === 1;
            resultType = playerWon ? 'win' : 'lose';
        } else {
            // Grand Prix: top 3 is a win, 4+ is meh
            playerWon = playerPosition <= 3;
            resultType = playerWon ? 'win' : (playerPosition <= 6 ? 'finish' : 'lose');
        }
        
        const results = allRacers.map((r, i) => ({
            position: i + 1,
            name: r.isPlayer ? `Player (${r.character?.name || 'Unknown'})` : (r.character?.name || `Racer ${i + 1}`),
            emoji: r.character?.emoji || r.character?.icon || '🏎️',
            isPlayer: r.isPlayer || false,
            lap: r.lap,
            time: r.finishTime || 0
        }));
        
        // Add result metadata
        game.finalResults = results;
        game.resultType = resultType;
        game.playerWon = playerWon;
        game.playerPosition = playerPosition;
        
        setRaceComplete(true);
        setFinalResults({
            results,
            resultType,
            playerWon,
            playerPosition,
            mode: game.mode,
            bestLapTime: game.bestLapTime
        });
    }
}

/**
 * Check if a racer is inside a checkpoint trigger volume
 */
function isInCheckpoint(position, checkpoint) {
    const toPos = position.clone().sub(checkpoint.center);
    toPos.y = 0;
    
    // Distance along track direction (forward/backward from checkpoint line)
    const alongTrack = Math.abs(toPos.dot(checkpoint.tangent));
    
    // Distance perpendicular to track (left/right)
    const acrossTrack = Math.abs(toPos.dot(checkpoint.normal));
    
    // Check if within trigger volume
    return alongTrack < checkpoint.depth && acrossTrack < checkpoint.width / 2;
}

/**
 * Check if racer is going the wrong way
 * Returns true if facing backwards relative to track direction
 */
function isWrongWay(vehicle, trackPath) {
    if (!trackPath) return false;
    
    // Get vehicle forward direction
    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(vehicle.quaternion);
    forward.y = 0;
    forward.normalize();
    
    // Get track direction at vehicle position
    const trackInfo = vehicle.getClosestPointOnTrack?.(trackPath);
    if (!trackInfo?.tangent) return false;
    
    const trackDir = trackInfo.tangent.clone();
    trackDir.y = 0;
    trackDir.normalize();
    
    // Dot product: positive = same direction, negative = opposite
    const alignment = forward.dot(trackDir);
    
    // Consider wrong way if facing more than 120 degrees from track direction
    return alignment < -0.5;
}

// Check lap completion for all racers using checkpoint system
function checkLapCompletionHelper(game, raceData, setRaceData, setHudData) {
    if (!game.track?.path || !game.track?.checkpoints) return;
    
    const allRacers = [...game.players, ...game.aiRacers];
    const trackPath = game.track.path;
    const checkpoints = game.track.checkpoints;
    const checkpointCount = checkpoints.length;
    const progressPoints = game.track.progressPoints || trackPath.getPoints(400);
    game.track.progressPoints = progressPoints;
    const pointsLen = progressPoints.length || 1;
    
    allRacers.forEach(racer => {
        if (racer.finished) return;
        
        const pos = racer.vehicle.position.clone();
        pos.y = 0;
        
        // Calculate progress along track (0-1) for position calculation
        let minDist = Infinity;
        let closestIndex = 0;
        for (let i = 0; i < pointsLen; i++) {
            const pt = progressPoints[i];
            const dx = pos.x - pt.x;
            const dz = pos.z - pt.z;
            const dist = dx * dx + dz * dz;
            if (dist < minDist) {
                minDist = dist;
                closestIndex = i;
            }
        }
        const currentT = closestIndex / pointsLen;
        
        // Initialize checkpoint tracking on first frame
        if (racer.lastCheckpoint === undefined) {
            racer.lastCheckpoint = 0;
            racer.checkpointsVisited = new Set([0]); // Start at checkpoint 0
            racer.lap = 1;
            racer.wrongWayTimer = 0;
            racer.isWrongWay = false;
        }
        
        // Store progress for position calculation
        racer.vehicle.lapProgress = currentT;
        
        // Check for checkpoint triggers
        const nextCheckpoint = (racer.lastCheckpoint + 1) % checkpointCount;
        const nextCp = checkpoints[nextCheckpoint];
        
        if (isInCheckpoint(pos, nextCp)) {
            // Passed the next checkpoint!
            racer.lastCheckpoint = nextCheckpoint;
            racer.checkpointsVisited.add(nextCheckpoint);
            
            // Check if crossed finish line (checkpoint 0) with all checkpoints visited
            if (nextCheckpoint === 0 && racer.checkpointsVisited.size === checkpointCount) {
                // Valid lap completion!
                // const previousLap = racer.lap;
                racer.lap++;
                racer.vehicle.lap = racer.lap;
                racer.checkpointsVisited = new Set([0]); // Reset for next lap
                
                // Track lap time for time trials
                const currentLapTime = game.elapsedTime - (racer.lapStartTime || 0);
                racer.lapStartTime = game.elapsedTime;
                
                // Update best lap time (for time trials)
                if (game.timeTrialMode && currentLapTime < (game.bestLapTime || Infinity)) {
                    game.bestLapTime = currentLapTime;
                    console.log('NEW BEST LAP:', (currentLapTime / 1000).toFixed(3), 's');
                }
                
                console.log(`LAP ${racer.lap} for ${racer.isPlayer ? 'PLAYER' : 'AI'} - all ${checkpointCount} checkpoints passed! Lap time: ${(currentLapTime/1000).toFixed(2)}s`);
                
                const totalLaps = raceData.totalLaps || 3;
                
                if (racer.lap > totalLaps) {
                    racer.finished = true;
                    racer.vehicle.finished = true;
                    // Use game.elapsedTime for accurate finish time
                    racer.finishTime = game.elapsedTime || 0;
                    console.log(`${racer.isPlayer ? 'PLAYER' : 'AI'} FINISHED with time: ${racer.finishTime}ms`);
                    if (racer.isPlayer) {
                        audioManager.playSound('race_finish');
                        // Stop engine sound when race is finished
                        audioManager.stopEngineSound();
                    }
                } else if (racer.isPlayer) {
                    if (racer.lap === totalLaps) {
                        audioManager.playSound('final_lap');
                    } else {
                        audioManager.playSound('lap_complete');
                    }
                    setRaceData(prev => ({ ...prev, lap: racer.lap, bestLapTime: game.bestLapTime }));
                }
            }
        }
        
        // Wrong-way detection for player
        if (racer.isPlayer) {
            const wrongWay = isWrongWay(racer.vehicle, trackPath);
            
            if (wrongWay) {
                const prevWrongWayTimer = racer.wrongWayTimer || 0;
                racer.wrongWayTimer = prevWrongWayTimer + (1/60); // Approximate delta time
                racer.isWrongWay = true;
                
                // Play wrong way warning beep every 0.6 seconds
                if (!racer.wrongWaySoundCooldown) racer.wrongWaySoundCooldown = 0;
                racer.wrongWaySoundCooldown -= (1/60);
                if (racer.wrongWaySoundCooldown <= 0) {
                    audioManager.playSound('wrong_way_beep');
                    racer.wrongWaySoundCooldown = 0.6;
                }
                
                // Auto-reset after 3 seconds of wrong-way driving
                if (racer.wrongWayTimer > 3.0) {
                    // Reset to last checkpoint
                    const lastCp = checkpoints[racer.lastCheckpoint];
                    if (lastCp) {
                        racer.vehicle.position.copy(lastCp.center);
                        racer.vehicle.position.y = 0.5;
                        
                        // Face correct direction
                        const angle = Math.atan2(lastCp.tangent.x, lastCp.tangent.z);
                        racer.vehicle.rotation.y = angle;
                        racer.vehicle.quaternion.setFromEuler(racer.vehicle.rotation);
                        
                        // Reset velocity
                        racer.vehicle.velocity.set(0, 0, 0);
                        racer.vehicle.currentSpeed = 0;
                        
                        // Sync mesh
                        if (racer.vehicle.mesh) {
                            racer.vehicle.mesh.position.copy(racer.vehicle.position);
                            racer.vehicle.mesh.quaternion.copy(racer.vehicle.quaternion);
                        }
                        
                        console.log('Player reset to checkpoint', racer.lastCheckpoint);
                    }
                    racer.wrongWayTimer = 0;
                }
            } else {
                racer.wrongWayTimer = 0;
                racer.isWrongWay = false;
                racer.wrongWaySoundCooldown = 0;
            }
            
            // Update HUD with wrong-way status
            if (setHudData) {
                setHudData(prev => ({
                    ...prev,
                    wrongWay: racer.isWrongWay
                }));
            }
        }
    });
}

export function useGameEngine() {
    const [gameState, setGameState] = useState('loading');
    const [raceData, setRaceData] = useState({
        lap: 1,
        totalLaps: 3,
        time: 0,
        position: 1,
        totalRacers: 12
    });
    const [hudData, setHudData] = useState({
        speed: 0,
        coins: 0,
        item: null,
        driftLevel: 0,
        nitro: 0,
        wrongWay: false
    });
    const [minimapData, setMinimapData] = useState({
        trackPoints: [],
        bounds: null,
        racers: []
    });
    const [raceComplete, setRaceComplete] = useState(false);
    const [finalResults, setFinalResults] = useState([]);
    
    const rendererRef = useRef(null);
    const gameRef = useRef(null);
    const animationFrameRef = useRef(null);
    const clockRef = useRef(new THREE.Clock());
    const inputStateRef = useRef({
        accelerate: false,
        brake: false,
        left: false,
        right: false,
        drift: false,
        boost: false,
        item: false,
        lookBack: false
    });
    
    // Pause/Resume - defined early so it can be used by handleKeyDown
    const togglePause = useCallback(() => {
        const game = gameRef.current;
        if (!game) return;
        
        if (game.state === 'racing' || game.state === 'battle') {
            game.state = 'paused';
            setGameState('paused');
        } else if (game.state === 'paused') {
            game.state = 'racing';
            setGameState('racing');
        }
    }, []);
    
    // Initialize game
    const initGame = useCallback(async (containerElement) => {
        if (!containerElement) return;
        
        // Dispose existing renderer if any
        if (rendererRef.current) {
            rendererRef.current.dispose();
        }
        
        // Initialize renderer
        const renderer = new GameRenderer();
        renderer.init(containerElement, { playerCount: 1 });
        rendererRef.current = renderer;
        
        // Initialize audio
        await audioManager.init();
        
        // Initialize game state if not already set
        if (!gameRef.current) {
            gameRef.current = {
                state: 'menu',
                mode: null,
                vehicles: [],
                aiRacers: [],
                players: [],
                track: null,
                settings: {
                    engineClass: '150cc',
                    cpuCount: 11,
                    playerCount: 1
                }
            };
        } else {
            // Reset game state for new race
            gameRef.current.state = 'menu';
            gameRef.current.vehicles = [];
            gameRef.current.aiRacers = [];
            gameRef.current.players = [];
            gameRef.current.track = null;
        }
        
        console.log('Game engine initialized, container:', containerElement.id || 'game-container');
    }, []);
    
    // Update race logic
    const updateRaceLogic = useCallback((deltaTime) => {
        const game = gameRef.current;
        if (!game || game.state !== 'racing') return;
        
        // Update race time - store in game object for accurate finish time
        game.elapsedTime = (game.elapsedTime || 0) + deltaTime * 1000;
        
        // Check time limit for time trials
        if (game.timeTrialMode && game.timeLimit > 0) {
            const timeRemaining = game.timeLimit - game.elapsedTime;
            if (timeRemaining <= 0 && !game.raceComplete) {
                // Time's up - player loses!
                game.raceComplete = true;
                setRaceComplete(true);
                setFinalResults({
                    results: [{
                        position: '-',
                        name: game.players[0]?.character?.name || 'Player',
                        time: 'TIME UP',
                        isPlayer: true,
                        bestLap: game.bestLapTime < Infinity ? game.bestLapTime : null
                    }],
                    resultType: 'lose',
                    playerWon: false,
                    mode: 'timetrials',
                    timeUp: true,
                    bestLapTime: game.bestLapTime
                });
                audioManager.stopEngineSound();
                audioManager.playMusicForState('victory');
                return;
            }
        }
        
        setRaceData(prev => ({
            ...prev,
            time: game.elapsedTime,
            timeRemaining: game.timeTrialMode ? Math.max(0, game.timeLimit - game.elapsedTime) : null,
            bestLapTime: game.bestLapTime
        }));
        
        // Update player vehicle
        const playerVehicle = game.vehicles[0];
        const player = game.players[0];
        
        if (playerVehicle && !player.finished) {
            // Debug logging for first few frames
            if (game.debugFrames === undefined) game.debugFrames = 0;
            if (game.debugFrames < 5) {
                console.log('Race update:', {
                    state: game.state,
                    input: { ...inputStateRef.current },
                    speed: playerVehicle.currentSpeed,
                    position: playerVehicle.position.clone()
                });
                game.debugFrames++;
            }
            
            playerVehicle.handleInput(inputStateRef.current, deltaTime);
            playerVehicle.update(deltaTime, game.track);
            
            // Update engine sound based on speed and input state
            const maxSpeed = playerVehicle.maxSpeed || 40;
            const speedRatio = Math.abs(playerVehicle.currentSpeed) / maxSpeed;
            audioManager.updateEngineSound(
                speedRatio,
                inputStateRef.current.accelerate,
                inputStateRef.current.brake
            );
            
            // Update sound cooldowns for player vehicle
            if (playerVehicle.soundCooldowns) {
                Object.keys(playerVehicle.soundCooldowns).forEach(key => {
                    if (playerVehicle.soundCooldowns[key] > 0) {
                        playerVehicle.soundCooldowns[key] -= deltaTime;
                    }
                });
            }
            
            // Check coin pickup
            checkCoinCollisionHelper(player, game.track);
        }
        
        // Update AI racers
        game.aiRacers.forEach((racer, index) => {
            if (racer.finished) return;
            
            if (racer.ai && game.track?.path) {
                racer.ai.setTrackPath(game.track.path);
            }
            
            racer.ai?.update(deltaTime, {
                allRacers: [...game.players, ...game.aiRacers],
                itemBoxes: game.track?.itemBoxes
            });
            
            // DON'T override AI's accelerate decision!
            // racer.vehicle.input.accelerate = true; // REMOVED - let AI control this
            
            racer.vehicle.update(deltaTime, game.track);
            
            // Debug first AI racer
            if (index === 0 && game.debugAIFrames === undefined) {
                game.debugAIFrames = 0;
            }
            if (index === 0 && game.debugAIFrames < 10) {
                console.log('AI Racer 0:', {
                    hasTrackPath: !!racer.ai?.trackPath,
                    trackPathLength: racer.ai?.trackPath?.length,
                    targetPoint: racer.ai?.targetPoint?.clone(),
                    position: racer.vehicle.position.clone(),
                    speed: racer.vehicle.currentSpeed,
                    input: { ...racer.vehicle.input }
                });
                game.debugAIFrames++;
            }
            
            // Sync mesh
            if (racer.vehicle.mesh) {
                racer.vehicle.mesh.position.copy(racer.vehicle.position);
                racer.vehicle.mesh.quaternion.copy(racer.vehicle.quaternion);
            }
        });

        // Resolve kart-to-kart collisions
        resolveVehicleCollisionsHelper(game.vehicles);
        
        // Check lap completion with checkpoint system
        checkLapCompletionHelper(game, raceData, setRaceData, setHudData);
        
        // Calculate positions
        calculatePositionsHelper(game, setRaceComplete, setFinalResults);

        // Update minimap data - check track exists and capture values
        const track = game.track;
        if (track?.minimapBounds && track?.minimapPoints) {
            const allRacers = [...game.players, ...game.aiRacers];
            const bounds = track.minimapBounds;
            const trackPoints = track.minimapPoints;
            const checkpoint = track.minimapCheckpoint;
            const racers = allRacers.map(r => {
                const pos = r.vehicle.position;
                const x = (pos.x - bounds.minX) / bounds.width;
                const y = (pos.z - bounds.minZ) / bounds.height;
                return {
                    x: Math.min(1, Math.max(0, x)),
                    y: Math.min(1, Math.max(0, y)),
                    isPlayer: !!r.isPlayer
                };
            });
            setMinimapData(prev => ({
                ...prev,
                trackPoints,
                bounds,
                racers,
                checkpoint: checkpoint || prev.checkpoint
            }));
        }
        
        // Update HUD (preserve wrongWay status set by checkLapCompletionHelper)
        setHudData(prev => ({
            ...prev,
            speed: Math.abs(playerVehicle?.currentSpeed || 0).toFixed(0),
            coins: player?.coins || 0,
            item: player?.item || null,
            driftLevel: playerVehicle?.driftLevel || 0,
            nitro: playerVehicle?.nitroCharge ?? 0
        }));
        
        setRaceData(prev => ({
            ...prev,
            position: playerVehicle?.racePosition || 1,
            lap: playerVehicle?.lap || 1
        }));
    }, [raceData, minimapData.bounds]);
    
    // Update battle logic
    const updateBattleLogic = useCallback((deltaTime) => {
        const game = gameRef.current;
        if (!game || game.state !== 'battle') return;
        
        // Similar to race but with battle mechanics
        const playerVehicle = game.vehicles[0];
        if (playerVehicle) {
            playerVehicle.handleInput(inputStateRef.current, deltaTime);
            playerVehicle.update(deltaTime);
        }
        
        game.aiRacers.forEach(racer => {
            racer.ai?.update(deltaTime, { allPlayers: [...game.players, ...game.aiRacers] });
            racer.vehicle.update(deltaTime);
        });
    }, []);
    
    // Game loop
    const startGameLoop = useCallback(() => {
        const game = gameRef.current;
        const renderer = rendererRef.current;
        
        if (!game || !renderer) {
            console.error('Cannot start game loop - missing:', !game ? 'game' : 'renderer');
            return;
        }
        
        console.log('Game loop starting, scene children:', renderer.scene?.children.length);
        
        let frameCount = 0;
        const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);
            
            const deltaTime = Math.min(clockRef.current.getDelta(), 0.05);
            
            if (game.state === 'racing') {
                updateRaceLogic(deltaTime);
            } else if (game.state === 'battle') {
                updateBattleLogic(deltaTime);
            } else if (frameCount < 5) {
                console.log('Game state:', game.state, '- waiting for racing to start');
            }
            // countdown and paused states just render
            
            // Update camera
            if (game.vehicles[0]) {
                renderer.updateCamera(0, game.vehicles[0], deltaTime);
            }
            
            // Debug first few frames
            if (frameCount < 3) {
                console.log(`Frame ${frameCount}: state=${game.state}, vehicles=${game.vehicles.length}, camera pos=`, renderer.cameras[0]?.camera.position);
                frameCount++;
            }
            
            // Render
            renderer.render();
        };
        
        animate();
    }, [updateRaceLogic, updateBattleLogic]);
    
    // Start race
    const startRace = useCallback(async (options) => {
        const game = gameRef.current;
        const renderer = rendererRef.current;
        
        if (!game || !renderer) return;
        
        // Cancel any existing game loop before starting new race
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        
        // Reset race state immediately
        game.raceComplete = false;
        game.elapsedTime = 0;
        setRaceComplete(false);
        setFinalResults([]);
        
        game.mode = options.mode || 'grandprix';
        game.settings.engineClass = options.engineClass || '150cc';
        
        // Set CPU count based on game mode
        if (game.mode === 'timetrials') {
            game.settings.cpuCount = 0; // Solo time trial
            game.timeTrialMode = true;
            game.timeLimit = options.timeLimit || 30000; // 30 seconds default
            game.bestLapTime = Infinity;
        } else if (game.mode === 'vsrace') {
            game.settings.cpuCount = 1; // 1 AI opponent for VS Race
            game.timeTrialMode = false;
        } else {
            game.settings.cpuCount = 11; // Full grid for Grand Prix
            game.timeTrialMode = false;
        }
        
        // Clear previous scene
        renderer.clear();
        
        // Get track data
        const trackData = options.track || TRACKS.getTrack(options.cup?.tracks[0]) || TRACKS.getAllTracks()[0];
        
        // Generate track
        const generator = new TrackGenerator(renderer.scene);
        game.track = generator.generate(trackData);

        // Build minimap track points and bounds
        if (game.track?.path) {
            const progressPoints = game.track.path.getPoints(400);
            const pts = progressPoints.map(p => ({ x: p.x, z: p.z }));
            const minX = Math.min(...pts.map(p => p.x));
            const maxX = Math.max(...pts.map(p => p.x));
            const minZ = Math.min(...pts.map(p => p.z));
            const maxZ = Math.max(...pts.map(p => p.z));
            const padding = 5;
            const bounds = {
                minX: minX - padding,
                maxX: maxX + padding,
                minZ: minZ - padding,
                maxZ: maxZ + padding,
            };
            bounds.width = bounds.maxX - bounds.minX;
            bounds.height = bounds.maxZ - bounds.minZ;
            const startPoint = game.track.path.getPointAt(0);
            const checkpoint = {
                x: (startPoint.x - bounds.minX) / bounds.width,
                y: (startPoint.z - bounds.minZ) / bounds.height
            };
            game.track.minimapPoints = pts;
            game.track.minimapBounds = bounds;
            game.track.progressPoints = progressPoints;
            game.track.minimapCheckpoint = checkpoint;
            setMinimapData({ trackPoints: pts, bounds, racers: [], checkpoint });
        }
        
        // Setup skybox and lighting
        renderer.createSkybox(trackData);
        renderer.setTrackLighting(trackData);
        
        // Create player vehicle
        const playerVehicle = new VehiclePhysics(
            options.character?.id || 'mario',
            {
                body: options.vehicle?.body?.id || 'standard_kart',
                wheels: options.vehicle?.wheels?.id || 'standard',
                glider: options.vehicle?.glider?.id || 'super_glider'
            },
            renderer.scene
        );
        
        // Set start position
        const startPos = game.track.startPositions[0];
        if (startPos) {
            playerVehicle.position.copy(startPos.position);
            playerVehicle.rotation.y = startPos.rotation;
            playerVehicle.quaternion.setFromEuler(playerVehicle.rotation);
            playerVehicle.mesh.position.copy(playerVehicle.position);
            playerVehicle.mesh.quaternion.copy(playerVehicle.quaternion);
            console.log('Player starting at:', playerVehicle.position.x.toFixed(1), playerVehicle.position.z.toFixed(1), 'facing:', (startPos.rotation * 180 / Math.PI).toFixed(0), 'degrees');
        } else {
            console.error('No start position found for player!');
            // Fallback: use track start
            const trackPoint = game.track.path.getPointAt(0.98);
            if (trackPoint) {
                playerVehicle.position.copy(trackPoint);
                playerVehicle.position.y = 0.5;
                playerVehicle.mesh.position.copy(playerVehicle.position);
            }
        }
        
        // Apply engine class modifier
        const classModifiers = { '50cc': 0.7, '100cc': 0.85, '150cc': 1.0, '200cc': 1.15, 'mirror': 1.0 };
        playerVehicle.maxSpeed *= classModifiers[game.settings.engineClass] || 1.0;
        playerVehicle.speedControl = 0.75;
        
        // Mark as player vehicle for sound triggers
        playerVehicle.isPlayer = true;
        
        // Initialize sound cooldowns for collision and brake sounds
        playerVehicle.soundCooldowns = {
            railingHit: 0,
            carCollision: 0,
            brakeScreech: 0
        };
        
        // Log character info for debugging
        console.log('Starting race with character:', options.character?.name, options.character);
        
        game.vehicles = [playerVehicle];
        game.players = [{
            id: 'player1',
            vehicle: playerVehicle,
            character: options.character || { name: 'Unknown', id: 'unknown' },
            isPlayer: true,
            coins: 0,
            lap: 1,
            checkpoint: 0,
            finished: false,
            item: null
        }];
        
        // Create AI racers
        createAIRacersHelper(game, renderer);
        
        // Setup camera
        renderer.cameras[0].target = playerVehicle;
        
        // Reset race data (elapsedTime and raceComplete already reset at start)
        setRaceData({
            lap: 1,
            totalLaps: options.lapCount || 3,
            time: 0,
            position: 1,
            totalRacers: game.vehicles.length,
            isTimeTrial: game.mode === 'timetrials',
            timeLimit: game.timeLimit || 0,
            bestLapTime: game.bestLapTime || Infinity
        });
        
        // Change music to countdown theme
        audioManager.playMusic('countdown');
        
        // Start countdown
        game.state = 'countdown';
        setGameState('countdown');
        
        // Start game loop
        clockRef.current.start();
        startGameLoop();
        
        console.log('Race started, vehicles:', game.vehicles.length, 'track:', game.track ? 'loaded' : 'missing');
        
    }, [startGameLoop]);
    
    // Input handling
    const handleKeyDown = useCallback((e) => {
        const input = inputStateRef.current;
        const controls = GAME_CONSTANTS.CONTROLS.KEYBOARD_P1;
        
        // Resume audio context on user interaction (browser autoplay policy)
        audioManager.resumeContext();
        
        // Debug: log key presses
        if (controls.accelerate.includes(e.code) || controls.brake.includes(e.code)) {
            console.log('Key down:', e.code, 'controls:', controls.accelerate);
        }
        
        if (controls.accelerate.includes(e.code)) input.accelerate = true;
        if (controls.brake.includes(e.code)) input.brake = true;
        if (controls.left.includes(e.code)) input.left = true;
        if (controls.right.includes(e.code)) input.right = true;
        if (controls.drift.includes(e.code)) input.drift = true;
        if (controls.boost && controls.boost.includes(e.code)) input.boost = true;
        if (controls.lookBack.includes(e.code)) input.lookBack = true;
        
        if (e.code === 'Escape') {
            togglePause();
        }
    }, [togglePause]);
    
    const handleKeyUp = useCallback((e) => {
        const input = inputStateRef.current;
        const controls = GAME_CONSTANTS.CONTROLS.KEYBOARD_P1;
        
        if (controls.accelerate.includes(e.code)) input.accelerate = false;
        if (controls.brake.includes(e.code)) input.brake = false;
        if (controls.left.includes(e.code)) input.left = false;
        if (controls.right.includes(e.code)) input.right = false;
        if (controls.drift.includes(e.code)) input.drift = false;
        if (controls.boost && controls.boost.includes(e.code)) input.boost = false;
        if (controls.lookBack.includes(e.code)) input.lookBack = false;
    }, []);
    
    const resumeGame = useCallback(() => {
        const game = gameRef.current;
        if (game) {
            game.state = 'racing';
            setGameState('racing');
        }
    }, []);
    
    // Start racing (from countdown)
    const startRacing = useCallback(() => {
        const game = gameRef.current;
        console.log('startRacing called, game:', !!game, 'current state:', game?.state);
        if (game) {
            game.state = 'racing';
            setGameState('racing');
            audioManager.playSound('countdown_go');
            
            // Switch to race music
            audioManager.playMusicForState('race');
            
            // Start continuous engine sound
            audioManager.startEngineSound();
            
            console.log('Game state set to racing');
        }
    }, []);
    
    // Quit to menu
    const quitToMenu = useCallback(() => {
        const game = gameRef.current;
        const renderer = rendererRef.current;
        
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        
        if (renderer) {
            renderer.clear();
        }
        
        // Stop engine sound when quitting
        audioManager.stopEngineSound();
        
        if (game) {
            game.state = 'menu';
            game.vehicles = [];
            game.aiRacers = [];
            game.players = [];
            game.track = null;
            game.raceComplete = false;
            game.elapsedTime = 0;
        }
        
        // Reset race-related states
        setRaceComplete(false);
        setFinalResults([]);
        setGameState('menu');
        audioManager.playMusicForState('menu');
    }, []);
    
    // Use item
    const useItem = useCallback(() => {
        const game = gameRef.current;
        if (!game || !game.players[0]?.item) return;
        
        const player = game.players[0];
        const item = player.item;
        
        console.log('Using item:', item.name || item.id);
        
        // Apply item effect based on type
        switch (item.type) {
            case 'boost':
                player.vehicle.applyBoost(item.boostPower || 1.5, item.boostDuration || 1.0);
                audioManager.playSound('mushroom_boost');
                break;
            case 'trap':
                // Drop banana/trap behind
                audioManager.playSound('item_throw');
                break;
            case 'projectile':
            case 'homing':
                // Fire shell
                audioManager.playSound('shell_fire');
                break;
            case 'special':
                // Star invincibility
                player.vehicle.invincible = true;
                player.vehicle.speedMultiplier = 1.3;
                setTimeout(() => {
                    if (player.vehicle) {
                        player.vehicle.invincible = false;
                        player.vehicle.speedMultiplier = 1.0;
                    }
                }, 8000);
                audioManager.playSound('star_power');
                break;
            case 'explosive':
                audioManager.playSound('bomb_throw');
                break;
            default:
                // Generic item use
                audioManager.playSound('item_use');
        }
        
        player.item = null;
    }, []);
    
    // Cleanup
    useEffect(() => {
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (rendererRef.current) {
                rendererRef.current.dispose();
            }
        };
    }, []);
    
    // Setup input listeners
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleKeyDown, handleKeyUp]);
    
    return {
        gameState,
        setGameState,
        raceData,
        hudData,
        minimapData,
        raceComplete,
        finalResults,
        initGame,
        startRace,
        startRacing,
        togglePause,
        resumeGame,
        quitToMenu,
        useItem,
        gameRef,
        rendererRef
    };
}

export default useGameEngine;
