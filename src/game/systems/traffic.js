import * as THREE from 'three';
import { GROUP, groups } from '../physics/trackWorld.js';
import { quaternionFromForward } from '../physics/vehicle.js';

// Road traffic: the obstacles of a race are other vehicles.
//
// * Moving traffic drives the route in lane, slower than the race. Each vehicle is a kinematic
//   body, so it is solid to racers. A hard enough hit knocks it out of lane: it becomes an
//   ordinary rigid body, tumbles away, and a replacement joins the road well ahead.
// * Stalled vehicles stand where the track's fixed hazards were, hazard lights flashing.
//
// Both are reported to the collision rules as hazards, and rivals steer round them through
// `track.traffic` (see ai/driver.js hazardAvoidance).

// Body styles: size in metres and the side profile the body is extruded from.
const KINDS = {
    hatch: { width: 1.78, length: 4.0, height: 1.46, wheel: 0.31, axle: 1.25 },
    sedan: { width: 1.84, length: 4.7, height: 1.42, wheel: 0.32, axle: 1.42 },
    van: { width: 1.98, length: 5.2, height: 2.05, wheel: 0.35, axle: 1.6 },
    truck: { width: 2.3, length: 7.0, height: 2.9, wheel: 0.45, axle: 2.2 },
    bus: { width: 2.5, length: 10.5, height: 3.0, wheel: 0.48, axle: 3.2 }
};
const KIND_MIX = ['sedan', 'hatch', 'van', 'sedan', 'truck', 'hatch', 'sedan', 'bus', 'hatch', 'van'];
const PAINTS = [0xe9e9e4, 0x9aa3ab, 0x1c1f24, 0x20365c, 0x8c1f1f, 0xd9a520, 0x3f5d4a, 0xc9c2b2, 0x55606b];
const LANES = [-9.2, -3.2, 3.2, 9.2];

// Side profiles as [distance along the vehicle (0 = rear, 1 = nose), height (0..1)].
const PROFILES = {
    hatch: [[0, 0.2], [0, 0.62], [0.06, 0.94], [0.2, 1], [0.6, 1], [0.76, 0.64], [0.97, 0.56], [1, 0.44], [1, 0.2]],
    sedan: [[0, 0.22], [0, 0.6], [0.15, 0.66], [0.27, 0.98], [0.38, 1], [0.62, 1], [0.76, 0.66], [0.97, 0.58], [1, 0.44], [1, 0.22]],
    van: [[0, 0.16], [0, 0.94], [0.03, 1], [0.8, 1], [0.9, 0.62], [0.99, 0.52], [1, 0.36], [1, 0.16]],
    truck: [[0.72, 0.16], [0.72, 0.74], [0.74, 0.78], [0.9, 0.78], [0.95, 0.52], [1, 0.46], [1, 0.16]],
    bus: [[0, 0.14], [0, 0.96], [0.012, 1], [0.985, 1], [1, 0.9], [1, 0.14]]
};
// Window band as [from, to] along the vehicle and [bottom, top] in height.
const GLASS = {
    hatch: [0.1, 0.72, 0.66, 0.95], sedan: [0.3, 0.72, 0.68, 0.95], van: [0.6, 0.88, 0.62, 0.92],
    truck: [0.76, 0.93, 0.5, 0.72], bus: [0.03, 0.97, 0.5, 0.86]
};

const shared = { geometry: new Map(), glass: null, tyre: null, lamp: null, tail: null, plate: null, cargo: null };

function materials() {
    if (!shared.glass) {
        shared.glass = new THREE.MeshStandardMaterial({ color: 0x0c1218, roughness: 0.12, metalness: 0.7 });
        shared.tyre = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.9 });
        shared.lamp = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff0d6, emissiveIntensity: 4 });
        shared.tail = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 7 });
        shared.plate = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, emissive: 0xffffff, emissiveIntensity: 0.5 });
        shared.cargo = new THREE.MeshStandardMaterial({ color: 0xd8d6cf, roughness: 0.7 });
    }
    return shared;
}

