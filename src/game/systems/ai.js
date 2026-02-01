// ========================================
// TURBO KART RACING - AI System
// ========================================

import * as THREE from 'three';

export class RacerAI {
    constructor(vehicle, trackPath = null, difficulty = 'normal') {
        this.vehicle = vehicle;
        this.difficulty = difficulty;
        this.targetPoint = null;
        this.rawPath = trackPath; // Cache the raw path reference
        this.trackPath = this.processTrackPath(trackPath);
        this.lookAheadDistance = this.getDifficultyParam('lookAhead');
        this.reactionTime = this.getDifficultyParam('reaction');
        this.skillLevel = this.getDifficultyParam('skill');
        this.itemUsageChance = this.getDifficultyParam('itemUsage');
        this.rubberBanding = this.getDifficultyParam('rubberBand');
        
        this.currentTargetIndex = 0;
        this.stuckTimer = 0;
        this.lastPosition = null;
        this.itemCooldown = 0;
        this.avoidanceDirection = 0;
    }
    
    getDifficultyParam(param) {
        const params = {
            easy: { lookAhead: 6, reaction: 0.3, skill: 0.5, itemUsage: 0.4, rubberBand: 0.3 },
            normal: { lookAhead: 8, reaction: 0.2, skill: 0.7, itemUsage: 0.6, rubberBand: 0.2 },
            hard: { lookAhead: 10, reaction: 0.1, skill: 0.85, itemUsage: 0.8, rubberBand: 0.1 },
            expert: { lookAhead: 12, reaction: 0.05, skill: 0.95, itemUsage: 0.95, rubberBand: 0.05 }
        };
        
        return params[this.difficulty]?.[param] || params.normal[param];
    }
    
    setTrackPath(path) {
        // Only reprocess if path changed (avoid doing this every frame)
        if (this.rawPath === path) return;
        this.rawPath = path;
        this.trackPath = this.processTrackPath(path);
    }
    
    processTrackPath(path) {
        if (!path) {
            console.warn('AI: No track path provided');
            return null;
        }
        
        if (path.getPoints) {
            const points = path.getPoints(100);
            console.log('AI: Processed track path with', points.length, 'waypoints');
            return points.map((p, i) => ({
                position: p.clone(), // Clone to avoid reference issues
                tangent: path.getTangentAt(i / points.length)
            }));
        }
        
        if (Array.isArray(path)) {
            console.log('AI: Using array track path with', path.length, 'waypoints');
            return path;
        }
        
        console.warn('AI: Unknown track path format');
        return null;
    }
    
    update(deltaTime, context) {
        this.vehicle.input.accelerate = true;
        this.vehicle.input.brake = false;
        this.vehicle.input.left = false;
        this.vehicle.input.right = false;
        
        if (!this.trackPath || this.trackPath.length === 0) {
            // No track path - just drive forward
            console.warn('AI has no track path!');
            return;
        }
        
        this.checkStuck(deltaTime);
        this.updateTargetPoint();
        this.steerTowardsTarget(deltaTime);
        this.decideAcceleration(deltaTime);
        this.decideDrifting();
        
        if (context && context.allRacers) {
            this.decideItemUsage(deltaTime, context.allRacers, context.itemBoxes);
            this.applyRubberBanding(context.allRacers);
        }
    }
    
    checkStuck(deltaTime) {
        if (this.lastPosition) {
            const moved = this.vehicle.position.distanceTo(this.lastPosition);
            if (moved < 0.5 && this.vehicle.currentSpeed < 5) {
                this.stuckTimer += deltaTime;
                
                if (this.stuckTimer > 2) {
                    this.vehicle.input.brake = true;
                    this.vehicle.input.accelerate = false;
                    this.vehicle.input.left = Math.random() > 0.5;
                    this.vehicle.input.right = !this.vehicle.input.left;
                    
                    if (this.stuckTimer > 3) {
                        this.stuckTimer = 0;
                    }
                    return;
                }
            } else {
                this.stuckTimer = 0;
            }
        }
        
        this.lastPosition = this.vehicle.position.clone();
    }
    
