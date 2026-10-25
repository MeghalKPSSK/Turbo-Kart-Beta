import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GRADE_PACE, RIVAL_PROFILES, ROAD_RIVALS, ROAD_VEHICLES } from '../data/roadRacing';
import { TrackModel } from '../physics/trackModel.js';
import { PhysicsWorld, FIXED_DT } from '../physics/trackWorld.js';
import { Vehicle } from '../physics/vehicle.js';
import { buildVehicleSpec } from '../physics/specs.js';
import { ProgressTracker } from '../physics/progress.js';
import { AIDriver } from '../ai/driver.js';
import { CollisionSystem } from './collisions.js';
import { gridSlot, placeOnRoad, recoverVehicle, needsRecovery } from './raceRules.js';
import { createVehicleVisual, updateVehicleVisual } from './vehicleModel.js';
import { CoinField, NitroPickups } from './pickups.js';
import { CameraRig } from './cameraRig.js';
import { ParticlePool } from '../effects/particles.js';
import { NitroEffect, glowTexture } from '../effects/nitroFx.js';
import { SkidMarks } from '../effects/skidMarks.js';
import { GameAudio } from '../audio/gameAudio.js';

const loader = new GLTFLoader();
const modelBase = `${import.meta.env.BASE_URL || '/'}models/blender/`;
const modelCache = new Map();
// Longest frame the loop will simulate in one go (slower machines slow down below 10 fps).
const MAX_FRAME_TIME = 0.1;
const MAX_STEPS_PER_FRAME = Math.ceil(MAX_FRAME_TIME / FIXED_DT);

function loadAsset(filename) {
    if (!modelCache.has(filename)) {
        modelCache.set(filename, loader.loadAsync(`${modelBase}${filename}`).then((result) => result.scene));
    }
    return modelCache.get(filename);
}

let rapierPromise = null;
function loadRapier() {
    if (!rapierPromise) {
        rapierPromise = import('@dimforge/rapier3d-compat').then(async (module) => {
            const RAPIER = module.default ?? module;
            await RAPIER.init();
            return RAPIER;
        });
    }
    return rapierPromise;
}

// Road, ramp and ramp-sidewall triangles of the Blender export become the collision mesh.
function extractRoadGeometry(root) {
    root.updateMatrixWorld(true);
    const positions = [];
    const indices = [];
    const v = new THREE.Vector3();
    root.traverse((object) => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (!materials.some((m) => /Track_Asphalt|JumpRamp_Sidewall/.test(m?.name || ''))) return;
        const geometry = object.geometry;
        const attribute = geometry.attributes.position;
        const offset = positions.length / 3;
        for (let i = 0; i < attribute.count; i += 1) {
            v.fromBufferAttribute(attribute, i).applyMatrix4(object.matrixWorld);
            positions.push(v.x, v.y, v.z);
        }
        if (geometry.index) {
            for (let i = 0; i < geometry.index.count; i += 1) indices.push(geometry.index.getX(i) + offset);
        } else {
            for (let i = 0; i < attribute.count; i += 1) indices.push(i + offset);
        }
    });
    if (!positions.length) throw new Error('The track model has no road surface to collide with.');
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

const PLAYER_GRID_SLOT = 6;
const NITRO_PICKUP_GAIN = 0.35;

export class RoadRaceGame {
    constructor(container, { track, vehicle, paint, upgrades, onReady, onHUD, onFinish, onError }) {
        this.container = container;
        this.trackInfo = track;
        this.vehicleInfo = vehicle;
        this.paint = paint;
        this.upgrades = upgrades || {};
        this.onReady = onReady;
        this.onHUD = onHUD;
        this.onFinish = onFinish;
        this.onError = onError;

        this.racers = [];
        this.player = null;
        this.paused = false;
        this.started = false;
        this.finished = false;
        this.ready = false;
        this.disposed = false;
        this.disposeDone = false;
        this.elapsed = 0;
        this.clock = 0;
        this.accumulator = 0;
        this.stepCount = 0;
        this.hudTimer = 0;
        this.lastFrame = 0;
        this.toast = { text: '', kind: 'info', timer: 0 };
        this.banner = { text: '', sub: '', kind: '', timer: 0 };
        this.finishOrder = [];
        this.input = { accelerate: false, brake: false, left: false, right: false, boost: false, drift: false };
        this.resetCooldown = 0;
        this.score = 0;
        this.coins = 0;
        this.takedowns = 0;
        this.bestLap = null;
        this.lapStart = 0;
        this.driftScore = 0;
        this.trick = { roll: 0, direction: 0, active: false };
        this.damageFlash = 0;
        this.autopilot = null;
        this.eventLog = [];
        this.audio = new GameAudio();
        this.frame = this.frame.bind(this);
        this.resize = this.resize.bind(this);
        this.init().catch((error) => {
            console.error('Road race could not be created.', error);
            this.onError?.(error);
        });
    }