// Extrudes a side profile across the vehicle's width, nose toward +Z, standing on y = 0.
function bodyGeometry(kind) {
    const key = `body:${kind}`;
    if (!shared.geometry.has(key)) {
        const { width, length, height } = KINDS[kind];
        const shape = new THREE.Shape();
        PROFILES[kind].forEach(([along, up], index) => {
            const x = (along - 0.5) * length;
            const y = up * height;
            if (index === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
        });
        shape.closePath();
        const bevel = 0.07;
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 4 });
        geometry.translate(0, 0, -(width - bevel * 2) / 2);
        geometry.rotateY(-Math.PI / 2);     // profile x (rear to nose) becomes +Z
        shared.geometry.set(key, geometry);
    }
    return shared.geometry.get(key);
}

function box(key, x, y, z) {
    if (!shared.geometry.has(key)) shared.geometry.set(key, new THREE.BoxGeometry(x, y, z));
    return shared.geometry.get(key);
}

function wheelGeometry(radius) {
    const key = `wheel:${radius}`;
    if (!shared.geometry.has(key)) {
        const geometry = new THREE.CylinderGeometry(radius, radius, 0.24, 18);
        geometry.rotateZ(Math.PI / 2);
        shared.geometry.set(key, geometry);
    }
    return shared.geometry.get(key);
}

