// Synthetic circuits for calibrating the vehicle model (straights and skidpads).
import { RAPIER, initRapier, TrackModel } from './harness.mjs';
import { PhysicsWorld } from '../../src/game/physics/trackWorld.js';

function ribbon(route, halfWidth) {
    const positions = [];
    const indices = [];
    const n = route.length;
    for (let i = 0; i < n; i += 1) {
        const a = route[(i - 1 + n) % n];
        const b = route[(i + 1) % n];
        let tx = b[0] - a[0];
        let tz = b[2] - a[2];
        const l = Math.hypot(tx, tz) || 1;
        tx /= l; tz /= l;
        const lx = tz, lz = -tx;
        const p = route[i];
        positions.push(p[0] + lx * halfWidth, p[1] + 0.05, p[2] + lz * halfWidth);
        positions.push(p[0] - lx * halfWidth, p[1] + 0.05, p[2] - lz * halfWidth);
    }
    for (let i = 0; i < n; i += 1) {
        const j = (i + 1) % n;
        // upward facing (checked by the ground builder, rays are two-sided anyway)
        indices.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
    }
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

export async function circleWorld(radius, { width = 26, samples = 480, gravity = 13 } = {}) {
    await initRapier();
    const route = [];
    for (let i = 0; i < samples; i += 1) {
        const a = (i / samples) * Math.PI * 2;
        // Counter-clockwise seen from above => heading increases => left turn.
        route.push([Math.sin(a) * radius, 0, Math.cos(a) * radius - radius]);
    }
    // Start at (0,0,0) heading +X... rotate so the heading at i=0 is +Z by swapping axes.
    const meta = { id: `circle_${radius}`, width, length: 0, gravity, guardrailOffset: 3, route, hazards: [], ramps: [], nitro: [], coins: [] };
    const track = new TrackModel(meta);
    const physics = new PhysicsWorld(RAPIER, track, ribbon(route, width / 2));
    return { RAPIER, track, physics, meta };
}
