import * as THREE from 'three';
import { GROUP, groups } from '../physics/trackWorld.js';
import { quaternionFromForward } from '../physics/vehicle.js';
import { contactShadow } from '../effects/contactShadow.js';

// Road traffic: the obstacles of a race are other vehicles.
//
// * Moving traffic drives the route in lane, slower than the race. Each vehicle is a kinematic
//   body, so it is solid to racers. A hard enough hit knocks it out of lane: it becomes an
//   ordinary rigid body, tumbles away, and a replacement joins the road well ahead.
// * Stalled vehicles stand where the track's fixed hazards were, hazard lights flashing.
//
// Both are reported to the collision rules as hazards, and rivals steer round them through
// `track.traffic` (see ai/driver.js hazardAvoidance).

// Body styles and their sizes in metres. The models are built by
// tools/blender/build_street_cars.py and exported as models/blender/traffic_<kind>.glb.
const KINDS = {
    hatch: { width: 1.81, length: 4.11, height: 1.5 },
    sedan: { width: 1.83, length: 4.69, height: 1.46 },
    van: { width: 1.92, length: 5.0, height: 1.97 },
    truck: { width: 2.4, length: 7.05, height: 3.1 },
    bus: { width: 2.5, length: 10.5, height: 3.02 }
};
const KIND_MIX = ['sedan', 'hatch', 'van', 'sedan', 'truck', 'hatch', 'sedan', 'bus', 'hatch', 'van'];
const PAINTS = [0xe9e9e4, 0x9aa3ab, 0x1c1f24, 0x20365c, 0x8c1f1f, 0xd9a520, 0x3f5d4a, 0xc9c2b2, 0x55606b];
const LANES = [-9.2, -3.2, 3.2, 9.2];

// The model files a race with traffic needs, for the loader.
export const TRAFFIC_MODELS = Object.keys(KINDS).map((kind) => ({ kind, file: `traffic_${kind}.glb` }));

// A civilian vehicle cloned from its model. Returns the group, its wheels (to spin) and its
// own tail-lamp material (stalled vehicles flash it as hazard lights).
function buildVehicle(models, kind, paint, castShadow) {
    const group = models.get(kind).clone(true);
    const colour = new THREE.Color(paint);
    const owned = [];
    let lamps = null;
    const wheels = [];
    group.traverse((child) => {
        if (child.name.startsWith('WheelPivot_')) wheels.push(child);
        if (!child.isMesh) return;
        child.castShadow = castShadow;
        child.receiveShadow = true;
        const name = child.material.name || '';
        if (/VehiclePaint/i.test(name)) {
            child.material = child.material.clone();
            child.material.color.copy(colour);
            owned.push(child.material);
        } else if (/Lamp_Tail/.test(name)) {
            child.material = child.material.clone();
            lamps = child.material;
            owned.push(child.material);
        }
    });
    const size = KINDS[kind];
    group.add(contactShadow(size.width, size.length));
    return { group, wheels, lamps, owned };
}