// A civilian vehicle. Returns the group and its hazard-light material (stalled vehicles flash it).
function buildVehicle(kind, paint, castShadow) {
    const size = KINDS[kind];
    const m = materials();
    const group = new THREE.Group();
    const add = (geometry, material, x, y, z) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
    };
    const paintMaterial = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.38, metalness: 0.35 });
    add(bodyGeometry(kind), paintMaterial, 0, 0, 0);
    if (kind === 'truck') {
        // The load box behind the cab.
        add(box('cargo', size.width, size.height * 0.78, size.length * 0.7), m.cargo, 0, size.height * 0.61, -size.length * 0.14);
    }
    const [from, to, bottom, top] = GLASS[kind];
    const glassLength = (to - from) * size.length;
    add(box(`glass:${kind}`, size.width + 0.02, (top - bottom) * size.height, glassLength), m.glass,
        0, (bottom + top) / 2 * size.height, ((from + to) / 2 - 0.5) * size.length);
    for (const z of [size.axle, -size.axle]) {
        for (const side of [1, -1]) add(wheelGeometry(size.wheel), m.tyre, side * (size.width / 2 - 0.03), size.wheel, z);
    }
    // What makes a box read as a vehicle from behind: bumpers, wide tail lights, a rear window
    // and a number plate.
    const tall = kind === 'van' || kind === 'truck' || kind === 'bus';
    const lampY = kind === 'bus' ? 0.75 : size.height * (kind === 'truck' ? 0.2 : tall ? 0.36 : 0.5);
    const rear = -size.length / 2;
    const nose = size.length / 2;
    const hazard = new THREE.MeshStandardMaterial({ color: 0x221500, emissive: 0xffa010, emissiveIntensity: 0 });
    add(box(`bumper:${kind}`, size.width + 0.04, 0.2, 0.16), m.tyre, 0, lampY - 0.28, rear);
    add(box(`bumper:${kind}`, size.width + 0.04, 0.2, 0.16), m.tyre, 0, lampY - 0.28, nose);
    add(box('plate', 0.5, 0.13, 0.05), m.plate, 0, lampY - 0.05, rear - 0.07);
    if (tall && kind !== 'truck') add(box(`rearglass:${kind}`, size.width * 0.74, size.height * 0.26, 0.05), m.glass, 0, size.height * 0.74, rear - 0.06);
    for (const side of [1, -1]) {
        const x = side * (size.width / 2 - 0.3);
        add(box('lamp', 0.36, 0.16, 0.08), m.lamp, x, lampY, nose + 0.04);
        add(tall ? box('tail:tall', 0.16, 0.5, 0.08) : box('tail', 0.46, 0.17, 0.08), m.tail, tall ? side * (size.width / 2 - 0.12) : x, lampY + (tall ? 0.25 : 0), rear - 0.06);
        add(box('blinker', 0.18, 0.16, 0.09), hazard, side * (size.width / 2 - 0.1), lampY + (tall ? 0.62 : 0.17), rear - 0.06);
        add(box('blinker', 0.18, 0.16, 0.09), hazard, side * (size.width / 2 - 0.1), lampY - 0.16, nose + 0.04);
    }
    return { group, hazard, paintMaterial };
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
    // options: count (moving vehicles), seed, shadows, moving (false = stalled vehicles only)
    constructor(scene, physics, track, { count = 8, seed = 1, shadows = true, moving = true } = {}) {
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
            const { group, hazard: blinker, paintMaterial } = buildVehicle(hazard.kind || 'sedan', PAINTS[(index * 3 + 2) % PAINTS.length], shadows);
            group.position.set(hazard.position[0], hazard.position[1], hazard.position[2]);
            group.rotation.y = hazard.yaw;
            scene.add(group);
            this.stalled.push({ group, blinker });
            this.owned.push(blinker, paintMaterial);
        });

        if (!moving) return;
        const RAPIER = physics.RAPIER;
        for (let index = 0; index < count; index += 1) {
            const kind = KIND_MIX[index % KIND_MIX.length];
            const size = KINDS[kind];
            const { group, hazard: blinker, paintMaterial } = buildVehicle(kind, PAINTS[Math.floor(this.random() * PAINTS.length)], shadows);
            scene.add(group);
            this.owned.push(blinker, paintMaterial);
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
                id: `traffic_${index}`, style: 'traffic', kind, size, group, body, collider,
                s: 0, lane: LANES[(index * 3 + 1) % LANES.length], speed: 0,
                cruise: (kind === 'bus' || kind === 'truck' ? 19 : 23) + this.random() * 7,
                mode: 'driving', timer: 0, half: [size.width / 2, size.height / 2, size.length / 2]
            };
            // Spread round the lap, keeping the start grid and the first corner clear.
            const usable = track.length - 260;
            entry.s = track.wrapS(140 + (usable * (index + 0.5 + (this.random() - 0.5) * 0.5)) / count);
            entry.speed = entry.cruise;
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
            // Follow the vehicle ahead in the same lane rather than driving through it.
            let limit = entry.cruise;
            for (const other of this.vehicles) {
                if (other === entry || other.mode !== 'driving' || other.lane !== entry.lane) continue;
                const gap = track.wrapS(other.s - entry.s);
                if (gap < 9 + entry.size.length / 2 + other.size.length / 2) limit = Math.min(limit, other.speed * 0.9);
                else if (gap < 30) limit = Math.min(limit, other.speed);
            }
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
        entry.body.setLinvel({ x: velocity.x * 0.75, y: 3.5, z: velocity.z * 0.75 }, true);
        entry.body.setAngvel({ x: (this.random() - 0.5) * 3, y: (this.random() - 0.5) * 7, z: (this.random() - 0.5) * 3 }, true);
    }

    rejoin(entry, playerS) {
        const RAPIER = this.physics.RAPIER;
        entry.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        entry.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        entry.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        entry.mode = 'driving';
        entry.speed = entry.cruise;
        // Well ahead of the player, and not on top of another vehicle in the same lane.
        let s = this.track.wrapS(playerS + 260 + this.random() * 220);
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const clear = this.vehicles.every((other) => other === entry || other.mode !== 'driving' || other.lane !== entry.lane
                || Math.min(this.track.wrapS(other.s - s), this.track.wrapS(s - other.s)) > 30);
            if (clear) break;
            s = this.track.wrapS(s + 45);
        }
        entry.s = s;
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
        }
        const flash = Math.floor(this.time * 2.4) % 2 ? 7 : 0;
        for (const { blinker } of this.stalled) blinker.emissiveIntensity = flash;
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
