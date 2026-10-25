// Rapier-backed static world for one circuit: the exact Blender road/ramp mesh, generated
// shoulders and guard walls along both edges, solid hazards and the start-gate posts.
// Rapier is injected (browser: dynamic import, tests: Node import) so this module has no
// environment dependency of its own.

export const FIXED_DT = 1 / 120;

// Collision group bits. Wheel probes only ever see WORLD.
export const GROUP = { WORLD: 0x0001, OBSTACLE: 0x0002, VEHICLE: 0x0004, GHOST: 0x0008 };
export const groups = (membership, filter) => ((membership & 0xffff) << 16) | (filter & 0xffff);
export const WORLD_ONLY_QUERY = groups(0xffff, GROUP.WORLD);

class MeshBuilder {
    constructor() {
        this.positions = [];
        this.indices = [];
    }

    vertex(x, y, z) {
        this.positions.push(x, y, z);
        return this.positions.length / 3 - 1;
    }

    // Adds a triangle whose normal faces away from `ref` (a point on the solid side).
    triangle(a, b, c, ref) {
        const p = this.positions;
        const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
        const ux = p[b * 3] - ax, uy = p[b * 3 + 1] - ay, uz = p[b * 3 + 2] - az;
        const vx = p[c * 3] - ax, vy = p[c * 3 + 1] - ay, vz = p[c * 3 + 2] - az;
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const facing = nx * (ax - ref[0]) + ny * (ay - ref[1]) + nz * (az - ref[2]);
        if (facing >= 0) this.indices.push(a, b, c);
        else this.indices.push(a, c, b);
    }

    quad(a, b, c, d, ref) {
        this.triangle(a, b, c, ref);
        this.triangle(a, c, d, ref);
    }

    toArrays() {
        return { positions: new Float32Array(this.positions), indices: new Uint32Array(this.indices) };
    }
}

function leftVector(track, i) {
    const flat = Math.hypot(track.tx[i], track.tz[i]) || 1;
    return [track.tz[i] / flat, -track.tx[i] / flat];
}

// Road + ramp triangles from the Blender export, plus level shoulders out to the guard walls
// so a car scraping the barrier still has ground under its wheels.
export function buildGroundGeometry(track, roadGeometry) {
    const builder = new MeshBuilder();
    const base = roadGeometry.positions;
    const baseCount = base.length / 3;
    const hw = track.halfWidth;
    const outer = hw + track.guardrailOffset + 0.7;
    for (const side of [1, -1]) {
        const inner = [];
        const edge = [];
        for (let i = 0; i < track.count; i += 1) {
            const [lx, lz] = leftVector(track, i);
            const y = track.y[i] + 0.065;
            inner.push(builder.vertex(track.x[i] + lx * hw * side, y, track.z[i] + lz * hw * side));
            edge.push(builder.vertex(track.x[i] + lx * outer * side, y, track.z[i] + lz * outer * side));
        }
        for (let i = 0; i < track.count; i += 1) {
            const j = (i + 1) % track.count;
            builder.quad(inner[i], edge[i], edge[j], inner[j], [track.x[i], track.y[i] - 20, track.z[i]]);
        }
    }
    const shoulders = builder.toArrays();
    const positions = new Float32Array(base.length + shoulders.positions.length);
    positions.set(base, 0);
    positions.set(shoulders.positions, base.length);
    const indices = new Uint32Array(roadGeometry.indices.length + shoulders.indices.length);
    indices.set(roadGeometry.indices, 0);
    for (let i = 0; i < shoulders.indices.length; i += 1) {
        indices[roadGeometry.indices.length + i] = shoulders.indices[i] + baseCount;
    }
    return { positions, indices };
}