    // ------------------------------------------------------------------------------ setup
    async init() {
        const info = this.trackInfo;
        const [meta, trackScene, RAPIER, vehicleAssets] = await Promise.all([
            fetch(`${modelBase}${info.id}.track.json`).then((response) => {
                if (!response.ok) throw new Error(`Track data unavailable for ${info.name}.`);
                return response.json();
            }),
            loadAsset(`${info.id}.glb`),
            loadRapier(),
            Promise.all(ROAD_VEHICLES.map(async (v) => [v.id, await loadAsset(v.model)]))
        ]);
        if (this.disposed) return;
        if (!meta.route || meta.version < 2) throw new Error(`${info.name} needs its Blender track data rebuilt.`);

        this.vehicleAssets = new Map(vehicleAssets);
        this.model = new TrackModel(meta);
        this.track = this.model;
        this.trackScene = trackScene.clone(true);
        const coinTemplate = this.removeCoinTemplate(this.trackScene);
        const roadGeometry = extractRoadGeometry(this.trackScene);
        this.physics = new PhysicsWorld(RAPIER, this.model, roadGeometry);
        this.collisions = new CollisionSystem(this.physics);
        this.raceLength = info.laps || 3;

        this.createRenderer();
        this.trackScene.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
        });
        const maxAnisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        this.trackScene.traverse((object) => {
            if (!object.isMesh) return;
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
                    if (material?.[key]) material[key].anisotropy = maxAnisotropy;
                }
            }
        });
        this.scene.add(this.trackScene);

        this.glow = glowTexture();
        this.particles = new ParticlePool(this.scene, { max: 1600, additive: true });
        this.smoke = new ParticlePool(this.scene, { max: 900, additive: false });
        this.skids = new SkidMarks(this.scene);
        this.coinField = coinTemplate ? new CoinField(this.scene, this.model, coinTemplate) : null;
        this.nitroPickups = new NitroPickups(this.scene, this.model, this.glow);
        this.cameraRig = new CameraRig(this.camera);

        this.createRacers();
        for (let i = 0; i < 90; i += 1) this.physics.step(); // let the grid settle on its suspension
        for (const racer of this.racers) racer.tracker.reset();
        this.cameraRig.snap(this.player.vehicle.position, this.player.vehicle.forward);
        this.updateVisuals(1, 0);

        this.resizeObserver = new ResizeObserver(this.resize);
        this.resizeObserver.observe(this.container);
        this.lastFrame = performance.now();
        this.animationFrame = requestAnimationFrame(this.frame);
        this.ready = true;
        if (import.meta.env.DEV && typeof window !== 'undefined') window.__trl = { game: this, THREE };
        this.onReady?.({ minimapPath: this.buildMinimapPath() });
        this.publishHUD(true);
    }

    // GLTFLoader strips dots from node names, so Blender's "CoinPickup_Template.003" loads as
    // "CoinPickup_Template003". Match both spellings (and not the "_Mesh" child node).
    removeCoinTemplate(scene) {
        let template = null;
        scene.traverse((object) => {
            if (/^CoinPickup_Template\.?\d*$/.test(object.name)) template = object;
        });
        if (template) template.removeFromParent();
        return template;
    }

    createRenderer() {
        const info = this.trackInfo;
        const width = Math.max(1, this.container.clientWidth);
        const height = Math.max(1, this.container.clientHeight);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        this.renderer.setSize(width, height);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.98;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(info.sky || '#93b9c4');
        this.scene.fog = new THREE.Fog(info.sky || '#93b9c4', 170, 640);
        const room = new RoomEnvironment();
        const generator = new THREE.PMREMGenerator(this.renderer);
        this.environment = generator.fromScene(room, 0.04).texture;
        room.dispose();
        generator.dispose();
        this.scene.environment = this.environment;
        this.scene.environmentIntensity = 0.24;
        this.camera = new THREE.PerspectiveCamera(64, width / height, 0.1, 1900);
        this.scene.add(new THREE.HemisphereLight(0xd8e8f3, 0x45483e, 1.8));
        this.sun = new THREE.DirectionalLight(0xffe1c2, 3.1);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        const extent = 85;
        Object.assign(this.sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 420 });
        this.sun.shadow.bias = -0.0004;
        this.sun.shadow.normalBias = 0.05;
        this.scene.add(this.sun, this.sun.target);
        const fill = new THREE.DirectionalLight(0x9bc8ea, 0.62);
        fill.position.set(120, 58, -130);
        this.scene.add(fill);
    }

    createRacers() {
        const info = this.trackInfo;
        const grade = GRADE_PACE[info.grade] ?? 1;
        const gradeIndex = Object.keys(GRADE_PACE).indexOf(info.grade);
        const power = 0.94 + Math.max(0, gradeIndex) * 0.055;
        const total = ROAD_RIVALS.length + 1;
        let aiIndex = 0;
        for (let slot = 0; slot < total; slot += 1) {
            const isPlayer = slot === PLAYER_GRID_SLOT;
            let vehicleInfo = this.vehicleInfo;
            let paint = this.paint;
            let upgrades = this.upgrades;
            let name = 'YOU';
            let profile = null;
            if (!isPlayer) {
                const rival = ROAD_RIVALS[aiIndex];
                vehicleInfo = ROAD_VEHICLES[(aiIndex * 3 + 1) % ROAD_VEHICLES.length];
                paint = rival.paint;
                upgrades = {};
                name = rival.name;
                profile = RIVAL_PROFILES[aiIndex % RIVAL_PROFILES.length];
                aiIndex += 1;
            }
            const spec = buildVehicleSpec(vehicleInfo, upgrades, { gravity: this.model.gravity, power: isPlayer ? 1 : power });
            const id = isPlayer ? 'player' : `rival_${aiIndex - 1}`;
            const vehicle = new Vehicle(this.physics, spec, { id, name, isPlayer });
            const slotPose = gridSlot(this.model, slot);
            vehicle.place(slotPose.x, slotPose.y + 0.35, slotPose.z, slotPose.forward, 0);
            vehicle.hold = true;
            vehicle.nitro = isPlayer ? 0.3 : 0.2;
            this.physics.addVehicle(vehicle);
            const visual = createVehicleVisual(this.vehicleAssets.get(vehicleInfo.id), { paint, spec });
            this.scene.add(visual.root);
            const tracker = new ProgressTracker(this.model, vehicle);
            const driver = isPlayer ? null : new AIDriver({
                track: this.model, vehicle, tracker, personality: profile, pace: grade, seed: slot + 3
            });
            const nitroFx = new NitroEffect(this.scene, visual, { exhausts: vehicleInfo.dims.exhausts, isPlayer, glow: this.glow });
            const racer = {
                id, name, isPlayer, vehicle, visual, tracker, driver, nitroFx, spec, info: vehicleInfo,
                lap: 1, finished: false, finishTime: null, lastLapTime: 0, laps: [], rank: slot + 1,
                pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
                smokeTimer: 0, wasWrecked: false, crew: isPlayer ? 'GRIDBREAKERS' : ROAD_RIVALS[aiIndex - 1].crew
            };
            this.racers.push(racer);
            if (isPlayer) this.player = racer;
        }
    }

    buildMinimapPath() {
        const track = this.model;
        const points = [];
        const step = Math.max(1, Math.floor(track.count / 110));
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < track.count; i += step) {
            points.push([track.x[i], track.z[i]]);
            minX = Math.min(minX, track.x[i]); maxX = Math.max(maxX, track.x[i]);
            minZ = Math.min(minZ, track.z[i]); maxZ = Math.max(maxZ, track.z[i]);
        }
        const span = Math.max(maxX - minX, maxZ - minZ) || 1;
        this.minimap = { minX, minZ, span, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
        return points.map(([x, z]) => [0.5 + (x - this.minimap.cx) / span * 0.9, 0.5 - (z - this.minimap.cz) / span * 0.9]);
    }

    toMinimap(x, z) {
        const m = this.minimap;
        return [0.5 + (x - m.cx) / m.span * 0.9, 0.5 - (z - m.cz) / m.span * 0.9];
    }

    // ------------------------------------------------------------------------------ control
    ensureAudio() {
        this.audio.ensure();
        this.audio.resume();
    }

    setInput(name, pressed) {
        if (pressed) this.ensureAudio();
        if (name === 'reset') {
            if (pressed) this.requestReset();
            return;
        }
        if (!(name in this.input)) return;
        this.input[name] = pressed;
    }

    setPaused(value) {
        const paused = Boolean(value);
        if (!paused && !this.started) this.startRace();
        this.paused = paused;
        this.lastFrame = performance.now();
        if (paused) Object.keys(this.input).forEach((key) => { this.input[key] = false; });
        this.audio.setMuted(paused);
    }

    startRace() {
        this.started = true;
        for (const racer of this.racers) racer.vehicle.hold = false;
        this.clock = 0;
        this.lapStart = 0;
        this.showToast('GO!', 'good', 1.1);
        this.audio.countdown(true);
    }

    // Test hook: let the AI drive the player's car (profile: aggression 0).
    setAutopilot(enabled, skill = 0.97) {
        if (!enabled) { this.autopilot = null; return; }
        const racer = this.player;
        this.autopilot = new AIDriver({
            track: this.model, vehicle: racer.vehicle, tracker: racer.tracker,
            personality: { aggression: 0, skill }, pace: 1, seed: 99
        });
    }

    requestReset() {
        if (!this.started || this.finished || this.resetCooldown > 0) return;
        this.resetCooldown = 1.5;
        const racer = this.player;
        const { vehicle, tracker } = racer;
        placeOnRoad(this.model, vehicle, tracker.s + 2, Math.max(-6, Math.min(6, tracker.lane)), 0, { ghost: 2.2 });
        tracker.reset();
        this.showToast('BACK ON TRACK', 'info', 1.2);
    }

    showToast(text, kind = 'info', seconds = 1.4) {
        this.toast = { text, kind, timer: seconds };
    }

    showBanner(text, sub = '', kind = 'takedown', seconds = 1.8) {
        this.banner = { text, sub, kind, timer: seconds };
    }

    // ------------------------------------------------------------------------------ main loop
    frame(now) {
        if (this.disposed) return;
        const delta = Math.min(MAX_FRAME_TIME, Math.max(0, (now - this.lastFrame) / 1000));
        this.lastFrame = now;
        this.tick(delta);
        this.renderer.render(this.scene, this.camera);
        this.animationFrame = requestAnimationFrame(this.frame);
    }

    tick(delta) {
        this.clock += delta;
        if (!this.paused && !this.finished) {
            this.accumulator += delta;
            let steps = 0;
            while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
                this.fixedStep();
                this.accumulator -= FIXED_DT;
                steps += 1;
            }
            if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
            this.afterSteps(delta);
        }
        const alpha = this.paused || this.finished ? 1 : this.accumulator / FIXED_DT;
        this.updateVisuals(alpha, this.paused ? 0 : delta);
    }

    // Test hook: simulates `seconds` of game time without requestAnimationFrame, which hidden
    // browser tabs throttle to about 1 fps.
    advance(seconds, { render = true, frameDt = 1 / 60 } = {}) {
        for (let t = 0; t < seconds - 1e-9; t += frameDt) this.tick(frameDt);
        if (render) this.renderer.render(this.scene, this.camera);
    }

    fixedStep() {
        this.stepCount += 1;
        if (this.stepCount % 2 === 0) this.updateControllers(FIXED_DT * 2);
        this.physics.step();
    }

    updateControllers(dt) {
        const ctx = { started: this.started, elapsed: this.elapsed, racers: this.racers, me: null, player: this.player };
        for (const racer of this.racers) racer.tracker.update(dt);
        for (const racer of this.racers) {
            if (racer.isPlayer && this.autopilot) {
                ctx.me = racer;
                this.autopilot.update(dt, ctx);
            } else if (racer.isPlayer) {
                const input = racer.vehicle.input;
                const live = this.started && !this.finished;
                input.throttle = live && this.input.accelerate ? 1 : 0;
                input.brake = live && this.input.brake ? 1 : 0;
                input.steer = live ? (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0) : 0;
                input.nitro = live && this.input.boost;
                input.handbrake = live && this.input.drift;
            } else {
                ctx.me = racer;
                racer.driver.update(dt, ctx);
            }
        }
    }

    afterSteps(dt) {
        if (this.started) this.elapsed += dt;
        this.resetCooldown = Math.max(0, this.resetCooldown - dt);
        this.toast.timer = Math.max(0, this.toast.timer - dt);
        this.banner.timer = Math.max(0, this.banner.timer - dt);
        this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
        this.handleEvents(this.collisions.update(dt));
        this.updateRecovery();
        this.updatePickups();
        this.updateRaceState(dt);
        this.updatePlayerRewards(dt);
        this.nitroPickups.update(dt, this.clock);
        this.coinField?.update(dt, this.clock);
        this.hudTimer -= dt;
        if (this.hudTimer <= 0) {
            this.hudTimer = 1 / 14;
            this.publishHUD();
        }
    }

    // ------------------------------------------------------------------------------ rules
    updateRecovery() {
        for (const racer of this.racers) {
            const { vehicle, tracker } = racer;
            if (needsRecovery(vehicle)) {
                if (vehicle.invalid && import.meta.env.DEV) console.warn(`[physics] ${racer.id} had a non-finite or disabled body; repaired`);
                recoverVehicle(this.model, tracker, vehicle);
                tracker.reset();
                if (racer.isPlayer) this.showToast('BACK IN THE RACE', 'info', 1.2);
            }
            const stranded = tracker.offRoadTime > 3 || vehicle.flippedTime > 2.2;
            if (racer.isPlayer) {
                if (stranded || (this.started && vehicle.stillTime > 4.5 && !vehicle.hold && !this.finished && vehicle.mode === 'ok')) this.requestReset();
            } else if (racer.driver.needsRespawn || stranded) {
                racer.driver.needsRespawn = false;
                placeOnRoad(this.model, vehicle, tracker.s + 6, 0, 18);
                tracker.reset();
            }
        }
    }

    updatePickups() {
        const time = this.clock;
        for (const racer of this.racers) {
            if (racer.vehicle.mode !== 'ok') continue;
            const item = this.nitroPickups.collect(racer.vehicle.position, time);
            if (item) {
                racer.vehicle.nitro = Math.min(1, racer.vehicle.nitro + NITRO_PICKUP_GAIN);
                if (racer.isPlayer) {
                    this.showToast('NITRO CANISTER  +35%', 'nitro', 1.3);
                    this.audio.nitroPickup();
                    this.burst(item.position, 0x4db8ff, 26, 9);
                    this.score += 100;
                }
            }
        }
        if (this.coinField && this.started) {
            const taken = this.coinField.collect(this.player.vehicle.position, time);
            for (const coin of taken) {
                this.coins += 1;
                this.score += 50;
                this.audio.coin();
                this.coinTimer = 0.35;
                this.burst(coin, 0xffd25a, 14, 5);
            }
            if (taken.length) this.showToast(`ROAD COIN${this.coins > 1 ? ` ×${this.coins}` : ''}`, 'coin', 0.9);
        }
    }

    // Sparkle burst of additive particles around a point.
    burst(point, hex, count, speed) {
        const color = new THREE.Color(hex);
        const px = point.x, py = (point.y ?? 0) + (point.isVector3 ? 0 : 0), pz = point.z;
        for (let i = 0; i < count; i += 1) {
            const a = Math.random() * Math.PI * 2;
            const e = Math.random() * 1.2 - 0.2;
            const s = speed * (0.4 + Math.random() * 0.8);
            this.particles.spawn(px, py, pz, Math.cos(a) * s, 2 + e * s * 0.5, Math.sin(a) * s,
                0.5 + Math.random() * 0.4, 0.22, 0.02, 1, color.r, color.g, color.b, 7, 1.2);
        }
    }

    sparks(x, y, z, direction, count, intensity = 1) {
        for (let i = 0; i < count; i += 1) {
            const speed = (4 + Math.random() * 12) * intensity;
            const spread = 0.6;
            this.particles.spawn(x, y, z,
                direction.x * speed + (Math.random() - 0.5) * speed * spread,
                direction.y * speed + 1.5 + Math.random() * 4 * intensity,
                direction.z * speed + (Math.random() - 0.5) * speed * spread,
                0.28 + Math.random() * 0.4, 0.12 + Math.random() * 0.12, 0.02, 1,
                1, 0.55 + Math.random() * 0.4, 0.12, 14, 0.4);
        }
    }

    handleEvents(events) {
        for (const ev of events) {
            if (import.meta.env.DEV) {
                const involvesPlayer = ev.vehicle === this.player.vehicle || ev.a === this.player.vehicle || ev.b === this.player.vehicle
                    || ev.attacker === this.player.vehicle || ev.victim === this.player.vehicle;
                if (involvesPlayer) {
                    this.eventLog.push({ t: +this.elapsed.toFixed(2), type: ev.type, severity: ev.severity && +ev.severity.toFixed(2),
                        impulse: ev.impulseSpeed && +ev.impulseSpeed.toFixed(1), closing: ev.closing && +ev.closing.toFixed(1),
                        hp: +this.player.vehicle.health.toFixed(3), speed: +this.player.vehicle.speedAbs.toFixed(1) });
                    if (this.eventLog.length > 300) this.eventLog.shift();
                }
            }
            if (ev.type === 'wall' || ev.type === 'hazard') {
                const racer = this.racers.find((r) => r.vehicle === ev.vehicle);
                if (!racer) continue;
                const v = ev.vehicle;
                const side = Math.sign(racer.tracker.lane) || 1;
                const out = { x: v.left.x * side, y: 0.1, z: v.left.z * side };
                const kind = ev.type === 'hazard' ? 1.2 : 0.8;
                this.sparks(v.position.x + out.x * 1.15, v.position.y + 0.55, v.position.z + out.z * 1.15,
                    { x: -v.forward.x * 0.4, y: 0.2, z: -v.forward.z * 0.4 }, Math.round(6 + ev.severity * 16), kind);
                if (racer.isPlayer) {
                    this.cameraRig.addShake(0.2 + ev.severity * 0.7);
                    this.damageFlash = Math.min(1, this.damageFlash + ev.severity * 0.7);
                    if (ev.severity > 0.35) this.audio.impact(ev.severity); else this.audio.scrape();
                    if (ev.type === 'hazard') this.showToast(`${ev.hazard?.style ? ev.hazard.style.toUpperCase() : 'OBSTACLE'} HIT`, 'bad', 1.2);
                }
            } else if (ev.type === 'vehicle') {
                const involvesPlayer = ev.a === this.player.vehicle || ev.b === this.player.vehicle;
                this.sparks(ev.point.x, ev.point.y, ev.point.z, { x: 0, y: 0.4, z: 0 }, Math.round(8 + ev.severity * 18), 1.1);
                if (involvesPlayer) {
                    this.cameraRig.addShake(0.15 + ev.severity * 0.6);
                    this.audio.impact(Math.min(1.2, ev.severity));
                    this.damageFlash = Math.min(1, this.damageFlash + ev.severity * 0.5);
                }
            } else if (ev.type === 'takedown') {
                this.onTakedown(ev);
            } else if (ev.type === 'destroyed') {
                const racer = this.racers.find((r) => r.vehicle === ev.vehicle);
                this.explosion(ev.vehicle.position);
                if (racer?.isPlayer) { this.showBanner('WRECKED', 'Your car took too much damage', 'wrecked', 2); this.audio.wrecked(); this.cameraRig.addShake(1); }
            }
        }
    }

    onTakedown(ev) {
        const attacker = this.racers.find((r) => r.vehicle === ev.attacker);
        const victim = this.racers.find((r) => r.vehicle === ev.victim);
        this.explosion(ev.victim.position, 0.7);
        if (attacker?.isPlayer) {
            this.takedowns += 1;
            this.score += 500;
            attacker.vehicle.nitro = Math.min(1, attacker.vehicle.nitro + 0.3);
            this.showBanner('TAKEDOWN!', `${victim?.name ?? 'Rival'} wrecked  +30% nitro`, 'takedown', 2);
            this.audio.takedown();
            this.cameraRig.addShake(0.8);
        } else if (victim?.isPlayer) {
            this.showBanner('TAKEN DOWN', `by ${attacker?.name ?? 'a rival'}`, 'wrecked', 2);
            this.audio.wrecked();
            this.cameraRig.addShake(1);
            this.damageFlash = 1;
        }
    }

    explosion(point, scale = 1) {
        for (let i = 0; i < 26 * scale; i += 1) {
            const a = Math.random() * Math.PI * 2;
            const s = (3 + Math.random() * 9) * scale;
            this.particles.spawn(point.x, point.y + 0.8, point.z, Math.cos(a) * s, 3 + Math.random() * 6, Math.sin(a) * s,
                0.45 + Math.random() * 0.5, 0.4, 0.04, 1, 1, 0.5 + Math.random() * 0.3, 0.1, 9, 1);
        }
        for (let i = 0; i < 14 * scale; i += 1) {
            this.smoke.spawn(point.x + (Math.random() - 0.5), point.y + 0.6, point.z + (Math.random() - 0.5),
                (Math.random() - 0.5) * 4, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 4,
                1.2 + Math.random() * 0.8, 1.2, 4.5, 0.5, 0.2, 0.2, 0.22, -0.3, 0.8);
        }
    }

    updateRaceState(dt) {
        const track = this.model;
        const goal = this.raceLength * track.length;
        for (const racer of this.racers) {
            const lap = Math.min(this.raceLength, Math.max(1, Math.floor(racer.tracker.total / track.length) + 1));
            if (lap > racer.lap) {
                if (racer.isPlayer) {
                    const lapTime = this.elapsed - this.lapStart;
                    this.lapStart = this.elapsed;
                    racer.laps.push(lapTime);
                    this.bestLap = this.bestLap === null ? lapTime : Math.min(this.bestLap, lapTime);
                    this.showToast(`LAP ${lap}`, 'info', 1.2);
                }
                racer.lap = lap;
            }
            if (!racer.finished && racer.tracker.total >= goal && this.started) {
                racer.finished = true;
                racer.finishTime = this.elapsed;
                this.finishOrder.push(racer);
            }
        }
        this.ranking = this.computeRanking();
        if (this.player.finished && !this.finished) this.finishRace();
        void dt;
    }

    computeRanking() {
        const order = [...this.racers];
        order.sort((a, b) => {
            if (a.finished && b.finished) return a.finishTime - b.finishTime;
            if (a.finished) return -1;
            if (b.finished) return 1;
            return b.tracker.total - a.tracker.total;
        });
        order.forEach((racer, index) => { racer.rank = index + 1; });
        return order;
    }

    updatePlayerRewards(dt) {
        const racer = this.player;
        const v = racer.vehicle;
        if (!this.started || this.finished) return;
        // Distance score and clean-driving nitro.
        this.score += Math.max(0, v.speed) * dt * 0.9;
        if (v.speed > 25 && !v.nitroActive) v.nitro = Math.min(1, v.nitro + dt * 0.006);
        if (v.drifting) { this.score += dt * v.speedAbs * 1.6; }
        else if (this.driftWasActive && v.driftCharge > 0.12) {
            const reward = Math.min(0.32, v.driftCharge * 0.34);
            v.nitro = Math.min(1, v.nitro + reward);
            this.score += Math.round(v.driftCharge * 700);
            this.showToast(`DRIFT BONUS  +${Math.round(reward * 100)}% NITRO`, 'nitro', 1.3);
            v.driftCharge = 0;
        }
        if (!v.drifting && !this.driftWasActive) v.driftCharge = Math.max(0, v.driftCharge - dt * 0.4);
        this.driftWasActive = v.drifting;
        this.audioNitroStart = this.audioNitroStart ?? false;
        if (v.nitroActive && !this.audioNitroStart) this.audio.nitroStart();
        this.audioNitroStart = v.nitroActive;

        // Air tricks: steer in mid-air to barrel roll; finish the roll for nitro.
        const air = v.airborne && v.airTime > 0.3;
        const steer = (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0);
        if (air && steer !== 0) { this.trick.roll += steer * 7.2 * dt; this.trick.active = true; }
        if (v.landed) {
            const turns = Math.abs(this.trick.roll) / (Math.PI * 2);
            if (v.lastAirTime > 0.45) {
                this.score += Math.round(v.lastAirTime * 220);
                if (turns >= 0.8) {
                    const bonus = 0.12 + Math.min(2, Math.floor(turns + 0.2)) * 0.1;
                    v.nitro = Math.min(1, v.nitro + bonus);
                    this.score += 600;
                    this.showToast(`BARREL ROLL  +${Math.round(bonus * 100)}% NITRO`, 'nitro', 1.6);
                } else {
                    this.showToast(`AIR ${v.lastAirTime.toFixed(1)}s`, 'good', 1.1);
                }
            }
            this.trick.settle = true;
            this.audio.landing(v.landingImpact / 8);
            this.cameraRig.addShake(Math.min(0.7, v.landingImpact / 14));
            this.dust(v, Math.min(1, v.landingImpact / 9));
        }
        if (!air && this.trick.settle) {
            const target = Math.round(this.trick.roll / (Math.PI * 2)) * Math.PI * 2;
            this.trick.roll += (target - this.trick.roll) * Math.min(1, dt * 18);
            if (Math.abs(target - this.trick.roll) < 0.01) { this.trick.roll = 0; this.trick.settle = false; this.trick.active = false; }
        }
    }

    dust(vehicle, strength) {
        for (const wheel of vehicle.wheels) {
            if (!wheel.grounded) continue;
            for (let i = 0; i < 4 * (1 + strength); i += 1) {
                this.smoke.spawn(wheel.hitPoint.x, wheel.hitPoint.y + 0.1, wheel.hitPoint.z,
                    (Math.random() - 0.5) * 6, 0.8 + Math.random() * 1.8, (Math.random() - 0.5) * 6,
                    0.8 + Math.random() * 0.5, 0.6, 2.4, 0.4, 0.75, 0.72, 0.68, -0.2, 2.2);
            }
        }
    }

    finishRace() {
        this.finished = true;
        const player = this.player;
        const position = player.rank;
        const credits = [900, 650, 480, 350, 250, 180, 120, 80, 50][position - 1] || 40;
        const health = Math.round(player.vehicle.health * 100);
        const cleanBonus = Math.round(health * 0.9);
        const placement = [1500, 1100, 800, 550, 400, 300, 200, 120, 80][position - 1] || 50;
        this.audio.setMuted(true);
        this.publishHUD();
        this.onFinish?.({
            position,
            totalRacers: this.racers.length,
            time: player.finishTime,
            bestLap: this.bestLap,
            credits: credits + cleanBonus + this.coins * 25 + this.takedowns * 60,
            coins: this.coins,
            takedowns: this.takedowns,
            score: Math.round(this.score + placement + cleanBonus * 4),
            damage: 100 - health,
            track: this.trackInfo,
            vehicle: this.vehicleInfo,
            standings: this.ranking.map((racer) => ({ name: racer.name, isPlayer: racer.isPlayer, time: racer.finishTime }))
        });
    }

    // ------------------------------------------------------------------------------ visuals
    updateVisuals(alpha, dt) {
        const time = this.clock;
        for (const racer of this.racers) {
            const { vehicle, visual } = racer;
            vehicle.pose(alpha, racer.pos, racer.quat);
            visual.root.position.copy(racer.pos);
            visual.root.quaternion.copy(racer.quat);
            if (racer.isPlayer && this.trick.roll !== 0) {
                visual.root.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.trick.roll));
            }
            updateVehicleVisual(visual, vehicle, dt || 0.016);
            // Ghost cars (just respawned) blink so they read as intangible.
            visual.root.visible = vehicle.ghostTimer <= 0 || Math.floor(time * 12) % 2 === 0;
            racer.nitroFx.update(dt, time, vehicle, this.camera, this.particles);
            this.emitGroundEffects(racer, dt);
        }
        const p = this.player;
        const sun = this.sun;
        sun.position.set(p.pos.x - 110, p.pos.y + 180, p.pos.z + 70);
        sun.target.position.copy(p.pos);
        const speedRatio = Math.min(1, p.vehicle.speedAbs / (p.spec.engine.topSpeed * 1.2));
        const nitro = p.nitroFx.intensity;
        this.cameraRig.update(dt || 0.016, p.vehicle, p.pos, { nitro, speedRatio });
        if (dt > 0) {
            this.particles.update(dt, this.camera, this.renderer.domElement.clientHeight);
            this.smoke.update(dt, this.camera, this.renderer.domElement.clientHeight);
        }
        // Engine / wind / nitro / squeal audio follows the player's car.
        const v = p.vehicle;
        const slide = Math.min(1, (Math.abs(v.slipAngle) - 0.08) * 3 + (v.drifting ? 0.35 : 0)) * (v.speedAbs > 8 ? 1 : 0);
        this.audio.update({
            rpm: v.rpm, throttle: this.input.accelerate && this.started ? 1 : 0.1, running: !this.paused && !this.finished && this.ready,
            speedRatio, nitro, slip: Math.max(0, slide), airborne: v.airborne
        });
    }

    emitGroundEffects(racer, dt) {
        if (!dt) return;
        const { vehicle } = racer;
        if (vehicle.mode !== 'ok' || vehicle.speedAbs < 9) { for (let i = 2; i < 4; i += 1) this.skids.release(`${racer.id}${i}`); return; }
        const sliding = vehicle.drifting || (Math.abs(vehicle.slipAngle) > 0.16) || (vehicle.input.handbrake && vehicle.speedAbs > 14);
        vehicle.wheels.forEach((wheel, index) => {
            const key = `${racer.id}${index}`;
            if (!wheel.grounded || !sliding || wheel.def.front) { this.skids.release(key); return; }
            this.skids.add(key, wheel.hitPoint, wheel.normal, vehicle.velocity.x, vehicle.velocity.z);
            racer.smokeTimer += dt;
            const rate = racer.isPlayer ? 1 / 46 : 1 / 22;
            if (racer.smokeTimer > rate) {
                racer.smokeTimer = 0;
                this.smoke.spawn(wheel.hitPoint.x, wheel.hitPoint.y + 0.15, wheel.hitPoint.z,
                    -vehicle.velocity.x * 0.08 + (Math.random() - 0.5), 0.6 + Math.random() * 1.2, -vehicle.velocity.z * 0.08 + (Math.random() - 0.5),
                    0.9 + Math.random() * 0.6, 0.7, 3.2, 0.34, 0.86, 0.86, 0.9, -0.15, 1.1);
            }
        });
        if (vehicle.health < 0.3) {
            if (Math.random() < dt * 14) {
                this.smoke.spawn(vehicle.position.x + vehicle.forward.x * 1.4, vehicle.position.y + 0.9, vehicle.position.z + vehicle.forward.z * 1.4,
                    0, 1.6, 0, 1.1, 0.5, 2.6, 0.45, 0.15, 0.15, 0.15, -0.5, 0.3);
            }
        }
    }

    // ------------------------------------------------------------------------------ HUD
    publishHUD(initial = false) {
        const player = this.player;
        if (!player) return;
        const v = player.vehicle;
        const t = player.tracker;
        const ranking = this.ranking || this.computeRanking();
        const leaderboard = ranking.map((racer) => ({
            name: racer.name, isPlayer: racer.isPlayer, place: racer.rank, finished: racer.finished,
            gap: Math.round(racer.tracker.total - t.total), wrecked: racer.vehicle.mode === 'wrecked'
        }));
        const dots = this.racers.map((racer) => ({
            isPlayer: racer.isPlayer, pos: this.toMinimap(racer.vehicle.position.x, racer.vehicle.position.z), wrecked: racer.vehicle.mode === 'wrecked'
        }));
        const topSpeed = player.spec.engine.topSpeed * player.spec.engine.nitroTopSpeed;
        this.onHUD?.({
            loading: initial,
            speed: Math.round(v.speedAbs * 3.6),
            speedRatio: Math.min(1, v.speedAbs / topSpeed),
            gear: v.reversing || v.speed < -0.5 ? 'R' : String(v.gear),
            rpm: v.rpm,
            wrongWay: t.wrongWayTime > 0.8 && this.started,
            reversing: v.speed < -1.5 || v.reversing,
            position: player.rank,
            totalRacers: this.racers.length,
            lap: player.lap,
            totalLaps: this.raceLength,
            time: this.elapsed,
            damage: Math.round((1 - v.health) * 100),
            boost: Math.round(v.nitro * 100),
            nitroActive: v.nitroActive,
            score: Math.round(this.score),
            coins: this.coins,
            takedowns: this.takedowns,
            drifting: v.drifting,
            driftCharge: v.driftCharge,
            airtime: v.airborne && v.airTime > 0.25,
            airTime: v.airborne ? v.airTime : 0,
            recovering: v.mode === 'wrecked',
            ghost: v.ghostTimer > 0,
            progress: Math.max(0, Math.min(1, t.total / (this.raceLength * this.model.length))),
            toast: this.toast.timer > 0 ? { text: this.toast.text, kind: this.toast.kind } : null,
            banner: this.banner.timer > 0 ? { text: this.banner.text, sub: this.banner.sub, kind: this.banner.kind } : null,
            damageFlash: this.damageFlash,
            leaderboard,
            dots,
            started: this.started
        });
    }

    // ------------------------------------------------------------------------------ misc
    resize() {
        if (!this.renderer || !this.camera || !this.container) return;
        const width = Math.max(1, this.container.clientWidth);
        const height = Math.max(1, this.container.clientHeight);
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    // Snapshot used by the automated play-tests.
    debugState() {
        const p = this.player;
        const v = p.vehicle;
        return {
            speedKmh: Math.round(v.speedAbs * 3.6), speed: v.speed, lane: p.tracker.lane, s: p.tracker.s, total: p.tracker.total,
            lap: p.lap, rank: p.rank, grounded: v.groundedCount, airborne: v.airborne, nitro: v.nitro, nitroActive: v.nitroActive,
            health: v.health, coins: this.coins, takedowns: this.takedowns, wrongWay: p.tracker.wrongWayTime, mode: v.mode,
            position: { x: v.position.x, y: v.position.y, z: v.position.z }, up: v.up.y, steerAngle: v.steerAngle,
            drifting: v.drifting, started: this.started, paused: this.paused, finished: this.finished
        };
    }

    // Idempotent and failure-proof: React calls this from an effect cleanup, and an exception
    // there would take the whole UI down with it.
    dispose() {
        if (this.disposeDone) return;
        this.disposeDone = true;
        this.disposed = true;
        const safely = (label, fn) => {
            try { fn(); } catch (error) { console.warn(`[game] cleanup step "${label}" failed`, error); }
        };
        safely('frame', () => cancelAnimationFrame(this.animationFrame));
        safely('resize', () => this.resizeObserver?.disconnect());
        safely('audio', () => this.audio?.dispose());
        safely('debug hook', () => { if (typeof window !== 'undefined' && window.__trl?.game === this) delete window.__trl; });
        for (const racer of this.racers || []) {
            safely('nitro effect', () => racer.nitroFx?.dispose());
            safely('vehicle visual', () => racer.visual?.dispose());
        }
        safely('coins', () => this.coinField?.dispose());
        safely('nitro pickups', () => this.nitroPickups?.dispose());
        safely('particles', () => this.particles?.dispose());
        safely('smoke', () => this.smoke?.dispose());
        safely('skid marks', () => this.skids?.dispose());
        safely('glow texture', () => this.glow?.dispose());
        safely('physics', () => this.physics?.dispose());
        safely('environment', () => this.environment?.dispose());
        safely('renderer', () => {
            if (!this.renderer) return;
            this.renderer.dispose();
            this.renderer.domElement.remove();
        });
        safely('scene', () => this.scene?.clear());
    }
}