    steerTowardsTarget(_deltaTime) {
        if (!this.targetPoint) return;
        
        // Get direction to target
        const toTarget = new THREE.Vector3(
            this.targetPoint.x - this.vehicle.position.x,
            0,
            this.targetPoint.z - this.vehicle.position.z
        ).normalize();
        
        // Get current forward direction
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(this.vehicle.quaternion);
        forward.y = 0;
        forward.normalize();
        
        // Calculate cross product to determine turn direction
        const cross = forward.clone().cross(toTarget);
        const dot = forward.dot(toTarget);
        
        // Apply steering based on angle difference
        const turnAmount = cross.y;
        const threshold = 0.05;
        
        if (turnAmount > threshold) {
            this.vehicle.input.left = true;
            this.vehicle.input.right = false;
        } else if (turnAmount < -threshold) {
            this.vehicle.input.right = true;
            this.vehicle.input.left = false;
        }
        
        // Slow down for sharp turns
        if (dot < 0.7 && this.vehicle.currentSpeed > 30) {
            this.vehicle.input.brake = true;
            this.vehicle.input.accelerate = false;
        }
    }
    
    updateTargetPoint() {
        const closestInfo = this.getClosestTrackInfo();
        if (!closestInfo) return;
        
        let closestDist = Infinity;
        let closestIndex = 0;
        
        for (let i = 0; i < this.trackPath.length; i++) {
            const dist = this.vehicle.position.distanceTo(this.trackPath[i].position);
            if (dist < closestDist) {
                closestDist = dist;
                closestIndex = i;
            }
        }
        
        const baseLookAhead = this.lookAheadDistance + this.vehicle.currentSpeed * 0.15;
        const maxLookAhead = Math.max(4, Math.floor(this.trackPath.length * 0.08));
        let lookAheadSegments = Math.min(Math.floor(baseLookAhead), maxLookAhead);
        
        // Edge avoidance: reduce lookahead and bias toward center when near border
        const trackWidth = 9;
        if (closestInfo.lateralDistance > trackWidth * 0.8) {
            lookAheadSegments = Math.max(3, Math.floor(lookAheadSegments * 0.5));
        }
        
        this.currentTargetIndex = (closestIndex + lookAheadSegments) % this.trackPath.length;
        const target = this.trackPath[this.currentTargetIndex].position.clone();
        
        if (closestInfo.lateralDistance > trackWidth * 0.8) {
            const inward = closestInfo.normal.clone().multiplyScalar(-Math.sign(closestInfo.lateralOffset));
            target.add(inward.multiplyScalar(Math.min(3, closestInfo.lateralDistance - trackWidth * 0.7)));
        }
        
        this.targetPoint = target;
    }

    getClosestTrackInfo() {
        if (!this.trackPath || this.trackPath.length === 0) return null;
        
        let closestIndex = 0;
        let minDist = Infinity;
        
        for (let i = 0; i < this.trackPath.length; i++) {
            const dist = this.vehicle.position.distanceTo(this.trackPath[i].position);
            if (dist < minDist) {
                minDist = dist;
                closestIndex = i;
            }
        }
        
        const closest = this.trackPath[closestIndex];
        const tangent = closest.tangent ? closest.tangent.clone() : new THREE.Vector3(0, 0, 1);
        tangent.y = 0;
        if (tangent.lengthSq() === 0) tangent.set(0, 0, 1);
        tangent.normalize();
        
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        const toVehicle = this.vehicle.position.clone().sub(closest.position);
        toVehicle.y = 0;
        const lateralOffset = toVehicle.dot(normal);
        const lateralDistance = Math.abs(lateralOffset);
        
        return { index: closestIndex, point: closest.position, tangent, normal, lateralOffset, lateralDistance };
    }
    