function seeded(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

// The track's fixed hazards, turned into stalled vehicles of the same footprint the physics
// and the rival AI understand (half = lateral, up, along).
export function stalledVehicles(hazards = []) {
    return hazards.map((hazard, index) => {
        const kind = ['sedan', 'van', 'hatch'][index % 3];
        const size = KINDS[kind];
        return {
            ...hazard, kind, style: 'stalled car', shape: 'box',
            half: [size.width / 2, size.height / 2, size.length / 2], centre: size.height / 2
        };
    });
}

export class TrafficSystem {
    // options: models (kind -> loaded scene), count (moving vehicles), seed, shadows,
    // moving (false = stalled vehicles only)
    constructor(scene, physics, track, { models, count = 8, seed = 1, shadows = true, moving = true } = {}) {
        this.scene = scene;
        this.physics = physics;
        this.track = track;
        this.random = seeded(seed * 7919 + 13);
        this.time = 0;
        this.vehicles = [];
        this.stalled = [];
        this.owned = [];
        this.view = [];
        track.traffic = this.view;

        track.hazards.forEach((hazard, index) => {
            const { group, lamps, owned } = buildVehicle(models, hazard.kind || 'sedan', PAINTS[(index * 3 + 2) % PAINTS.length], shadows);
            group.position.set(hazard.position[0], hazard.position[1], hazard.position[2]);
            group.rotation.y = hazard.yaw;
            scene.add(group);
            this.stalled.push({ group, lamps });
            this.owned.push(...owned);
        });

        if (!moving) return;
        const RAPIER = physics.RAPIER;
        for (let index = 0; index < count; index += 1) {
            const kind = KIND_MIX[index % KIND_MIX.length];
            const size = KINDS[kind];
            const { group, wheels, owned } = buildVehicle(models, kind, PAINTS[Math.floor(this.random() * PAINTS.length)], shadows);
            scene.add(group);
            this.owned.push(...owned);
            const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setCanSleep(false));
            const collider = physics.world.createCollider(
                RAPIER.ColliderDesc.cuboid(size.width / 2, size.height / 2 - 0.12, size.length / 2)
                    .setTranslation(0, size.height / 2 + 0.12, 0)
                    .setDensity(1300 / (size.width * size.height * size.length))
                    .setFriction(0.6).setRestitution(0.15)
                    .setCollisionGroups(groups(GROUP.OBSTACLE, GROUP.VEHICLE | GROUP.GHOST | GROUP.WORLD | GROUP.OBSTACLE)),
                body
            );
            const entry = {
                id: `traffic_${index}`, style: 'traffic', kind, size, group, wheels, body, collider,
                s: 0, lane: LANES[(index * 3 + 1) % LANES.length], speed: 0,
                cruise: (kind === 'bus' || kind === 'truck' ? 19 : 23) + this.random() * 7,
                mode: 'driving', timer: 0, half: [size.width / 2, size.height / 2, size.length / 2],
                target: 0
            };
            // Spread round the lap, keeping the start grid and the first corner clear.
            const usable = track.length - 260;
            entry.s = track.wrapS(140 + (usable * (index + 0.5 + (this.random() - 0.5) * 0.5)) / count);
            entry.speed = entry.cruise;
            entry.target = entry.lane;
            physics.owners.set(collider.handle, { type: 'hazard', hazard: entry });
            this.vehicles.push(entry);
            this.pose(entry, true);
        }
    }

    pose(entry, teleport = false) {
        const point = this.track.roadPoint(entry.s, entry.lane, TrafficSystem._point);
        const rotation = quaternionFromForward(point.tx, point.ty, point.tz);
        const translation = { x: point.x, y: point.y, z: point.z };
        if (teleport) {
            entry.body.setTranslation(translation, true);
            entry.body.setRotation(rotation, true);
        } else {
            entry.body.setNextKinematicTranslation(translation);
            entry.body.setNextKinematicRotation(rotation);
        }
    }

    // One fixed physics step. `playerS` is the player's route distance (replacements join ahead
    // of it); `racers` are the race vehicles, which traffic slows down for like any other road user.
    step(dt, playerS = 0, racers = []) {
        const track = this.track;
        this.view.length = 0;
        for (const entry of this.vehicles) {
            if (entry.mode === 'knocked') {
                entry.timer -= dt;
                if (entry.timer <= 0) this.rejoin(entry, playerS);
                continue;
            }
            // Read the road ahead in this lane: a stalled vehicle or slower traffic.
            const reach = entry.size.length / 2;
            const sameLane = (lane, other) => Math.abs(other - lane) < 2.5;
            const blockedBy = (lane) => {
                let nearest = Infinity;
                let speed = 0;
                for (const hazard of track.hazards) {
                    const gap = track.wrapS(hazard.s - entry.s);
                    if (gap < 60 && Math.abs(hazard.lane - lane) < hazard.half[0] + entry.size.width / 2 + 0.6 && gap < nearest) { nearest = gap; speed = 0; }
                }
                for (const other of this.vehicles) {
                    if (other === entry || other.mode !== 'driving' || !sameLane(lane, other.lane)) continue;
                    const gap = track.wrapS(other.s - entry.s);
                    const behind = track.wrapS(entry.s - other.s);
                    // A vehicle alongside or just behind also makes a lane unusable.
                    if (lane !== entry.target && behind < 16) return { gap: 0, speed: other.speed };
                    if (gap < 55 && gap < nearest) { nearest = gap; speed = other.speed; }
                }
                return nearest === Infinity ? null : { gap: nearest, speed };
            };
            let limit = entry.cruise;
            const ahead = blockedBy(entry.target);
            if (ahead && ahead.speed < entry.cruise - 1.5 && ahead.gap < 48) {
                // Pull out and overtake if a neighbouring lane is clear, as a driver would.
                const index = LANES.indexOf(entry.target);
                const choice = [index - 1, index + 1].filter((i) => i >= 0 && i < LANES.length)
                    .map((i) => LANES[i]).find((lane) => !blockedBy(lane));
                if (choice !== undefined && entry.lane === entry.target) entry.target = choice;
            }
            // Otherwise follow at a safe distance, or stop behind a stalled vehicle.
            const now = blockedBy(entry.target);
            if (now) {
                if (now.gap < 9 + reach * 2) limit = Math.min(limit, now.speed * 0.9);
                else if (now.gap < 30) limit = Math.min(limit, Math.max(now.speed, 3));
            }
            // Change lane smoothly: about one lane width every three seconds.
            entry.lane += Math.max(-2.2 * dt, Math.min(2.2 * dt, entry.target - entry.lane));
            for (const racer of racers) {
                if (racer.eliminated || Math.abs(racer.tracker.lane - entry.lane) > 2.6) continue;
                const gap = track.wrapS(racer.tracker.s - entry.s);
                if (gap < 12 + entry.size.length / 2) limit = Math.min(limit, Math.max(0, racer.vehicle.speed - 2));
                else if (gap < 34) limit = Math.min(limit, Math.max(4, racer.vehicle.speed));
            }
            entry.speed += Math.max(-14 * dt, Math.min(4 * dt, limit - entry.speed));
            entry.s = track.wrapS(entry.s + entry.speed * dt);
            this.pose(entry);
            this.view.push(entry);
        }
    }

    // A racer hit this vehicle hard: it leaves its lane as a free rigid body.
    knock(entry, velocity) {
        if (entry.mode !== 'driving') return;
        const RAPIER = this.physics.RAPIER;
        entry.mode = 'knocked';
        entry.timer = 4.5;
        entry.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        entry.body.enableCcd(true);          // a tumbling van must not tunnel through the road
        entry.body.setLinvel({ x: velocity.x * 0.75, y: 3.5, z: velocity.z * 0.75 }, true);
        entry.body.setAngvel({ x: (this.random() - 0.5) * 3, y: (this.random() - 0.5) * 7, z: (this.random() - 0.5) * 3 }, true);
    }

    rejoin(entry, playerS) {
        const RAPIER = this.physics.RAPIER;
        entry.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        entry.body.enableCcd(false);
        entry.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        entry.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        entry.mode = 'driving';
        entry.speed = entry.cruise;
        // Well ahead of the player, and not on top of another vehicle in the same lane.
        let s = this.track.wrapS(playerS + 260 + this.random() * 220);
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const clear = this.vehicles.every((other) => other === entry || other.mode !== 'driving' || Math.abs(other.lane - entry.lane) > 2.5
                || Math.min(this.track.wrapS(other.s - s), this.track.wrapS(s - other.s)) > 30);
            if (clear) break;
            s = this.track.wrapS(s + 45);
        }
        entry.s = s;
        entry.lane = entry.target;
        this.pose(entry, true);
    }

    // Once per rendered frame: copy physics poses to the models and flash the hazard lights.
    update(dt) {
        this.time += dt;
        for (const entry of this.vehicles) {
            const t = entry.body.translation();
            const r = entry.body.rotation();
            if (!Number.isFinite(t.x + t.y + t.z)) continue;
            entry.group.position.set(t.x, t.y, t.z);
            entry.group.quaternion.set(r.x, r.y, r.z, r.w);
            if (entry.mode === 'driving') for (const wheel of entry.wheels) wheel.rotation.x += (entry.speed / 0.34) * dt;
        }
        // Stalled vehicles flash their tail lamps as hazard lights.
        const flash = Math.floor(this.time * 2.4) % 2 ? 9 : 0.4;
        for (const { lamps } of this.stalled) if (lamps) lamps.emissiveIntensity = flash;
    }

    dispose() {
        for (const entry of this.vehicles) {
            this.scene.remove(entry.group);
            this.physics.owners.delete(entry.collider.handle);
        }
        for (const { group } of this.stalled) this.scene.remove(group);
        for (const material of this.owned) material.dispose();
        this.track.traffic = [];
    }
}

TrafficSystem._point = {};
