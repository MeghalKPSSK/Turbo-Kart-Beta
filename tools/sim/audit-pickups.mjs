// Verifies that nothing collectable sits inside, or right next to, an obstacle, and that every
// pickup is on the asphalt. Exits non-zero on any violation.
//   node tools/sim/audit-pickups.mjs
import { readdirSync } from 'node:fs';
import { MODELS, trackMeta, TrackModel } from './harness.mjs';

const MIN_CLEARANCE = { nitro: 2.0, coin: 1.2 };
let violations = 0;

// Horizontal distance from (x, z) to the hazard footprint (0 when inside).
function footprintDistance(h, x, z) {
    const [hx, , hz] = h.half;
    const rx = h.shape === 'cylinder' ? hx : hx;
    const rz = h.shape === 'cylinder' ? hx : h.shape === 'capsule' ? h.half[1] : hz;
    const dx = x - h.position[0];
    const dz = z - h.position[2];
    const c = Math.cos(h.yaw), s = Math.sin(h.yaw);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return Math.hypot(Math.max(Math.abs(lx) - rx, 0), Math.max(Math.abs(lz) - rz, 0));
}

const ids = readdirSync(MODELS).filter((f) => f.endsWith('.track.json')).map((f) => f.replace('.track.json', ''));
for (const id of ids) {
    const meta = trackMeta(id);
    const track = new TrackModel(meta);
    const proj = {};
    const report = { nitro: { min: Infinity, maxLane: 0 }, coin: { min: Infinity, maxLane: 0 } };
    for (const kind of ['nitro', 'coin']) {
        const list = kind === 'nitro' ? meta.nitro : meta.coins;
        for (const item of list) {
            const [x, , z] = item.position;
            track.project(x, z, -1, proj);
            report[kind].maxLane = Math.max(report[kind].maxLane, Math.abs(proj.lane));
            let nearest = Infinity;
            for (const h of meta.hazards) nearest = Math.min(nearest, footprintDistance(h, x, z));
            report[kind].min = Math.min(report[kind].min, nearest);
            if (nearest < MIN_CLEARANCE[kind]) {
                violations += 1;
                console.log(`  VIOLATION ${id}: ${kind} at s=${item.s.toFixed(0)} lane ${proj.lane.toFixed(1)} is ${nearest.toFixed(2)} m from a hazard`);
            }
            if (Math.abs(proj.lane) > track.halfWidth - 1.2) {
                violations += 1;
                console.log(`  VIOLATION ${id}: ${kind} at s=${item.s.toFixed(0)} is off the asphalt (lane ${proj.lane.toFixed(1)})`);
            }
        }
    }
    console.log(`${id.padEnd(16)} nitro ${meta.nitro.length} (min hazard gap ${report.nitro.min.toFixed(1)} m, max |lane| ${report.nitro.maxLane.toFixed(1)})  coins ${meta.coins.length} (min hazard gap ${report.coin.min.toFixed(1)} m, max |lane| ${report.coin.maxLane.toFixed(1)})  hazards ${meta.hazards.length}`);
}
if (violations) {
    console.log(`\n${violations} violation(s)`);
    process.exit(1);
}
console.log('\nall pickups clear of obstacles and on the road');