    decideAcceleration(_deltaTime) {
        this.vehicle.input.accelerate = true;
        this.vehicle.input.brake = false;
        
        if (this.isApproachingSharpTurn()) {
            if (this.vehicle.currentSpeed > 40) {
                this.vehicle.input.brake = true;
                this.vehicle.input.accelerate = false;
            }
        }
    }
    
    decideSteering(_deltaTime, _trackData) {
        if (!this.targetPoint) return;
        
        const toTarget = this.targetPoint.clone().sub(this.vehicle.position);
        toTarget.y = 0;
        toTarget.normalize();
        
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(this.vehicle.quaternion);
        forward.y = 0;
        forward.normalize();
        
        const cross = forward.clone().cross(toTarget);
        const dot = forward.dot(toTarget);
        const angle = Math.atan2(cross.y, dot);
        
        const errorAngle = (1 - this.skillLevel) * (Math.random() - 0.5) * 0.3;
        const adjustedAngle = angle + errorAngle;
        
        const steerThreshold = 0.1;
        
        this.vehicle.input.left = false;
        this.vehicle.input.right = false;
        
        if (adjustedAngle > steerThreshold) {
            this.vehicle.input.left = true;
        } else if (adjustedAngle < -steerThreshold) {
            this.vehicle.input.right = true;
        }
    }
    
    decideDrifting() {
        if (this.skillLevel < 0.5) return;
        
        if (this.isInLongTurn() && this.vehicle.currentSpeed > 35) {
            if (!this.vehicle.isDrifting) {
                this.vehicle.input.drift = true;
            } else {
                this.vehicle.input.drift = true;
            }
        } else {
            if (this.vehicle.isDrifting && this.vehicle.driftLevel >= 1) {
                this.vehicle.input.drift = false;
            }
        }
    }
    
    decideItemUsage(deltaTime, allRacers, _itemBoxes) {
        this.itemCooldown -= deltaTime;
        
        if (this.vehicle.items.length === 0 || this.itemCooldown > 0) return;
        
        if (Math.random() > this.itemUsageChance) return;
        
        const item = this.vehicle.items[0];
        let shouldUse = false;
        
        switch (item.type) {
            case 'trap': {
                const behind = this.getRacerBehind(allRacers);
                if (behind && behind.distance < 15) {
                    shouldUse = true;
                }
                break;
            }
                
            case 'projectile':
            case 'homing': {
                const ahead = this.getRacerAhead(allRacers);
                if (ahead && ahead.distance < 30) {
                    shouldUse = true;
                }
                break;
            }
                
            case 'boost':
            case 'boost_unlimited':
                if (!this.isInLongTurn() && this.vehicle.currentSpeed > 30) {
                    shouldUse = true;
                }
                break;
                
            case 'invincibility':
            case 'autopilot':
                if (this.vehicle.racePosition > 4) {
                    shouldUse = true;
                }
                break;
                
            default:
                shouldUse = Math.random() > 0.5;
        }
        
        if (shouldUse) {
            this.vehicle.input.useItem = true;
            this.itemCooldown = 1 + Math.random() * 2;
        } else {
            this.vehicle.input.useItem = false;
        }
    }
    
    isApproachingSharpTurn() {
        if (!this.trackPath || this.trackPath.length < 3) return false;
        
        const current = this.trackPath[this.currentTargetIndex];
        const next = this.trackPath[(this.currentTargetIndex + 10) % this.trackPath.length];
        
        if (current.tangent && next.tangent) {
            const dot = current.tangent.dot(next.tangent);
            return dot < 0.7;
        }
        
        return false;
    }
    
    isInLongTurn() {
        if (!this.trackPath || this.trackPath.length < 3) return false;
        
        const lookAhead = 20;
        let totalTurn = 0;
        
        for (let i = 0; i < lookAhead; i++) {
            const idx = (this.currentTargetIndex + i) % this.trackPath.length;
            const nextIdx = (idx + 1) % this.trackPath.length;
            
            const current = this.trackPath[idx];
            const next = this.trackPath[nextIdx];
            
            if (current.tangent && next.tangent) {
                const dot = current.tangent.dot(next.tangent);
                totalTurn += 1 - dot;
            }
        }
        
        return totalTurn > 0.5;
    }
    
