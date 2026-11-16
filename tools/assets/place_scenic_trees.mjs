// Plants forests on a scenic circuit: picks tree positions on the exported terrain and
// writes them into the route's .track.json as "trees", which the game instances
// (src/game/effects/scenicLook.js). Re-run after rebuilding a circuit in Blender.
//   node tools/assets/place_scenic_trees.mjs rovers_rift [more ids ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectTriangles, readGlb } from '../sim/glb.mjs';
import { TrackModel } from '../../src/game/physics/trackModel.js';

const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/models/blender');

// Per theme: how high trees grow (metres above the lowest road point), how many, and how
// far from the road the forest reaches.
const FOREST = {
    mountain_adventure: { treeline: 46, count: 850, reach: 210 },
    canyon: { treeline: 44, count: 420, reach: 175 },
    island: { treeline: 48, count: 420, reach: 180 },
    volcano: { treeline: 28, count: 0, reach: 120 },
    ice: { treeline: 42, count: 260, reach: 170 },
    jungle: { treeline: 58, count: 760, reach: 200 },
    industrial: { treeline: 36, count: 100, reach: 140 },
    coastal_sunset: { treeline: 55, count: 460, reach: 190 },
    default: { treeline: 60, count: 420, reach: 190 }
};

function seeded(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

// Height and slope of the terrain under any point, from a grid of its triangles.
function terrainSampler({ positions, indices }, cell = 14) {
    const grid = new Map();
    const key = (ix, iz) => `${ix},${iz}`;
    for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
        const x0 = Math.min(positions[a], positions[b], positions[c]);
        const x1 = Math.max(positions[a], positions[b], positions[c]);
        const z0 = Math.min(positions[a + 2], positions[b + 2], positions[c + 2]);
        const z1 = Math.max(positions[a + 2], positions[b + 2], positions[c + 2]);
        for (let ix = Math.floor(x0 / cell); ix <= Math.floor(x1 / cell); ix += 1) {
            for (let iz = Math.floor(z0 / cell); iz <= Math.floor(z1 / cell); iz += 1) {
                const k = key(ix, iz);
                if (!grid.has(k)) grid.set(k, []);
                grid.get(k).push(t);
            }
        }
    }
    return (x, z) => {
        const list = grid.get(key(Math.floor(x / cell), Math.floor(z / cell)));
        if (!list) return null;
        let best = null;
        for (const t of list) {
            const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
            const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
            const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
            const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
            const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
            if (Math.abs(det) < 1e-9) continue;
            const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
            const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
            const w = 1 - u - v;
            if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
            const y = u * ay + v * by + w * cy;
            if (best && best.y >= y) continue;
            // Upward-facing steepness: 1 is flat ground, 0 is a cliff.
            const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
            const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
            const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
            best = { y, flat: Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1) };
        }
        return best;
    };
}

for (const id of process.argv.slice(2)) {
    const metaPath = resolve(MODELS, `${id}.track.json`);
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    const track = new TrackModel(meta);
    const terrain = collectTriangles(readGlb(resolve(MODELS, `${id}.glb`)), /_Terrain_(Base|Rock|High|LightPatches|ShadowPatches)$/);
    const sample = terrainSampler(terrain);
    const rules = FOREST[meta.theme] || FOREST.default;
    const random = seeded([...id].reduce((sum, ch) => sum * 31 + ch.charCodeAt(0), 7));
    const lowest = Math.min(...meta.route.map((p) => p[1]));
    const clearOfRoad = track.halfWidth + track.guardrailOffset + 6;
    const xs = meta.route.map((p) => p[0]);
    const zs = meta.route.map((p) => p[2]);
    const box = { x0: Math.min(...xs) - rules.reach, x1: Math.max(...xs) + rules.reach, z0: Math.min(...zs) - rules.reach, z1: Math.max(...zs) + rules.reach };
    const trees = [];
    const taken = new Map();
    const spacing = 7;
    const slot = (x, z) => `${Math.floor(x / spacing)},${Math.floor(z / spacing)}`;
    const proj = {};
    for (let attempt = 0; attempt < 60000 && trees.length < rules.count; attempt += 1) {
        const x = box.x0 + random() * (box.x1 - box.x0);
        const z = box.z0 + random() * (box.z1 - box.z0);
        // Forests grow in stands, not as an even sprinkle.
        const stand = Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 - 0.6) + Math.sin((x + z) * 0.009);
        if (stand < -0.25 + random() * 0.5) continue;
        track.project(x, z, -1, proj);
        if (proj.dist < clearOfRoad || proj.dist > rules.reach) continue;
        const ground = sample(x, z);
        if (!ground || ground.flat < 0.8 || ground.y - lowest > rules.treeline) continue;
        let crowded = false;
        for (let dx = -1; dx <= 1 && !crowded; dx += 1) {
            for (let dz = -1; dz <= 1 && !crowded; dz += 1) {
                const other = taken.get(slot(x + dx * spacing, z + dz * spacing));
                if (other && Math.hypot(other[0] - x, other[1] - z) < spacing) crowded = true;
            }
        }
        if (crowded) continue;
        taken.set(slot(x, z), [x, z]);
        trees.push({
            position: [+x.toFixed(2), +(ground.y - 0.15).toFixed(2), +z.toFixed(2)],
            // Trees near the road are kept smaller so they frame it without hiding corners.
            scale: +((proj.dist < 40 ? 1.9 : 2.4) + random() * 1.3).toFixed(2),
            yaw: +(random() * Math.PI * 2).toFixed(3)
        });
    }
    meta.trees = trees;
    writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
    console.log(`${id}: planted ${trees.length} trees (terrain ${terrain.indices.length / 3} triangles)`);
}