// Thick, tall barrier on both sides, one vertex ring per route sample.
export function buildWallGeometry(track, { thickness = 0.8, below = 1.5, above = 3.4 } = {}) {
    const builder = new MeshBuilder();
    const innerOffset = track.halfWidth + track.guardrailOffset - 0.1;
    const outerOffset = innerOffset + thickness;
    for (const side of [1, -1]) {
        const rings = [];
        for (let i = 0; i < track.count; i += 1) {
            const [lx, lz] = leftVector(track, i);
            const x = track.x[i];
            const z = track.z[i];
            const y = track.y[i];
            rings.push({
                ib: builder.vertex(x + lx * innerOffset * side, y - below, z + lz * innerOffset * side),
                it: builder.vertex(x + lx * innerOffset * side, y + above, z + lz * innerOffset * side),
                ot: builder.vertex(x + lx * outerOffset * side, y + above, z + lz * outerOffset * side),
                ob: builder.vertex(x + lx * outerOffset * side, y - below, z + lz * outerOffset * side),
                core: [x + lx * (innerOffset + thickness / 2) * side, y + (above - below) / 2, z + lz * (innerOffset + thickness / 2) * side]
            });
        }
        for (let i = 0; i < track.count; i += 1) {
            const a = rings[i];
            const b = rings[(i + 1) % track.count];
            builder.quad(a.ib, a.it, b.it, b.ib, a.core); // face toward the road
            builder.quad(a.it, a.ot, b.ot, b.it, a.core); // top
            builder.quad(a.ot, a.ob, b.ob, b.ot, a.core); // face away from the road
        }
    }
    return builder.toArrays();
}

