import * as THREE from 'three';

// Scenery that is built in the browser from a circuit's route rather than exported from
// Blender: painted lane lines, boulders along the verges, a ring of distant mountains, and
// the glowing sign boards of the city. Everything is laid out from a seeded generator, so a
// route looks the same on every visit.

function seeded(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return hash >>> 0;
}

function meshesNamed(root, pattern) {
    const found = [];
    root.traverse((object) => { if (object.isMesh && pattern.test(object.material?.name || '')) found.push(object); });
    return found;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const caster = new THREE.Raycaster();

// The surface under a point: where it is and which way it faces.
function dropOnto(meshes, x, y, z) {
    caster.set(new THREE.Vector3(x, y, z), DOWN);
    caster.far = 400;
    const hit = caster.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (normal.y < 0) normal.negate();
    return { point: hit.point, normal };
}

// --------------------------------------------------------------------------------------- //
// Lane lines
// --------------------------------------------------------------------------------------- //

// A double yellow line down the middle and dashed white lines between the lanes, laid on the
// road surface itself so they follow every crest and camber.
export function paintLanes(scene, trackScene, meta) {
    const road = meshesNamed(trackScene, /_Track_Asphalt$/);
    if (!road.length) return { dispose() {} };
    trackScene.updateMatrixWorld(true);
    const route = meta.route;
    const half = meta.width / 2;
    const frames = [];
    let distance = 0;
    for (let i = 0; i < route.length; i += 1) {
        const here = route[i];
        const ahead = route[(i + 1) % route.length];
        const behind = route[(i - 1 + route.length) % route.length];
        const hit = dropOnto(road, here[0], here[1] + 6, here[2]);
        const point = hit ? hit.point : new THREE.Vector3(...here);
        const normal = hit ? hit.normal : new THREE.Vector3(0, 1, 0);
        const tangent = new THREE.Vector3(ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]).normalize();
        const across = new THREE.Vector3().crossVectors(normal, tangent).normalize();
        frames.push({ point, normal, across, distance });
        distance += Math.hypot(ahead[0] - here[0], ahead[1] - here[1], ahead[2] - here[2]);
    }

    const build = (lines, colour) => {
        const positions = [];
        const indices = [];
        for (const { offset, width, dash } of lines) {
            let previous = -1;
            for (let i = 0; i <= frames.length; i += 1) {
                const frame = frames[i % frames.length];
                const painted = !dash || (frame.distance % dash[1]) < dash[0];
                if (!painted) { previous = -1; continue; }
                const base = positions.length / 3;
                for (const edge of [offset - width / 2, offset + width / 2]) {
                    positions.push(
                        frame.point.x + frame.across.x * edge + frame.normal.x * 0.035,
                        frame.point.y + frame.across.y * edge + frame.normal.y * 0.035,
                        frame.point.z + frame.across.z * edge + frame.normal.z * 0.035
                    );
                }
                if (previous >= 0) indices.push(previous, previous + 1, base, previous + 1, base + 1, base);
                previous = base;
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({
            color: colour, roughness: 0.62, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.name = 'LaneLines';
        scene.add(mesh);
        return mesh;
    };

    const meshes = [
        build([{ offset: -0.17, width: 0.16 }, { offset: 0.17, width: 0.16 }], 0xd9a514),
        build([{ offset: -half / 2, width: 0.15, dash: [4.5, 13.5] }, { offset: half / 2, width: 0.15, dash: [4.5, 13.5] }], 0xe9e6dc)
    ];
    return {
        dispose() {
            for (const mesh of meshes) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
        }
    };
}

// --------------------------------------------------------------------------------------- //
// Noise
// --------------------------------------------------------------------------------------- //

function valueNoise(seed) {
    const random = seeded(seed);
    const table = new Float32Array(1024);
    for (let i = 0; i < table.length; i += 1) table[i] = random();
    const at = (ix, iz) => table[((ix * 73856093) ^ (iz * 19349663)) & 1023];
    const fade = (t) => t * t * (3 - 2 * t);
    return (x, z) => {
        const ix = Math.floor(x), iz = Math.floor(z);
        const fx = fade(x - ix), fz = fade(z - iz);
        const a = at(ix, iz), b = at(ix + 1, iz), c = at(ix, iz + 1), d = at(ix + 1, iz + 1);
        return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
    };
}

// Ridged noise: sharp crests with valleys between, which is what a mountain skyline looks like.
function ridges(noise, x, z, octaves = 5) {
    let sum = 0, amplitude = 0.5, frequency = 1, weight = 1;
    for (let i = 0; i < octaves; i += 1) {
        let n = 1 - Math.abs(noise(x * frequency + i * 17.3, z * frequency - i * 9.1) * 2 - 1);
        n *= n * weight;
        weight = Math.min(1, Math.max(0, n * 2));
        sum += n * amplitude;
        amplitude *= 0.5;
        frequency *= 2.05;
    }
    return sum;
}

// --------------------------------------------------------------------------------------- //
// Mountains
// --------------------------------------------------------------------------------------- //

// A ring of peaks beyond the edge of the circuit's own terrain. `height` is the tallest
// summit in metres; `terraces` cuts the slopes into the stepped cliffs of canyon country;
// `gap` (0..1) leaves part of the ring open, for a coast.
export function raiseMountains(scene, meta, material, { height = 420, terraces = 0, gap = 0, inner = 430, outer = 1500 } = {}) {
    if (height <= 0) return { dispose() {} };
    const noise = valueNoise(hashText(meta.id) + 7);
    const xs = meta.route.map((point) => point[0]);
    const zs = meta.route.map((point) => point[2]);
    const ys = meta.route.map((point) => point[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const floor = Math.min(...ys) - 30;
    const around = 220;
    const rings = 30;
    const positions = [];
    const indices = [];
    const opening = hashText(meta.id) % 628 / 100;         // where the gap in the ring faces
    for (let r = 0; r <= rings; r += 1) {
        const t = r / rings;
        const radius = inner + (outer - inner) * t * t * 0.6 + (outer - inner) * t * 0.4;
        // Foothills near the circuit, the high summits two thirds of the way out.
        const envelope = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 1.3 * (0.35 + 0.65 * Math.min(1, t * 1.8));
        for (let a = 0; a < around; a += 1) {
            const angle = Math.PI * 2 * a / around;
            const x = cx + Math.cos(angle) * radius;
            const z = cz + Math.sin(angle) * radius;
            // Broad massifs first, then smaller spurs and gullies cut into their flanks.
            let shape = ridges(noise, x / 900, z / 900, 4);
            shape = shape ** 1.6 * 1.35 + ridges(noise, x / 210 + 40, z / 210, 3) * 0.1 * shape;
            if (terraces) shape = (Math.floor(shape * terraces) + Math.min(1, (shape * terraces % 1) * 3.5)) / terraces;
            let open = 1;
            if (gap) {
                const away = Math.abs(((angle - opening + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / Math.PI;   // 0 facing the gap
                open = Math.min(1, Math.max(0, (away - gap) / 0.18));
            }
            // Where the ring opens to the sea, the ground drops away under the water.
            positions.push(x, floor + shape * envelope * height * open - (1 - open) * 90, z);
        }
    }
    for (let r = 0; r < rings; r += 1) {
        for (let a = 0; a < around; a += 1) {
            const n = (a + 1) % around;
            const i0 = r * around + a, i1 = r * around + n, i2 = (r + 1) * around + a, i3 = (r + 1) * around + n;
            indices.push(i0, i2, i1, i1, i2, i3);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const up = geometry.attributes.normal;
    let facing = 0;
    for (let i = 0; i < up.count; i += 1) facing += up.getY(i);
    if (facing < 0) {
        geometry.index.array.reverse();
        geometry.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'MountainRange';
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { dispose() { scene.remove(mesh); geometry.dispose(); } };
}

// --------------------------------------------------------------------------------------- //
// Sea
// --------------------------------------------------------------------------------------- //

// Open water to the horizon, at the level of the circuit's own patch of sea, which gets the
// same deep, glossy surface so the two read as one.
export function fillSea(scene, trackScene) {
    const patches = meshesNamed(trackScene, /_(Coastal_Water)$/);
    if (!patches.length) return { dispose() {} };
    trackScene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const patch of patches) box.expandByObject(patch);
    const material = new THREE.MeshStandardMaterial({ color: 0x0e4a63, roughness: 0.14, metalness: 0.35, envMapIntensity: 1.3 });
    for (const patch of patches) { material.name = patch.material.name; patch.material = material; }
    const centre = box.getCenter(new THREE.Vector3());
    const geometry = new THREE.CircleGeometry(2600, 48);
    geometry.rotateX(-Math.PI / 2);
    const sea = new THREE.Mesh(geometry, material);
    sea.position.set(centre.x, box.max.y - 0.12, centre.z);
    sea.name = 'OpenSea';
    sea.receiveShadow = true;
    scene.add(sea);
    return { dispose() { scene.remove(sea); geometry.dispose(); material.dispose(); } };
}

// --------------------------------------------------------------------------------------- //
// Boulders
// --------------------------------------------------------------------------------------- //

// Broken rock along the verges and scattered up the slopes: one merged mesh of lumpy
// stones, each sat into the ground it lands on.
export function scatterRocks(scene, trackScene, meta, material, { count = 260, reach = 70, size = 1 } = {}) {
    const terrain = meshesNamed(trackScene, /_Terrain_(Base|Rock|High|LightPatches|ShadowPatches)$/);
    if (!terrain.length || count <= 0) return { dispose() {} };
    const random = seeded(hashText(meta.id) + 91);
    const noise = valueNoise(hashText(meta.id) + 5);
    const route = meta.route;
    const clear = meta.width / 2 + (meta.guardrailOffset || 3) + 2.5;
    const template = new THREE.IcosahedronGeometry(1, 2);
    const source = template.attributes.position;
    const positions = [];
    const point = new THREE.Vector3();
    for (let n = 0; n < count; n += 1) {
        const index = Math.floor(random() * route.length);
        const here = route[index];
        const ahead = route[(index + 1) % route.length];
        const side = random() < 0.5 ? -1 : 1;
        const out = clear + (random() ** 1.8) * reach;
        const length = Math.hypot(ahead[0] - here[0], ahead[2] - here[2]) || 1;
        const x = here[0] + (-(ahead[2] - here[2]) / length) * out * side;
        const z = here[2] + ((ahead[0] - here[0]) / length) * out * side;
        // Never on the road where another part of the circuit passes by.
        let near = Infinity;
        for (let i = 0; i < route.length; i += 4) near = Math.min(near, Math.hypot(route[i][0] - x, route[i][2] - z));
        if (near < clear - 0.5) continue;
        const ground = dropOnto(terrain, x, here[1] + 200, z);
        if (!ground) continue;
        const scale = size * (0.5 + random() ** 2.2 * 3.4);
        const squash = [0.75 + random() * 0.7, 0.5 + random() * 0.55, 0.75 + random() * 0.7];
        const turn = random() * Math.PI * 2;
        const cos = Math.cos(turn), sin = Math.sin(turn);
        const ox = random() * 50, oz = random() * 50;
        for (let v = 0; v < source.count; v += 1) {
            point.fromBufferAttribute(source, v);
            // Push each corner in or out so no two stones match, and flatten some faces.
            const lump = 0.72 + noise(point.x * 1.7 + ox, point.z * 1.7 + oz + point.y) * 0.62;
            point.multiplyScalar(lump);
            point.y = Math.max(point.y, -0.55);
            const px = point.x * squash[0] * scale, py = point.y * squash[1] * scale, pz = point.z * squash[2] * scale;
            positions.push(ground.point.x + px * cos - pz * sin, ground.point.y + py + scale * 0.12, ground.point.z + px * sin + pz * cos);
        }
    }
    template.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();          // unshared corners: every face is a flat facet of broken rock
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Boulders';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { dispose() { scene.remove(mesh); geometry.dispose(); } };
}

// --------------------------------------------------------------------------------------- //
// City sign boards
// --------------------------------------------------------------------------------------- //

// Invented names only: no real brands.
const SIGNS = [
    ['NOVA', '#ff2d6f', '#fff3f7'], ['KIRO 24', '#19e3c2', '#03231e'], ['ZENITH', '#ffd21f', '#231c00'], ['ORBIT', '#6c5cff', '#f1efff'],
    ['HALO BAR', '#ff7a1a', '#fff4ea'], ['VOLT', '#c8ff2e', '#182000'], ['MERIDIAN', '#21a8ff', '#eaf6ff'], ['LUXE', '#ff3bd4', '#fff0fb'],
    ['TURBO CUP', '#ff2a2a', '#fff1f1'], ['AURA', '#31f0ff', '#00262a'], ['PIXEL', '#ffffff', '#111111'], ['RAMEN 88', '#ff5b3a', '#fff2ee']
];

function signAtlas() {
    const columns = 4, rows = 3, cell = [128, 384];
    const canvas = document.createElement('canvas');
    canvas.width = columns * cell[0];
    canvas.height = rows * cell[1];
    const c = canvas.getContext('2d');
    SIGNS.forEach(([text, glow, ink], index) => {
        const x = (index % columns) * cell[0], y = Math.floor(index / columns) * cell[1];
        c.fillStyle = '#05060a';
        c.fillRect(x, y, cell[0], cell[1]);
        c.fillStyle = glow;
        c.fillRect(x + 8, y + 8, cell[0] - 16, cell[1] - 16);
        c.fillStyle = '#05060a';
        c.fillRect(x + 14, y + 14, cell[0] - 28, cell[1] - 28);
        // The name, one letter under the next, as on a blade sign.
        const letters = text.replace(/ /g, '·').split('');
        const step = (cell[1] - 48) / letters.length;
        c.font = `900 ${Math.min(84, step * 0.92)}px "Arial Black", Arial, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        letters.forEach((letter, row) => {
            c.fillStyle = row % 2 ? ink : glow;
            c.shadowColor = glow;
            c.shadowBlur = 14;
            c.fillText(letter, x + cell[0] / 2, y + 24 + step * (row + 0.5));
        });
        c.shadowBlur = 0;
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { texture, columns, rows };
}

// Blade signs standing out from the building fronts along the route, lit from within.
export function hangSigns(scene, trackScene, meta, { every = 26 } = {}) {
    const fronts = meshesNamed(trackScene, /_Facade_/);
    if (!fronts.length) return { dispose() {} };
    trackScene.updateMatrixWorld(true);
    const random = seeded(hashText(meta.id) + 313);
    const route = meta.route;
    const atlas = signAtlas();
    const positions = [], uvs = [], indices = [];
    const origin = new THREE.Vector3(), outward = new THREE.Vector3();
    let travelled = every;
    for (let i = 0; i < route.length; i += 1) {
        const here = route[i];
        const ahead = route[(i + 1) % route.length];
        const length = Math.hypot(ahead[0] - here[0], ahead[2] - here[2]) || 1;
        travelled += length;
        if (travelled < every) continue;
        travelled = 0;
        for (const side of [-1, 1]) {
            if (random() < 0.25) continue;
            outward.set(-(ahead[2] - here[2]) / length * side, 0, (ahead[0] - here[0]) / length * side);
            const height = 7 + random() * 16;
            origin.set(here[0], here[1] + height, here[2]);
            caster.set(origin, outward);
            caster.far = 70;
            const hit = caster.intersectObjects(fronts, false)[0];
            if (!hit || hit.distance < meta.width / 2 + 1) continue;
            const wall = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
            wall.y = 0;
            if (wall.lengthSq() < 0.2) continue;
            wall.normalize();
            if (wall.dot(outward) > 0) wall.negate();          // out of the wall, toward the street
            const tall = 5 + random() * 6;
            const wide = tall / 3;
            const design = Math.floor(random() * SIGNS.length);
            const u0 = (design % atlas.columns) / atlas.columns, u1 = u0 + 1 / atlas.columns;
            const v1 = 1 - Math.floor(design / atlas.columns) / atlas.rows, v0 = v1 - 1 / atlas.rows;
            // The board stands out from the wall edge-on, so both of its faces face along the street.
            const inner = hit.point.clone().addScaledVector(wall, 0.25);
            const outer = hit.point.clone().addScaledVector(wall, 0.25 + wide);
            for (const flip of [0, 1]) {
                const base = positions.length / 3;
                const a = flip ? outer : inner, b = flip ? inner : outer;
                positions.push(a.x, a.y - tall / 2, a.z, b.x, b.y - tall / 2, b.z, b.x, b.y + tall / 2, b.z, a.x, a.y + tall / 2, a.z);
                uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
                indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
        color: 0x111111, roughness: 0.4, emissive: 0xffffff, emissiveMap: atlas.texture, emissiveIntensity: 2.4, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'SignBoards';
    mesh.frustumCulled = false;
    scene.add(mesh);
    return {
        count: indices.length / 12,
        dispose() { scene.remove(mesh); geometry.dispose(); material.dispose(); atlas.texture.dispose(); }
    };
}
