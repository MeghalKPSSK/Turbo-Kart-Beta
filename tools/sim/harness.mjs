// Headless simulation helpers: the same TrackModel / PhysicsWorld / Vehicle code the game
// uses, running in Node against the exported Blender circuits.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import RAPIER from '@dimforge/rapier3d-compat';
import { TrackModel } from '../../src/game/physics/trackModel.js';
import { PhysicsWorld, FIXED_DT } from '../../src/game/physics/trackWorld.js';
import { Vehicle } from '../../src/game/physics/vehicle.js';
import { buildVehicleSpec } from '../../src/game/physics/specs.js';
import { ROAD_VEHICLES } from '../../src/game/data/roadRacing.js';
import { roadGeometryFromGlb } from './glb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const MODELS = resolve(here, '../../public/models/blender');
export { RAPIER, FIXED_DT, ROAD_VEHICLES, buildVehicleSpec, Vehicle, TrackModel };

let initialised = false;
export async function initRapier() {
    if (!initialised) {
        await RAPIER.init();
        initialised = true;
    }
    return RAPIER;
}

export function trackMeta(trackId) {
    const path = resolve(MODELS, `${trackId}.track.json`);
    if (!existsSync(path)) throw new Error(`Missing ${path}`);
    return JSON.parse(readFileSync(path, 'utf8'));
}

export async function loadWorld(trackId, { hazards = true } = {}) {
    await initRapier();
    const meta = trackMeta(trackId);
    if (!hazards) meta.hazards = [];
    const track = new TrackModel(meta);
    const road = roadGeometryFromGlb(resolve(MODELS, `${trackId}.glb`));
    const physics = new PhysicsWorld(RAPIER, track, road);
    return { RAPIER, track, physics, meta };
}

export function vehicleInfo(id) {
    const info = ROAD_VEHICLES.find((v) => v.id === id);
    if (!info) throw new Error(`Unknown vehicle ${id}`);
    return info;
}

// Spawns a car on the road at route distance `s`, `lane` metres left of centre.
export function spawn(world, vehicleId, { s = 20, lane = 0, speed = 0, upgrades = {}, id = vehicleId, pace = 1, power = 1, drop = 0.35 } = {}) {
    const info = vehicleInfo(vehicleId);
    const spec = buildVehicleSpec(info, upgrades, { gravity: world.track.gravity, pace, power });
    const vehicle = new Vehicle(world.physics, spec, { id, name: id });
    const p = world.track.roadPoint(s, lane);
    vehicle.place(p.x, p.y + drop, p.z, { x: p.tx, y: p.ty, z: p.tz }, speed);
    world.physics.addVehicle(vehicle);
    return vehicle;
}

// Advances the simulation. `control(t, step)` runs before every fixed step.
export function run(world, seconds, control) {
    const steps = Math.round(seconds / FIXED_DT);
    for (let i = 0; i < steps; i += 1) {
        control?.(i * FIXED_DT, i);
        world.physics.step();
    }
}

export const kmh = (ms) => Math.round(ms * 3.6);

// Simple pure-pursuit driver used by the physics tests (the real AI lives in src/game/ai).
export function makeBot(world, vehicle, { targetSpeed = 60, lookahead = 0.5, lane = 0 } = {}) {
    const { track } = world;
    const proj = {};
    let hint = -1;
    return {
        proj,
        update() {
            track.project(vehicle.position.x, vehicle.position.z, hint, proj);
            hint = proj.index;
            const ld = Math.max(10, vehicle.speedAbs * lookahead);
            const target = track.roadPoint(proj.s + ld, lane);
            const dx = target.x - vehicle.position.x;
            const dz = target.z - vehicle.position.z;
            const f = vehicle.forward;
            const l = vehicle.left;
            const forwardComponent = dx * f.x + dz * f.z;
            const leftComponent = dx * l.x + dz * l.z;
            const alpha = Math.atan2(leftComponent, Math.max(0.1, forwardComponent));
            const maxSteer = vehicle.spec.tires.maxSteer / (1 + (vehicle.speedAbs / vehicle.spec.tires.steerSpeedRef) ** 2);
            const wheelAngle = Math.atan2(2 * vehicle.spec.wheelbase * Math.sin(alpha), ld);
            vehicle.input.steer = Math.max(-1, Math.min(1, wheelAngle / Math.max(0.09, maxSteer)));
            const error = targetSpeed - vehicle.speed;
            vehicle.input.throttle = error > 0 ? Math.min(1, error * 0.5) : 0;
            vehicle.input.brake = error < -2 ? Math.min(1, (-error - 2) * 0.25) : 0;
            return proj;
        }
    };
}