function yawQuaternion(yaw) {
    return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

function multiplyQuaternion(a, b) {
    return {
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    };
}

function ellipsoidPoints(hx, hy, hz, rings = 8, segments = 12) {
    const points = [];
    for (let r = 0; r <= rings; r += 1) {
        const phi = (Math.PI * r) / rings;
        for (let s = 0; s < segments; s += 1) {
            const theta = (2 * Math.PI * s) / segments;
            points.push(hx * Math.sin(phi) * Math.cos(theta), hy * Math.cos(phi), hz * Math.sin(phi) * Math.sin(theta));
        }
    }
    return new Float32Array(points);
}

// Solid collider matching a hazard's visible Blender mesh (half = lateral, up, along).
export function hazardColliderDesc(RAPIER, hazard) {
    const [hx, hy, hz] = hazard.half;
    let desc;
    let rotation = yawQuaternion(hazard.yaw);
    switch (hazard.shape) {
        case 'box':
            desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
            break;
        case 'cylinder':
            desc = RAPIER.ColliderDesc.cylinder(hy, hx);
            break;
        case 'capsule': {
            // A log lying across the road: capsule axis (local Y) turned onto local X.
            desc = RAPIER.ColliderDesc.capsule(Math.max(0.01, hx - hy), hy);
            rotation = multiplyQuaternion(rotation, { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 });
            break;
        }
        default:
            desc = RAPIER.ColliderDesc.convexHull(ellipsoidPoints(hx, hy, hz)) || RAPIER.ColliderDesc.cuboid(hx, hy, hz);
            break;
    }
    const [x, y, z] = hazard.position;
    return desc
        .setTranslation(x, y + hazard.centre, z)
        .setRotation(rotation)
        .setFriction(0.5)
        .setRestitution(0.18)
        .setCollisionGroups(groups(GROUP.OBSTACLE, GROUP.VEHICLE | GROUP.GHOST));
}

export class PhysicsWorld {
    constructor(RAPIER, track, roadGeometry, { solverIterations = 8 } = {}) {
        this.RAPIER = RAPIER;
        this.track = track;
        this.world = new RAPIER.World({ x: 0, y: -track.gravity, z: 0 });
        this.world.timestep = FIXED_DT;
        this.world.numSolverIterations = solverIterations;
        this.events = new RAPIER.EventQueue(true);
        this.owners = new Map();
        this.impacts = [];
        this.vehicles = [];
        this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
        this.hit = { toi: 0, nx: 0, ny: 1, nz: 0, collider: null };

        const worldGroups = groups(GROUP.WORLD, GROUP.VEHICLE | GROUP.GHOST);
        const ground = buildGroundGeometry(track, roadGeometry);
        this.groundCollider = this.addStatic(RAPIER.ColliderDesc.trimesh(ground.positions, ground.indices)
            .setFriction(1).setRestitution(0).setCollisionGroups(worldGroups), { type: 'ground' });
        const walls = buildWallGeometry(track);
        let wallDesc = RAPIER.ColliderDesc.trimesh(walls.positions, walls.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES);
        wallDesc = wallDesc.setFriction(0.15).setRestitution(0.12).setCollisionGroups(worldGroups);
        this.wallCollider = this.addStatic(wallDesc, { type: 'wall' });

        this.hazardColliders = [];
        for (const hazard of track.hazards) {
            const collider = this.addStatic(hazardColliderDesc(RAPIER, hazard), { type: 'hazard', hazard });
            this.hazardColliders.push(collider);
        }

        // Start gate posts stand inside the corridor.
        if (track.start) {
            const [sx, sy, sz] = track.start.position;
            const [tx, tz] = track.start.tangent;
            const yaw = Math.atan2(tx, tz);
            for (const side of [1, -1]) {
                const offset = (track.halfWidth + 1.2) * side;
                this.addStatic(RAPIER.ColliderDesc.cuboid(0.25, 2.1, 0.3)
                    .setTranslation(sx + tz * offset, sy + 2.1, sz - tx * offset)
                    .setRotation(yawQuaternion(yaw)).setFriction(0.3)
                    .setCollisionGroups(groups(GROUP.OBSTACLE, GROUP.VEHICLE | GROUP.GHOST)), { type: 'gate' });
            }
        }
    }

    addStatic(desc, owner) {
        const collider = this.world.createCollider(desc);
        this.owners.set(collider.handle, owner);
        return collider;
    }

    addVehicle(vehicle) {
        this.vehicles.push(vehicle);
        for (const collider of vehicle.colliders) this.owners.set(collider.handle, { type: 'vehicle', vehicle });
    }

    removeVehicle(vehicle) {
        this.vehicles = this.vehicles.filter((v) => v !== vehicle);
        for (const collider of vehicle.colliders) this.owners.delete(collider.handle);
        this.world.removeRigidBody(vehicle.body);
    }

    // Ray against the static road only. Returns the shared hit object or null.
    probe(ox, oy, oz, dx, dy, dz, maxToi, excludeBody) {
        const ray = this.ray;
        ray.origin.x = ox; ray.origin.y = oy; ray.origin.z = oz;
        ray.dir.x = dx; ray.dir.y = dy; ray.dir.z = dz;
        const result = this.world.castRayAndGetNormal(ray, maxToi, true, undefined, WORLD_ONLY_QUERY, undefined, excludeBody);
        if (!result) return null;
        const hit = this.hit;
        hit.toi = result.timeOfImpact;
        hit.nx = result.normal.x; hit.ny = result.normal.y; hit.nz = result.normal.z;
        hit.collider = result.collider;
        return hit;
    }

    // Height of the road surface below (x, fromY, z), or null when there is no ground.
    groundHeight(x, fromY, z, maxDrop = 60) {
        const hit = this.probe(x, fromY, z, 0, -1, 0, maxDrop);
        return hit ? fromY - hit.toi : null;
    }

    // One fixed physics step for every vehicle. Callers set vehicle inputs beforehand.
    step() {
        for (const v of this.vehicles) v.beforeStep(FIXED_DT);
        this.world.step(this.events);
        const pending = [];
        this.events.drainContactForceEvents((event) => {
            const a = this.owners.get(event.collider1());
            const b = this.owners.get(event.collider2());
            if (!a && !b) return;
            pending.push({ a, b, force: event.totalForceMagnitude() });
        });
        for (const v of this.vehicles) v.afterStep(FIXED_DT);
        // Record what each car was doing *before* this step and how hard the step hit it, so
        // the collision rules judge the impact itself and not the aftermath.
        for (const impact of pending) {
            const va = impact.a?.type === 'vehicle' ? impact.a.vehicle : null;
            const vb = impact.b?.type === 'vehicle' ? impact.b.vehicle : null;
            if (va) { impact.dvA = va.stepDv; impact.preA = { ...va._prevVel }; impact.posA = { ...va.position }; }
            if (vb) { impact.dvB = vb.stepDv; impact.preB = { ...vb._prevVel }; impact.posB = { ...vb.position }; }
            impact.dv = Math.max(impact.dvA || 0, impact.dvB || 0);
            this.impacts.push(impact);
        }
    }

    drainImpacts() {
        const list = this.impacts;
        this.impacts = [];
        return list;
    }

    // Safe to call more than once: freeing a Rapier object twice throws inside the wasm glue.
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.events.free();
        this.world.free();
    }
}
