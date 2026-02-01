// ========================================
// TURBO KART RACING - Vehicle Physics
// ========================================

import * as THREE from 'three';
import { GAME_CONSTANTS } from '../constants';
import { CHARACTERS } from '../data/characters';
import { VEHICLES } from '../data/vehicles';
import { audioManager } from './audio';

// Physics World Manager
export class PhysicsWorld {
    constructor() {
        this.bodies = [];
        this.enabled = true;
    }
    
    update(_deltaTime) {
        // Simple physics update - gravity and collisions handled per-vehicle
    }
    
    clear() {
        this.bodies = [];
    }
}

export const physicsWorld = new PhysicsWorld();

// Vehicle Physics Class
export class VehiclePhysics {
    constructor(characterId, vehicleConfig, scene) {
        this.scene = scene;
        this.characterId = characterId;
        this.vehicleConfig = vehicleConfig;
        
        this.stats = this.calculateStats();
        
        // Position and rotation
        this.position = new THREE.Vector3(0, 0.5, 0);
        this.rotation = new THREE.Euler(0, 0, 0);
        this.quaternion = new THREE.Quaternion();
        
        // Velocity
        this.velocity = new THREE.Vector3();
        this.angularVelocity = 0;
        this.currentSpeed = 0;
        this.maxSpeed = GAME_CONSTANTS.PHYSICS.MAX_SPEED_BASE * (1 + this.stats.speed * 0.1);
        this.speedControl = 0.8;
        
        // Physics state
        this.grounded = true;
        this.groundNormal = new THREE.Vector3(0, 1, 0);
        this.onBoostPad = false;
        
        // Track state
        this.isAntiGravity = false;
        this.isUnderwater = false;
        this.isGliding = false;
        
        // Drift state
        this.isDrifting = false;
        this.driftDirection = 0;
        this.driftTime = 0;
        this.driftLevel = 0;
        this.driftAngle = 0;
        
        // Boost state
        this.boostTimer = 0;
        this.boostPower = 1;
        this.speedMultiplier = 1;
        this.nitroCharge = 1;
        this.nitroUseRate = 0.3;
        this.nitroRegenRate = 0.25;
        
        // Coins
        this.coins = 0;
        
        // Status effects
        this.invincible = false;
        this.autopilot = false;
        this.shrunk = false;
        this.inkOnScreen = false;
        this.stunned = false;
        this.stunnedTimer = 0;
        
        // Items
        this.items = [];
        this.maxItems = GAME_CONSTANTS.ITEMS.SLOTS;
        
        // Race progress
        this.racePosition = 1;
        this.lap = 1;
        this.lastCheckpoint = 0;
        this.lapProgress = 0;
        this.totalProgress = 0;
        this.finished = false;
        this.raceTime = 0;
        this.bestLapTime = Infinity;
        this.currentLapTime = 0;
        this.lapTimes = [];
        
        // Input state
        this.input = {
            accelerate: false,
            brake: false,
            left: false,
            right: false,
            drift: false,
            useItem: false,
            lookBack: false,
            boost: false,
        };
        
        // Accessibility
        this.smartSteering = false;
        this.autoAccelerate = false;

        // Unstuck helpers
        this.lastPosition = null;
        this.stuckTimer = 0;
        
        // Sound cooldowns to prevent spamming
        this.soundCooldowns = {
            railingHit: 0,
            carCollision: 0,
            brakeScreech: 0
        };
        this.lastBrakingState = false;
        
        // Create visual mesh
        this.createMesh();
    }
    
    calculateStats() {
        const char = CHARACTERS.getCharacter(this.characterId);
        const body = VEHICLES.getPart('body', this.vehicleConfig.body);
        const wheels = VEHICLES.getPart('wheels', this.vehicleConfig.wheels);
        const glider = VEHICLES.getPart('glider', this.vehicleConfig.glider);
        
        if (!char || !body || !wheels || !glider) {
            return { speed: 3, acceleration: 3, weight: 3, handling: 3, traction: 3 };
        }
        
        const weightMods = GAME_CONSTANTS.WEIGHT_CLASSES[char.weightClass];
        
        return {
            speed: Math.max(1, Math.min(5, 
                (char.stats.speed + body.stats.speed + wheels.stats.speed + glider.stats.speed) * weightMods.speedMod)),
            acceleration: Math.max(1, Math.min(5,
                (char.stats.acceleration + body.stats.acceleration + wheels.stats.acceleration + glider.stats.acceleration) * weightMods.accelMod)),
            weight: Math.max(1, Math.min(5,
                (char.stats.weight + body.stats.weight + wheels.stats.weight + glider.stats.weight) * weightMods.weightMod)),
            handling: Math.max(1, Math.min(5,
                (char.stats.handling + body.stats.handling + wheels.stats.handling + glider.stats.handling) * weightMods.handlingMod)),
            traction: Math.max(1, Math.min(5,
                char.stats.traction + body.stats.traction + wheels.stats.traction + glider.stats.traction))
        };
    }
    