    getRacerAhead(allRacers) {
        let closest = null;
        let minDist = Infinity;
        
        allRacers.forEach(racer => {
            if (racer.vehicle === this.vehicle) return;
            if (racer.vehicle.totalProgress <= this.vehicle.totalProgress) return;
            
            const dist = this.vehicle.position.distanceTo(racer.vehicle.position);
            if (dist < minDist) {
                minDist = dist;
                closest = { racer, distance: dist };
            }
        });
        
        return closest;
    }
    
    getRacerBehind(allRacers) {
        let closest = null;
        let minDist = Infinity;
        
        allRacers.forEach(racer => {
            if (racer.vehicle === this.vehicle) return;
            if (racer.vehicle.totalProgress >= this.vehicle.totalProgress) return;
            
            const dist = this.vehicle.position.distanceTo(racer.vehicle.position);
            if (dist < minDist) {
                minDist = dist;
                closest = { racer, distance: dist };
            }
        });
        
        return closest;
    }
    
    applyRubberBanding(allRacers) {
        const position = this.vehicle.racePosition;
        const totalRacers = allRacers.length;
        
        // Speed adjustment based on position
        if (position <= 2) {
            this.vehicle.speedMultiplier = 1 - this.rubberBanding * 0.1;
        } else if (position >= totalRacers - 2) {
            this.vehicle.speedMultiplier = 1 + this.rubberBanding * 0.15;
        } else {
            this.vehicle.speedMultiplier = 1;
        }
    }
}

export class BattleAI extends RacerAI {
    constructor(vehicle, difficulty = 'normal', battleMode = 'balloon') {
        super(vehicle, null, difficulty);
        this.battleMode = battleMode;
        this.targetEnemy = null;
        this.fleeTimer = 0;
    }
    
    update(deltaTime, context) {
        this.vehicle.input.accelerate = true;
        this.vehicle.input.brake = false;
        this.vehicle.input.left = false;
        this.vehicle.input.right = false;
        
        // Find target or flee
        this.updateBattleStrategy(deltaTime, context);
        
        // Move towards target or away from threat
        if (this.targetEnemy) {
            this.moveTowardsTarget(deltaTime);
        } else {
            this.wander(deltaTime);
        }
        
        // Use items
        this.decideItemUsage(deltaTime, context?.allPlayers || [], []);
    }
    
    updateBattleStrategy(deltaTime, context) {
        if (!context?.allPlayers) return;
        
        // Find nearest enemy
        let nearest = null;
        let minDist = Infinity;
        
        context.allPlayers.forEach(player => {
            if (player.vehicle === this.vehicle) return;
            
            const dist = this.vehicle.position.distanceTo(player.vehicle.position);
            if (dist < minDist) {
                minDist = dist;
                nearest = player;
            }
        });
        
        if (nearest && minDist < 50) {
            this.targetEnemy = nearest;
        } else {
            this.targetEnemy = null;
        }
    }
    
    moveTowardsTarget(_deltaTime) {
        if (!this.targetEnemy) return;
        
        const toTarget = this.targetEnemy.vehicle.position.clone().sub(this.vehicle.position);
        toTarget.y = 0;
        toTarget.normalize();
        
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(this.vehicle.quaternion);
        forward.y = 0;
        forward.normalize();
        
        const cross = forward.clone().cross(toTarget);
        const angle = Math.atan2(cross.y, forward.dot(toTarget));
        
        if (angle > 0.1) {
            this.vehicle.input.left = true;
        } else if (angle < -0.1) {
            this.vehicle.input.right = true;
        }
    }
    
    wander(_deltaTime) {
        // Random movement
        if (Math.random() < 0.02) {
            this.vehicle.input.left = Math.random() > 0.5;
            this.vehicle.input.right = !this.vehicle.input.left;
        }
    }
}

export default RacerAI;
