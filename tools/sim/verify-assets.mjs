// Checks the hand-written vehicle dimensions in src/game/data/roadRacing.js against the real
// geometry of every exported vehicle GLB: wheel positions/radii, and whether the chassis
// collider encloses the visible body. A body that pokes out of the collider would sink into
// the road when the car is upside down or on its side.
//   node tools/sim/verify-assets.mjs
import { ROAD_VEHICLES } from './harness.mjs';
import { emptyBounds, grow, loadVehicleGeometry } from './vehicle-geometry.mjs';

let failures = 0;
const fmt = (n) => n.toFixed(2).padStart(6);
// How far the visible body pokes above the collision boxes anywhere (metres). A vertex counts as
// covered by a box when it is over that box's footprint (plus a small margin).
function worstOvershoot(points, boxes, margin = 0.25) {
    let worst = { amount: -Infinity, at: null };
    for (const p of points) {
        let top = -Infinity;
        for (const box of boxes) {
            if (p[0] >= box.min[0] - margin && p[0] <= box.max[0] + margin && p[2] >= box.min[2] - margin && p[2] <= box.max[2] + margin) {
                top = Math.max(top, box.max[1]);
            }
        }
        if (top === -Infinity) continue;
        if (p[1] - top > worst.amount) worst = { amount: p[1] - top, at: p };
    }
    return worst;
}

for (const info of ROAD_VEHICLES) {
    const { body, bodyPoints, wheels } = loadVehicleGeometry(info);
    const makeBox = ({ center, half }) => ({
        min: [center[0] - half[0], center[1] - half[1], center[2] - half[2]],
        max: [center[0] + half[0], center[1] + half[1], center[2] + half[2]]
    });
    const boxes = [makeBox(info.dims.body), ...(info.dims.body.parts || []).map(makeBox)];
    const hull = emptyBounds();
    for (const box of boxes) { grow(hull, box.min); grow(hull, box.max); }
    const worst = worstOvershoot(bodyPoints, boxes);
    console.log(`${info.id}`);
    console.log(`  body    x ${fmt(body.min[0])}..${fmt(body.max[0])}  y ${fmt(body.min[1])}..${fmt(body.max[1])}  z ${fmt(body.min[2])}..${fmt(body.max[2])}`);
    console.log(`  colliders (${boxes.length}) x ${fmt(hull.min[0])}..${fmt(hull.max[0])}  y ${fmt(hull.min[1])}..${fmt(hull.max[1])}  z ${fmt(hull.min[2])}..${fmt(hull.max[2])}`);
    const where = worst.at ? ` at (${worst.at.map((n) => n.toFixed(2)).join(', ')})` : '';
    console.log(`  highest visible part above its collider: ${fmt(Math.max(0, worst.amount))} m${where}`);
    if (worst.amount > 0.12) {
        failures += 1;
        console.log(`  FAIL part of the body sticks ${worst.amount.toFixed(2)} m above its collider, so it would clip into the road when flipped`);
    }
    const isBike = info.type === 'BIKE';
    for (const w of wheels) {
        const size = [w.bounds.max[0] - w.bounds.min[0], w.bounds.max[1] - w.bounds.min[1], w.bounds.max[2] - w.bounds.min[2]];
        const radius = Math.max(size[1], size[2]) / 2;
        // The physics bike has four narrow contact points around its two real wheels, so bikes
        // are matched along the length only.
        const match = info.dims.wheels.reduce((best, p) => {
            const d = Math.hypot(isBike ? 0 : p.x - w.position[0], p.z - w.position[2]);
            return d < best.d ? { d, p } : best;
        }, { d: Infinity, p: null });
        const ok = match.d < 0.06 && Math.abs(match.p.radius - radius) < 0.03 && Math.abs(match.p.y - w.position[1]) < 0.12;
        if (!ok) {
            failures += 1;
            console.log(`  FAIL wheel ${w.name}: model at (${w.position.map((n) => n.toFixed(2)).join(', ')}) r=${radius.toFixed(2)}; dims say (${match.p.x}, ${match.p.y}, ${match.p.z}) r=${match.p.radius}`);
        }
    }
}

if (failures) {
    console.log(`\n${failures} asset mismatch(es)`);
    process.exit(1);
}
console.log('\nvehicle dimensions match the models');