    createMesh() {
        const charColor = CHARACTERS.getColor(this.characterId);
        console.log('Creating F1 vehicle mesh:', { characterId: this.characterId, charColor: charColor?.toString(16) });
        
        // Create F1 car group
        this.mesh = new THREE.Group();
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        // Calculate accent color (complementary/darker shade)
        const color = new THREE.Color(charColor);
        const hsl = {};
        color.getHSL(hsl);
        const accentColor = new THREE.Color().setHSL(
            (hsl.h + 0.55) % 1, // Shift hue for accent
            Math.min(1, hsl.s * 1.1),
            Math.max(0.1, hsl.l * 0.4)
        );
        
        // Materials
        const primaryMaterial = new THREE.MeshStandardMaterial({
            color: charColor,
            metalness: 0.75,
            roughness: 0.25,
            emissive: charColor,
            emissiveIntensity: 0.15
        });
        
        const accentMaterial = new THREE.MeshStandardMaterial({
            color: accentColor,
            metalness: 0.8,
            roughness: 0.2,
            emissive: accentColor,
            emissiveIntensity: 0.1
        });
        
        const carbonMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            metalness: 0.9,
            roughness: 0.15
        });
        
        const whiteMaterial = new THREE.MeshStandardMaterial({
            color: 0xeeeeee,
            metalness: 0.3,
            roughness: 0.4
        });

        // ============ MAIN CHASSIS ============
        // Monocoque/survival cell - sleek tapered shape
        const monocoqueShape = new THREE.Shape();
        monocoqueShape.moveTo(-0.55, 0);
        monocoqueShape.quadraticCurveTo(-0.7, 0.25, -0.5, 0.45);
        monocoqueShape.lineTo(0.5, 0.45);
        monocoqueShape.quadraticCurveTo(0.7, 0.25, 0.55, 0);
        monocoqueShape.lineTo(-0.55, 0);
        
        const monocoqueGeo = new THREE.ExtrudeGeometry(monocoqueShape, { 
            depth: 3.2, 
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 3
        });
        monocoqueGeo.rotateX(Math.PI / 2);
        monocoqueGeo.translate(0, 0.25, -0.1);
        const monocoque = new THREE.Mesh(monocoqueGeo, primaryMaterial);
        monocoque.castShadow = true;
        this.mesh.add(monocoque);

        // ============ NOSE CONE ============
        // Elongated nose with curved profile
        const noseLength = 1.6;
        const noseCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0.35, 3.1),
            new THREE.Vector3(0, 0.32, 3.6),
            new THREE.Vector3(0, 0.25, 4.0),
            new THREE.Vector3(0, 0.18, 4.5)
        ]);
        
        // Nose body
        const noseGeo = new THREE.ConeGeometry(0.4, noseLength, 8, 4);
        noseGeo.rotateX(-Math.PI / 2);
        const nose = new THREE.Mesh(noseGeo, primaryMaterial);
        nose.position.set(0, 0.32, 3.5);
        nose.scale.set(1, 0.7, 1);
        nose.castShadow = true;
        this.mesh.add(nose);
        
        // Nose tip
        const noseTipGeo = new THREE.SphereGeometry(0.12, 8, 6);
        const noseTip = new THREE.Mesh(noseTipGeo, accentMaterial);
        noseTip.position.set(0, 0.22, 4.2);
        noseTip.scale.set(1, 0.6, 1.5);
        this.mesh.add(noseTip);

        // ============ FRONT WING ============
        // Main plane
        const frontWingMainGeo = new THREE.BoxGeometry(2.6, 0.04, 0.35);
        const frontWingMain = new THREE.Mesh(frontWingMainGeo, carbonMaterial);
        frontWingMain.position.set(0, 0.12, 4.1);
        this.mesh.add(frontWingMain);
        
        // Front wing flaps (multiple elements)
        for (let i = 0; i < 3; i++) {
            const flapGeo = new THREE.BoxGeometry(1.0, 0.03, 0.15);
            const flapLeft = new THREE.Mesh(flapGeo, accentMaterial);
            flapLeft.position.set(-0.8, 0.15 + i * 0.04, 3.95 - i * 0.08);
            flapLeft.rotation.x = -0.2 - i * 0.1;
            this.mesh.add(flapLeft);
            
            const flapRight = new THREE.Mesh(flapGeo, accentMaterial);
            flapRight.position.set(0.8, 0.15 + i * 0.04, 3.95 - i * 0.08);
            flapRight.rotation.x = -0.2 - i * 0.1;
            this.mesh.add(flapRight);
        }
        
        // Front wing endplates
        const endPlateShape = new THREE.Shape();
        endPlateShape.moveTo(0, 0);
        endPlateShape.lineTo(0, 0.35);
        endPlateShape.quadraticCurveTo(0.4, 0.3, 0.5, 0.1);
        endPlateShape.lineTo(0.5, 0);
        endPlateShape.lineTo(0, 0);
        
        const endPlateGeo = new THREE.ExtrudeGeometry(endPlateShape, { depth: 0.04, bevelEnabled: false });
        
        const leftEndPlate = new THREE.Mesh(endPlateGeo, primaryMaterial);
        leftEndPlate.position.set(-1.32, 0.08, 3.8);
        leftEndPlate.rotation.y = Math.PI / 2;
        this.mesh.add(leftEndPlate);
        
        const rightEndPlate = new THREE.Mesh(endPlateGeo, primaryMaterial);
        rightEndPlate.position.set(1.28, 0.08, 3.8);
        rightEndPlate.rotation.y = Math.PI / 2;
        this.mesh.add(rightEndPlate);

        // ============ SIDE PODS (PONTOONS) ============
        // Curved side pods with undercut like modern F1
        const sidePodShape = new THREE.Shape();
        sidePodShape.moveTo(0, 0);
        sidePodShape.lineTo(0, 0.5);
        sidePodShape.quadraticCurveTo(0.3, 0.55, 0.55, 0.45);
        sidePodShape.quadraticCurveTo(0.65, 0.3, 0.6, 0);
        sidePodShape.lineTo(0, 0);
        
        const sidePodGeo = new THREE.ExtrudeGeometry(sidePodShape, { 
            depth: 1.8, 
            bevelEnabled: true,
            bevelThickness: 0.03,
            bevelSize: 0.03,
            bevelSegments: 2
        });
        sidePodGeo.rotateX(Math.PI / 2);
        
        const leftPod = new THREE.Mesh(sidePodGeo, primaryMaterial);
        leftPod.position.set(-0.6, 0.2, 0.6);
        leftPod.castShadow = true;
        this.mesh.add(leftPod);
        
        const rightPod = new THREE.Mesh(sidePodGeo, primaryMaterial);
        rightPod.position.set(0.05, 0.2, 0.6);
        rightPod.scale.x = -1;
        rightPod.castShadow = true;
        this.mesh.add(rightPod);
        
        // Side pod inlets (air intakes)
        const inletGeo = new THREE.BoxGeometry(0.15, 0.3, 0.4);
        const leftInlet = new THREE.Mesh(inletGeo, carbonMaterial);
        leftInlet.position.set(-0.95, 0.45, 1.3);
        this.mesh.add(leftInlet);
        
        const rightInlet = new THREE.Mesh(inletGeo, carbonMaterial);
        rightInlet.position.set(0.95, 0.45, 1.3);
        this.mesh.add(rightInlet);

        // ============ COCKPIT & HALO ============
        // Cockpit opening
        const cockpitGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.15, 16, 1, true);
        const cockpitMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.95,
            roughness: 0.05,
            side: THREE.DoubleSide
        });
        const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
        cockpit.position.set(0, 0.55, 1.0);
        this.mesh.add(cockpit);
        
        // Halo device (safety structure)
        const haloCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(-0.35, 0.5, 1.4),
            new THREE.Vector3(-0.25, 0.85, 1.8),
            new THREE.Vector3(0, 0.95, 2.0),
            new THREE.Vector3(0.25, 0.85, 1.8),
            new THREE.Vector3(0.35, 0.5, 1.4)
        ]);
        const haloGeo = new THREE.TubeGeometry(haloCurve, 20, 0.04, 8, false);
        const halo = new THREE.Mesh(haloGeo, carbonMaterial);
        this.mesh.add(halo);
        
        // Halo center pillar
        const haloPillarGeo = new THREE.BoxGeometry(0.06, 0.45, 0.06);
        const haloPillar = new THREE.Mesh(haloPillarGeo, carbonMaterial);
        haloPillar.position.set(0, 0.72, 1.95);
        haloPillar.rotation.x = -0.3;
        this.mesh.add(haloPillar);

        // ============ DRIVER ============
        // Helmet (visible driver)
        const helmetGeo = new THREE.SphereGeometry(0.22, 16, 12);
        const helmetMat = new THREE.MeshStandardMaterial({
            color: charColor,
            metalness: 0.7,
            roughness: 0.25,
            emissive: charColor,
            emissiveIntensity: 0.25
        });
        const helmet = new THREE.Mesh(helmetGeo, helmetMat);
        helmet.position.set(0, 0.72, 1.0);
        helmet.scale.set(1, 0.9, 1.1);
        helmet.castShadow = true;
        this.mesh.add(helmet);
        this.characterMesh = helmet;
        
        // Visor
        const visorGeo = new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI, 0, Math.PI * 0.4);
        const visorMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.95,
            roughness: 0.05,
            transparent: true,
            opacity: 0.85
        });
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 0.75, 1.15);
        visor.rotation.x = -0.3;
        this.mesh.add(visor);

        // ============ ENGINE COVER & AIR INTAKE ============
        // Engine cover (raised section behind driver)
        const engineCoverShape = new THREE.Shape();
        engineCoverShape.moveTo(-0.25, 0);
        engineCoverShape.lineTo(-0.25, 0.4);
        engineCoverShape.quadraticCurveTo(0, 0.5, 0.25, 0.4);
        engineCoverShape.lineTo(0.25, 0);
        engineCoverShape.lineTo(-0.25, 0);
        
        const engineCoverGeo = new THREE.ExtrudeGeometry(engineCoverShape, { 
            depth: 1.2, 
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.02
        });
        engineCoverGeo.rotateX(Math.PI / 2);
        const engineCover = new THREE.Mesh(engineCoverGeo, primaryMaterial);
        engineCover.position.set(0, 0.55, 0.4);
        engineCover.castShadow = true;
        this.mesh.add(engineCover);
        
        // Air intake (shark fin style)
        const intakeGeo = new THREE.BoxGeometry(0.08, 0.6, 0.9);
        const intake = new THREE.Mesh(intakeGeo, accentMaterial);
        intake.position.set(0, 0.95, 0);
        this.mesh.add(intake);
        
        // Roll hoop / air intake scoop
        const rollHoopGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.35, 8);
        const rollHoop = new THREE.Mesh(rollHoopGeo, carbonMaterial);
        rollHoop.position.set(0, 0.88, 0.5);
        this.mesh.add(rollHoop);

        // ============ REAR WING ============
        // Main rear wing element
        const rearWingMainGeo = new THREE.BoxGeometry(1.8, 0.06, 0.3);
        const rearWingMain = new THREE.Mesh(rearWingMainGeo, primaryMaterial);
        rearWingMain.position.set(0, 1.0, -1.3);
        rearWingMain.rotation.x = -0.1;
        this.mesh.add(rearWingMain);
        
        // DRS flap (upper element)
        const drsGeo = new THREE.BoxGeometry(1.7, 0.04, 0.2);
        const drs = new THREE.Mesh(drsGeo, accentMaterial);
        drs.position.set(0, 1.08, -1.25);
        drs.rotation.x = -0.15;
        this.mesh.add(drs);
        
        // Rear wing endplates
        const rearEndPlateShape = new THREE.Shape();
        rearEndPlateShape.moveTo(0, 0);
        rearEndPlateShape.lineTo(0, 0.55);
        rearEndPlateShape.lineTo(0.45, 0.55);
        rearEndPlateShape.lineTo(0.5, 0);
        rearEndPlateShape.lineTo(0, 0);
        
        const rearEndPlateGeo = new THREE.ExtrudeGeometry(rearEndPlateShape, { depth: 0.04, bevelEnabled: false });
        
        const leftRearEndPlate = new THREE.Mesh(rearEndPlateGeo, primaryMaterial);
        leftRearEndPlate.position.set(-0.92, 0.55, -1.5);
        leftRearEndPlate.rotation.y = Math.PI / 2;
        this.mesh.add(leftRearEndPlate);
        
        const rightRearEndPlate = new THREE.Mesh(rearEndPlateGeo, primaryMaterial);
        rightRearEndPlate.position.set(0.88, 0.55, -1.5);
        rightRearEndPlate.rotation.y = Math.PI / 2;
        this.mesh.add(rightRearEndPlate);
        
        // Rear wing supports (swan neck style)
        const supportCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0.5, -0.8),
            new THREE.Vector3(0, 0.85, -1.0),
            new THREE.Vector3(0, 0.95, -1.2)
        ]);
        const supportGeo = new THREE.TubeGeometry(supportCurve, 10, 0.025, 6, false);
        
        const leftSupport = new THREE.Mesh(supportGeo, carbonMaterial);
        leftSupport.position.set(-0.5, 0, 0);
        this.mesh.add(leftSupport);
        
        const rightSupport = new THREE.Mesh(supportGeo, carbonMaterial);
        rightSupport.position.set(0.5, 0, 0);
        this.mesh.add(rightSupport);

        // ============ REAR DIFFUSER ============
        const diffuserGeo = new THREE.BoxGeometry(1.2, 0.08, 0.6);
        const diffuser = new THREE.Mesh(diffuserGeo, carbonMaterial);
        diffuser.position.set(0, 0.12, -1.5);
        diffuser.rotation.x = 0.3;
        this.mesh.add(diffuser);

        // ============ FLOOR / BARGEBOARD ============
        const floorGeo = new THREE.BoxGeometry(1.8, 0.03, 2.5);
        const floor = new THREE.Mesh(floorGeo, carbonMaterial);
        floor.position.set(0, 0.1, 0.5);
        this.mesh.add(floor);

        // ============ WHEELS ============
        // Modern F1-style wheels with covers
        const wheelRadius = 0.38;
        const wheelWidth = 0.28;
        
        // Wheel geometry
        const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
        const tireMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.95,
            metalness: 0.05
        });
        
        // Rim with spokes
        const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.65, wheelRadius * 0.65, wheelWidth + 0.02, 24);
        const rimMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            metalness: 0.85,
            roughness: 0.2
        });
        
        // Rim center cap
        const capGeo = new THREE.CylinderGeometry(wheelRadius * 0.25, wheelRadius * 0.25, 0.06, 16);
        
        // Green tire markings (like intermediate tires)
        const markerGeo = new THREE.TorusGeometry(wheelRadius - 0.02, 0.015, 8, 24);
        const markerMat = new THREE.MeshStandardMaterial({
            color: 0x00ff44,
            emissive: 0x00ff44,
            emissiveIntensity: 0.3
        });
        
        this.wheels = [];
        const wheelPositions = [
            { x: -1.0, y: wheelRadius, z: 2.8, scale: 0.95 },   // Front left
            { x: 1.0, y: wheelRadius, z: 2.8, scale: 0.95 },    // Front right
            { x: -1.05, y: wheelRadius * 1.1, z: -1.0, scale: 1.1 },  // Rear left
            { x: 1.05, y: wheelRadius * 1.1, z: -1.0, scale: 1.1 }    // Rear right
        ];
        
        wheelPositions.forEach((pos, i) => {
            const wheelGroup = new THREE.Group();
            
            // Tire
            const tire = new THREE.Mesh(wheelGeo, tireMat);
            tire.rotation.z = Math.PI / 2;
            tire.castShadow = true;
            wheelGroup.add(tire);
            
            // Rim
            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.rotation.z = Math.PI / 2;
            wheelGroup.add(rim);
            
            // Center cap with team color
            const cap = new THREE.Mesh(capGeo, primaryMaterial);
            cap.rotation.z = Math.PI / 2;
            cap.position.x = pos.x > 0 ? wheelWidth * 0.5 : -wheelWidth * 0.5;
            wheelGroup.add(cap);
            
            // Green tire marker
            const marker = new THREE.Mesh(markerGeo, markerMat);
            marker.rotation.y = Math.PI / 2;
            marker.position.x = pos.x > 0 ? wheelWidth * 0.35 : -wheelWidth * 0.35;
            wheelGroup.add(marker);
            
            wheelGroup.position.set(pos.x, pos.y, pos.z);
            wheelGroup.scale.setScalar(pos.scale);
            
            this.mesh.add(wheelGroup);
            this.wheels.push(wheelGroup);
        });

        // ============ WHEEL FAIRINGS (COVERS) ============
        // Front wheel fairings
        const frontFairingGeo = new THREE.BoxGeometry(0.08, 0.5, 0.7);
        const leftFrontFairing = new THREE.Mesh(frontFairingGeo, accentMaterial);
        leftFrontFairing.position.set(-0.72, 0.35, 2.8);
        this.mesh.add(leftFrontFairing);
        
        const rightFrontFairing = new THREE.Mesh(frontFairingGeo, accentMaterial);
        rightFrontFairing.position.set(0.72, 0.35, 2.8);
        this.mesh.add(rightFrontFairing);

        // ============ SUSPENSION ARMS ============
        // Simplified visible suspension
        const suspArmGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6);
        
        // Front suspension
        [-1, 1].forEach(side => {
            const upperArm = new THREE.Mesh(suspArmGeo, carbonMaterial);
            upperArm.position.set(side * 0.65, 0.35, 2.6);
            upperArm.rotation.z = side * 0.5;
            this.mesh.add(upperArm);
            
            const lowerArm = new THREE.Mesh(suspArmGeo, carbonMaterial);
            lowerArm.position.set(side * 0.65, 0.2, 2.6);
            lowerArm.rotation.z = side * 0.3;
            this.mesh.add(lowerArm);
        });

        // ============ GLIDER (HIDDEN BY DEFAULT) ============
        const gliderGeometry = new THREE.PlaneGeometry(3.5, 2);
        const gliderMaterial = new THREE.MeshStandardMaterial({
            color: charColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
            emissive: charColor,
            emissiveIntensity: 0.1
        });
        this.gliderMesh = new THREE.Mesh(gliderGeometry, gliderMaterial);
        this.gliderMesh.position.set(0, 1.2, -0.5);
        this.gliderMesh.rotation.x = -0.3;
        this.gliderMesh.visible = false;
        this.mesh.add(this.gliderMesh);
        
        // Add to scene
        if (this.scene) {
            this.scene.add(this.mesh);
        }
    }
    
    handleInput(inputState, _deltaTime) {
        this.input.accelerate = inputState.accelerate || false;
        this.input.brake = inputState.brake || false;
        this.input.left = inputState.left || false;
        this.input.right = inputState.right || false;
        this.input.drift = inputState.drift || false;
        this.input.useItem = inputState.item || inputState.useItem || false;
        this.input.lookBack = inputState.lookBack || false;
        this.input.boost = inputState.boost || false;
    }
    
    update(deltaTime, trackData) {
        if (this.stunned) {
            this.updateStunned(deltaTime);
            return;
        }
        
        if (this.autoAccelerate) {
            this.input.accelerate = true;
        }
        
        if (this.isGliding) {
            this.updateGliding(deltaTime, trackData);
        } else if (this.isUnderwater) {
            this.updateUnderwater(deltaTime, trackData);
        } else if (this.isAntiGravity) {
            this.updateAntiGravity(deltaTime, trackData);
        } else {
            this.updateNormal(deltaTime, trackData);
        }
        
        // Update boost
        if (this.boostTimer > 0) {
            this.boostTimer -= deltaTime;
            if (this.boostTimer <= 0) {
                this.boostPower = 1;
            }
        }
        
        // Update visual elements
        this.updateVisuals(deltaTime);
        
        // Validate position before updating mesh
        if (!Number.isFinite(this.position.x) || !Number.isFinite(this.position.y) || !Number.isFinite(this.position.z)) {
            console.warn('Invalid position detected, resetting');
            this.position.set(0, 0.5, 0);
            this.velocity.set(0, 0, 0);
            this.currentSpeed = 0;
        }
        
        // Update mesh position/rotation
        this.mesh.position.copy(this.position);
        this.mesh.quaternion.copy(this.quaternion);
        
        // Update race time
        if (!this.finished) {
            this.raceTime += deltaTime;
            this.currentLapTime += deltaTime;
        }
    }
    
    updateNormal(deltaTime, _trackData) {
        const physics = GAME_CONSTANTS.PHYSICS;
        
        // Update sound cooldowns
        if (this.soundCooldowns) {
            Object.keys(this.soundCooldowns).forEach(key => {
                if (this.soundCooldowns[key] > 0) {
                    this.soundCooldowns[key] -= deltaTime;
                }
            });
        }
        
        // Nitro handling
        if (!Number.isFinite(this.nitroCharge)) {
            this.nitroCharge = 1;
        }
        let nitroMultiplier = 1;
        if (this.input.boost && this.nitroCharge > 0) {
            nitroMultiplier = 1.2;
            this.nitroCharge = Math.max(0, this.nitroCharge - this.nitroUseRate * deltaTime);
        } else {
            this.nitroCharge = Math.min(1, this.nitroCharge + this.nitroRegenRate * deltaTime);
        }
        
        // Acceleration
        const accelForce = physics.ACCELERATION_BASE * (1 + this.stats.acceleration * 0.15);
        const effectiveMaxSpeed = this.maxSpeed * this.speedControl * this.speedMultiplier * this.boostPower * nitroMultiplier *
            (1 + this.coins * physics.COIN_SPEED_BONUS);
        
        if (this.input.accelerate && !this.input.brake) {
            this.currentSpeed += accelForce * nitroMultiplier * deltaTime;
        } else if (this.input.brake) {
            this.currentSpeed -= physics.BRAKE_FORCE * deltaTime;
            
            // Play brake screech sound when braking at speed (only for player)
            if (this.isPlayer && Math.abs(this.currentSpeed) > 10) {
                if (!this.soundCooldowns) {
                    this.soundCooldowns = { brakeScreech: 0, railingHit: 0, carCollision: 0 };
                }
                if (!this.soundCooldowns.brakeScreech || this.soundCooldowns.brakeScreech <= 0) {
                    audioManager.playSound('brake_screech');
                    this.soundCooldowns.brakeScreech = 0.6; // Cooldown between screeches
                }
            }
        } else {
            this.currentSpeed *= Math.pow(physics.FRICTION_GROUND, deltaTime * 60);
        }
        
        // Clamp speed
        this.currentSpeed = Math.max(-effectiveMaxSpeed * 0.3, Math.min(effectiveMaxSpeed, this.currentSpeed));
        
        // Steering
        let turnRate = physics.TURN_SPEED_BASE * (1 + this.stats.handling * 0.15);
        
        const speedRatio = Math.abs(this.currentSpeed) / effectiveMaxSpeed;
        const speedFactor = 1 - speedRatio * 0.3;
        turnRate *= speedFactor;
        
        // Drift handling
        if (this.isDrifting) {
            this.updateDrift(deltaTime, turnRate);
        } else {
            const steerInput = (this.input.left ? 1 : 0) + (this.input.right ? -1 : 0);
            const targetAngularVelocity = steerInput * turnRate;
            
            const responsiveness = (6 + this.stats.handling * 1.5) * (0.6 + (1 - speedRatio) * 0.6);
            const steerSmoothing = responsiveness * deltaTime;
            this.angularVelocity = this.angularVelocity + (targetAngularVelocity - this.angularVelocity) * steerSmoothing;
            
            // Auto-center when no steering input
            if (steerInput === 0) {
                const damping = Math.min(1, deltaTime * 4);
                this.angularVelocity *= (1 - damping);
            }
            
            // Start drift (Space + steering)
            if (this.input.drift && Math.abs(this.currentSpeed) > 8 && steerInput !== 0) {
                this.startDrift(steerInput); // Drift in the same direction as steering
                // Handbrake effect for tighter drift
                this.currentSpeed *= 0.92;
            }
        }
        
        // Apply rotation
        this.rotation.y += this.angularVelocity * deltaTime;
        this.quaternion.setFromEuler(this.rotation);
        
        // Calculate forward direction
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(this.quaternion);
        
        // Apply velocity
        this.velocity.copy(forward).multiplyScalar(this.currentSpeed);
        
        // Add drift slide
        if (this.isDrifting) {
            const right = new THREE.Vector3(1, 0, 0);
            right.applyQuaternion(this.quaternion);
            this.velocity.add(right.multiplyScalar(this.driftDirection * this.currentSpeed * 0.25));
        }
        
        // Store position before move for boundary enforcement
        const prevPosition = this.position.clone();
        
        // Update position
        this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        
        // Track boundary collision - MUST happen before any other position changes
        this.handleTrackBoundary(_trackData);
        
        // Validate position - if somehow NaN or invalid, restore previous
        if (!Number.isFinite(this.position.x) || !Number.isFinite(this.position.z)) {
            this.position.copy(prevPosition);
            this.currentSpeed = Math.min(this.currentSpeed, 5);
        }

        // Unstuck if pinned near border
        this.handleStuck(deltaTime, _trackData);

        // Obstacle collision (trees, cacti, etc.)
        this.handleObstacleCollisions(_trackData);
        
        // Ground collision
        this.handleGroundCollision(deltaTime);
    }

    handleObstacleCollisions(trackData) {
        const obstacles = trackData?.obstacles;
        if (!obstacles || obstacles.length === 0) return;

        const kartRadius = 1.4;
        for (const obstacle of obstacles) {
            if (!obstacle?.position) continue;
            const toKart = this.position.clone().sub(obstacle.position);
            toKart.y = 0;
            const dist = toKart.length();
            const minDist = (obstacle.radius || 1.5) + kartRadius;
            if (dist > 0 && dist < minDist) {
                const push = toKart.normalize().multiplyScalar(minDist - dist + 0.05);
                this.position.add(push);
                this.currentSpeed *= 0.97;
            }
        }
    }

    handleStuck(deltaTime, trackData) {
        if (!trackData?.path) return;

        if (this.lastPosition) {
            const moved = this.position.distanceTo(this.lastPosition);
            if (moved < 0.2 && Math.abs(this.currentSpeed) < 3) {
                this.stuckTimer += deltaTime;
            } else {
                this.stuckTimer = 0;
            }
        }

        if (this.stuckTimer > 1.2) {
            const trackInfo = this.getClosestPointOnTrack(trackData.path);
            if (trackInfo?.tangent) {
                const tangent = trackInfo.tangent.clone();
                tangent.y = 0;
                if (tangent.lengthSq() > 0) {
                    tangent.normalize();
                    // Nudge forward along track
                    this.position.add(tangent.multiplyScalar(0.6));
                    this.currentSpeed = Math.max(this.currentSpeed, 6);
                    this.stuckTimer = 0;
                }
            }
        }

        this.lastPosition = this.position.clone();
    }
    
    handleTrackBoundary(trackData) {
        if (!trackData?.path) return;
        
        const trackInfo = this.getClosestPointOnTrack(trackData.path);
        if (!trackInfo || !trackInfo.point || !trackInfo.tangent) return;
        
        const trackHalfWidth = (trackData.width || 28) * 0.5; // 14 units from center
        const softBoundary = trackHalfWidth - 2.5; // Start gentle push at 11.5 units
        const hardBoundary = trackHalfWidth - 1.0; // Hard limit at 13 units
        
        const tangent = trackInfo.tangent.clone();
        tangent.y = 0;
        const tangentLen = tangent.length();
        if (tangentLen < 0.001) return;
        tangent.divideScalar(tangentLen);
        
        // Track normal (perpendicular)
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
        
        // Vector from track center to vehicle
        const toVehicle = new THREE.Vector3(
            this.position.x - trackInfo.point.x,
            0,
            this.position.z - trackInfo.point.z
        );
        
        // Signed lateral offset
        const lateralOffset = toVehicle.dot(normal);
        const distanceFromCenter = Math.abs(lateralOffset);
        const sideSign = lateralOffset > 0 ? 1 : -1;
        
        // Soft boundary - very gentle push back (almost unnoticeable)
        if (distanceFromCenter > softBoundary && distanceFromCenter <= hardBoundary) {
            const pushStrength = (distanceFromCenter - softBoundary) / (hardBoundary - softBoundary);
            const pushAmount = pushStrength * 0.15; // Very gentle
            
            this.position.x -= normal.x * sideSign * pushAmount;
            this.position.z -= normal.z * sideSign * pushAmount;
            
            // Almost no speed loss in soft zone
            this.currentSpeed *= 0.999;
        }
        
        // Hard boundary - smooth slide along wall with minimal speed loss
        if (distanceFromCenter > hardBoundary) {
            // Calculate how far past the boundary we are
            const overlapAmount = distanceFromCenter - hardBoundary;
            
            // Play railing hit sound when hitting boundary at speed (only for player)
            if (this.isPlayer && Math.abs(this.currentSpeed) > 5) {
                if (!this.soundCooldowns) {
                    this.soundCooldowns = { railingHit: 0, brakeScreech: 0, carCollision: 0 };
                }
                if (!this.soundCooldowns.railingHit || this.soundCooldowns.railingHit <= 0) {
                    audioManager.playSound('railing_hit');
                    this.soundCooldowns.railingHit = 0.4; // Cooldown between hits
                }
            }
            
            // Calculate safe position just inside boundary
            const safeDistance = hardBoundary - 0.3;
            const safeX = trackInfo.point.x + normal.x * sideSign * safeDistance;
            const safeZ = trackInfo.point.z + normal.z * sideSign * safeDistance;
            
            if (Number.isFinite(safeX) && Number.isFinite(safeZ)) {
                // Smooth push back - stronger when further past boundary
                const pushStrength = Math.min(overlapAmount * 0.5 + 0.15, 0.8);
                this.position.x = this.position.x * (1 - pushStrength) + safeX * pushStrength;
                this.position.z = this.position.z * (1 - pushStrength) + safeZ * pushStrength;
                
                // Project velocity onto tangent direction (slide along wall)
                const tangentSpeed = this.velocity.dot(tangent);
                const normalSpeed = this.velocity.dot(normal) * sideSign;
                
                if (Number.isFinite(tangentSpeed)) {
                    // Maintain forward momentum along the wall, remove component into wall
                    // Keep 95% of forward speed, bounce 20% away from wall
                    const bounceAway = Math.max(0, normalSpeed) * -0.2 * sideSign;
                    this.velocity.set(
                        tangent.x * tangentSpeed * 0.95 + normal.x * bounceAway,
                        0,
                        tangent.z * tangentSpeed * 0.95 + normal.z * bounceAway
                    );
                    
                    // Update currentSpeed to match the new velocity
                    this.currentSpeed = tangentSpeed * 0.95;
                }
                
                // Very gentle steer away from wall
                this.angularVelocity -= sideSign * 0.15;
            }
        }
    }
    
    updateDrift(deltaTime, turnRate) {
        const drift = GAME_CONSTANTS.DRIFT;
        
        // Steering during drift
        const baseTurn = this.driftDirection * turnRate * 0.6;
        const steerBonus = (this.input.left ? 0.4 : this.input.right ? -0.4 : 0) * turnRate;
        this.angularVelocity = baseTurn + steerBonus;
        
        // Drift time and level
        this.driftTime += deltaTime;
        
        if (this.driftTime >= drift.MIN_TIME_ULTRA) {
            this.driftLevel = 3;
        } else if (this.driftTime >= drift.MIN_TIME_SUPER) {
            this.driftLevel = 2;
        } else if (this.driftTime >= drift.MIN_TIME_MINI) {
            this.driftLevel = 1;
        }
        
        // End drift when button released
        if (!this.input.drift) {
            this.endDrift();
        }
    }
    
    startDrift(direction) {
        this.isDrifting = true;
        this.driftDirection = direction;
        this.driftTime = 0;
        this.driftLevel = 0;
    }
    
    endDrift() {
        if (this.driftLevel > 0) {
            const drift = GAME_CONSTANTS.DRIFT;
            let boostPower, boostDuration;
            
            switch (this.driftLevel) {
                case 3:
                    boostPower = drift.BOOST_ULTRA;
                    boostDuration = drift.BOOST_DURATION_ULTRA;
                    break;
                case 2:
                    boostPower = drift.BOOST_SUPER;
                    boostDuration = drift.BOOST_DURATION_SUPER;
                    break;
                default:
                    boostPower = drift.BOOST_MINI;
                    boostDuration = drift.BOOST_DURATION_MINI;
            }
            
            this.applyBoost(boostPower, boostDuration);
        }
        
        this.isDrifting = false;
        this.driftDirection = 0;
        this.driftTime = 0;
        this.driftLevel = 0;
    }
    
    applyBoost(power, duration) {
        this.boostPower = power;
        this.boostTimer = duration;
    }
    
    handleGroundCollision(_deltaTime) {
        if (this.position.y < 0.5) {
            this.position.y = 0.5;
            this.grounded = true;
        }
    }
    
    updateStunned(deltaTime) {
        this.stunnedTimer -= deltaTime;
        if (this.stunnedTimer <= 0) {
            this.stunned = false;
        }
        
        // Spin the kart during stun
        this.rotation.y += 10 * deltaTime;
        this.quaternion.setFromEuler(this.rotation);
        this.mesh.quaternion.copy(this.quaternion);
        
        // Slow down
        this.currentSpeed *= 0.95;
    }
    
    updateGliding(deltaTime, _trackData) {
        // Simplified gliding physics
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(this.quaternion);
        
        this.velocity.copy(forward).multiplyScalar(this.currentSpeed * 0.8);
        this.velocity.y -= GAME_CONSTANTS.PHYSICS.GRAVITY * 0.1 * deltaTime;
        
        this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        
        // Check for landing
        if (this.position.y < 1) {
            this.isGliding = false;
            this.gliderMesh.visible = false;
        }
    }
    
    updateUnderwater(deltaTime, trackData) {
        // Similar to normal but slower
        this.updateNormal(deltaTime, trackData);
        this.currentSpeed *= GAME_CONSTANTS.PHYSICS.WATER_SPEED_MODIFIER;
    }
    
    updateAntiGravity(deltaTime, trackData) {
        // Similar to normal with speed boost on bumps
        this.updateNormal(deltaTime, trackData);
    }
    
    updateVisuals(deltaTime) {
        // Rotate wheels
        if (this.wheels) {
            this.wheels.forEach(wheel => {
                wheel.rotation.x += this.currentSpeed * deltaTime * 0.5;
            });
        }
        
        // Tilt during turning
        const targetTilt = this.angularVelocity * 0.1;
        this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, targetTilt, 0.1);
        
        // Show glider
        if (this.gliderMesh) {
            this.gliderMesh.visible = this.isGliding;
        }
        
        // Drift visual feedback - change kart color/emission based on drift level
        if (this.isDrifting && this.driftLevel > 0) {
            const colors = [
                0x4444ff, // Blue (level 1)
                0xff8800, // Orange (level 2)
                0xff00ff  // Purple (level 3)
            ];
            const color = colors[Math.min(this.driftLevel - 1, 2)];
            
            // Update character mesh glow
            if (this.characterMesh?.material) {
                this.characterMesh.material.emissive.setHex(color);
                this.characterMesh.material.emissiveIntensity = 0.5 + this.driftLevel * 0.2;
            }
        } else {
            // Reset to normal
            if (this.characterMesh?.material) {
                this.characterMesh.material.emissive.setHex(this.characterMesh.material.color.getHex());
                this.characterMesh.material.emissiveIntensity = 0.2;
            }
        }
        
        // Boost visual feedback
        if (this.boostTimer > 0) {
            if (this.mesh?.material) {
                this.mesh.material.emissiveIntensity = 0.6;
            }
        } else {
            if (this.mesh?.material) {
                this.mesh.material.emissiveIntensity = 0.3;
            }
        }
    }
    
    spinOut() {
        this.stunned = true;
        this.stunnedTimer = 1.5;
        this.currentSpeed *= 0.3;
    }
    
    addItem(item) {
        if (this.items.length < this.maxItems) {
            this.items.push(item);
            return true;
        }
        return false;
    }
    
    removeFromScene() {
        if (this.scene && this.mesh) {
            this.scene.remove(this.mesh);
        }
    }
    
    getClosestPointOnTrack(trackPath) {
        if (!trackPath || !trackPath.getPoints) return null;
        
        const points = trackPath.getPoints(100);
        if (!points || points.length < 2) return null;
        
        let closest = null;
        let minDist = Infinity;
        let closestIndex = 0;
        
        for (let i = 0; i < points.length; i++) {
            const pt = points[i];
            if (!pt) continue;
            const dx = this.position.x - pt.x;
            const dz = this.position.z - pt.z;
            const dist = dx * dx + dz * dz;
            if (dist < minDist) {
                minDist = dist;
                closest = pt;
                closestIndex = i;
            }
        }
        
        if (!closest) return null;
        
        // Calculate tangent from neighboring points for stability
        const prevIdx = (closestIndex - 1 + points.length) % points.length;
        const nextIdx = (closestIndex + 1) % points.length;
        const prev = points[prevIdx];
        const next = points[nextIdx];
        
        const tangent = new THREE.Vector3(
            next.x - prev.x,
            0,
            next.z - prev.z
        );
        
        const len = tangent.length();
        if (len > 0.001) {
            tangent.divideScalar(len);
        } else {
            tangent.set(0, 0, 1);
        }
        
        return { point: closest.clone(), tangent, index: closestIndex };
    }
}

export default VehiclePhysics;
