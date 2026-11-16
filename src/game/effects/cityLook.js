import * as THREE from 'three';
import { hangSigns } from './roadDressing.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { loadProgress } from '../loadProgress.js';

// The look of the city routes. The Blender export carries geometry, UVs in metres and named
// materials only; this module dresses it at load time with photographic surface textures,
// a real dusk sky for lighting and reflections, lit windows, street-lamp glow and instanced
// scanned trees. All source images and the tree are CC0 from Poly Haven
// (see tools/assets/fetch_polyhaven.py).

const BASE = import.meta.env.BASE_URL || '/';
const cache = new Map();

export function once(key, load) {
    if (!cache.has(key)) {
        const pending = load();
        pending.catch(() => cache.delete(key));
        cache.set(key, pending);
    }
    return cache.get(key);
}

export const loadImage = (name) => once(`image:${name}`, () => new THREE.ImageLoader().loadAsync(`${BASE}textures/${name}.jpg`));
export const loadModel = (name) => once(`model:${name}`, () => new GLTFLoader().loadAsync(`${BASE}models/nature/${name}.glb`).then((gltf) => gltf.scene));

// A sky is two files: an HDR image that lights the scene and a photograph that is seen.
export const loadSky = (name = 'dusk') => once(`sky:hdr:${name}`, () => new RGBELoader().loadAsync(`${BASE}sky/${name}_1k.hdr`));
export const loadBackdrop = (name = 'dusk') => once(`sky:jpg:${name}`, () => new THREE.ImageLoader().loadAsync(`${BASE}sky/${name}_4k.jpg`));

// Starts every download the city routes share (sky, surface textures, trees) ahead of time.
export function preloadCityLook() {
    const images = ['asphalt', 'pavement', 'concrete', 'grass'].flatMap((set) => ['diff', 'nor_gl', 'rough'].map((map) => `${set}_${map}`));
    return Promise.allSettled([
        loadSky(), loadBackdrop(),
        ...[...images, 'brick_diff', 'plaster_diff'].map(loadImage),
        ...TREE_SPECIES.flatMap((name) => [loadModel(name), loadModel(`${name}_far`)])
    ]);
}

export function tiled(image, { color = false, anisotropy = 1 } = {}) {
    const texture = new THREE.Texture(image);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    return texture;
}

// A photographic PBR surface: colour, normal and roughness maps from one texture set.
export async function surface(set, anisotropy, { repeat = 1, ...options } = {}) {
    const [diff, normal, rough] = await Promise.all([loadImage(`${set}_diff`), loadImage(`${set}_nor_gl`), loadImage(`${set}_rough`)]);
    const material = new THREE.MeshStandardMaterial({
        map: tiled(diff, { color: true, anisotropy }),
        normalMap: tiled(normal, { anisotropy }),
        roughnessMap: tiled(rough, { anisotropy }),
        roughness: 1,
        metalness: 0,
        ...options
    });
    for (const key of ['map', 'normalMap', 'roughnessMap']) material[key].repeat.setScalar(repeat);
    return material;
}

// Deterministic random numbers so the windows are the same on every visit.
function seeded(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

// Most windows are warm, with a few cool office floors and saturated shopfronts to give
// the night streets a lived-in neon rhythm without importing brand signage.
const LIT_COLOURS = ['#ffd9a0', '#ffe7c2', '#ffc980', '#e6f0ff', '#fff2d6', '#49e6ff', '#ff55c8', '#8b7dff'];

// Building facade: a wall photograph with a grid of windows painted over it. One canvas
// covers 8 bays by 8 floors (two of the model's UV tiles each way), which hides the repeat.
// Returns colour, emissive (lit windows) and roughness (glass is smooth) textures.
function facadeTextures(wallImage, { seed, glass = false, lit = 0.3, tint = '#ffffff' }) {
    const size = 1024;
    const cells = 8;
    const cell = size / cells;
    const make = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        return [canvas, canvas.getContext('2d')];
    };
    const [colour, c] = make();
    const [emissive, e] = make();
    const [rough, r] = make();
    const random = seeded(seed);

    if (wallImage && !glass) {
        // About 3.5 m of wall per photo tile.
        for (let x = 0; x < cells; x += 1) for (let y = 0; y < cells; y += 1) c.drawImage(wallImage, x * cell, y * cell, cell, cell);
        c.globalCompositeOperation = 'multiply';
        c.fillStyle = tint;
        c.fillRect(0, 0, size, size);
        c.globalCompositeOperation = 'source-over';
    } else {
        c.fillStyle = '#1a2026';
        c.fillRect(0, 0, size, size);
    }
    e.fillStyle = '#000';
    e.fillRect(0, 0, size, size);
    r.fillStyle = glass ? '#3a3a3a' : '#e6e6e6';
    r.fillRect(0, 0, size, size);

    for (let row = 0; row < cells; row += 1) {
        for (let col = 0; col < cells; col += 1) {
            const x = col * cell;
            const y = row * cell;
            // Window opening inside its bay; curtain-wall glass fills nearly the whole bay.
            const wx = x + cell * (glass ? 0.04 : 0.22);
            const wy = y + cell * (glass ? 0.05 : 0.2);
            const ww = cell * (glass ? 0.92 : 0.56);
            const wh = cell * (glass ? 0.9 : 0.56);
            if (!glass) {
                c.fillStyle = 'rgba(20, 20, 22, 0.85)';     // frame and reveal
                c.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
                c.fillStyle = 'rgba(255, 255, 255, 0.18)';  // sill
                c.fillRect(wx - 7, wy + wh + 4, ww + 14, 5);
            }
            const isLit = random() < lit;
            const gradient = c.createLinearGradient(wx, wy, wx, wy + wh);
            if (isLit) {
                const warmPool = random() < 0.82 ? LIT_COLOURS.slice(0, 5) : LIT_COLOURS.slice(5);
                const warm = warmPool[Math.floor(random() * warmPool.length)];
                gradient.addColorStop(0, warm);
                gradient.addColorStop(1, '#b98a4e');
                e.fillStyle = warm;
                e.globalAlpha = 0.45 + random() * 0.55;
                e.fillRect(wx, wy, ww, wh);
                e.globalAlpha = 1;
                // A blind or a silhouette breaks up the plain rectangle of light.
                if (random() < 0.5) {
                    e.fillStyle = 'rgba(0, 0, 0, 0.55)';
                    e.fillRect(wx, wy, ww, wh * (0.2 + random() * 0.4));
                }
            } else {
                gradient.addColorStop(0, glass ? '#3a4a5c' : '#2b3644');
                gradient.addColorStop(1, glass ? '#131a22' : '#10151b');
            }
            c.fillStyle = gradient;
            c.fillRect(wx, wy, ww, wh);
            c.fillStyle = 'rgba(8, 10, 12, 0.9)';           // glazing bars
            c.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
            if (!glass) c.fillRect(wx, wy + wh * 0.42, ww, 3);
            r.fillStyle = '#262626';
            r.fillRect(wx, wy, ww, wh);
        }
        if (!glass && row % 4 === 3) {
            c.fillStyle = 'rgba(0, 0, 0, 0.22)';            // string course between storeys
            c.fillRect(0, (row + 1) * cell - 6, size, 6);
        }
    }
    const texture = (canvas, isColour) => {
        const t = new THREE.CanvasTexture(canvas);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = isColour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.repeat.setScalar(0.5);
        return t;
    };
    return { map: texture(colour, true), emissiveMap: texture(emissive, true), roughnessMap: texture(rough, false) };
}

function poolTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255, 214, 160, 1)');
    g.addColorStop(0.45, 'rgba(255, 196, 130, 0.42)');
    g.addColorStop(1, 'rgba(255, 180, 110, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

async function buildMaterials(anisotropy) {
    const plain = (color, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const [asphalt, pavement, block, kerb, barrier, roof, grass, brick, concrete, plaster] = await Promise.all([
                // Lower roughness and a trace of metallic response catch the city lights on
                // the road, like a recently rained-on street, without making it a mirror.
                surface('asphalt', anisotropy, { color: 0x9a9da4, repeat: 2, roughness: 0.62, metalness: 0.12 }),
        surface('pavement', anisotropy),
        surface('concrete', anisotropy, { color: 0x6f7377 }),
        surface('concrete', anisotropy, { color: 0xb9b6ae }),
        surface('concrete', anisotropy, { color: 0xd2cfc6 }),
        surface('concrete', anisotropy, { color: 0x3c4046 }),
        surface('grass', anisotropy, { color: 0xb4c49a }),
        loadImage('brick_diff'), loadImage('concrete_diff'), loadImage('plaster_diff')
    ]);
    const facade = (wall, options, extra = {}) => {
        const textures = facadeTextures(wall, options);
        for (const t of Object.values(textures)) t.anisotropy = anisotropy;
        return new THREE.MeshStandardMaterial({ ...textures, roughness: 1, metalness: 0, emissive: 0xffffff, emissiveIntensity: 2.0, ...extra });
    };
    // The ground slabs under the city blocks overlap the carriageway where streets meet. They
    // take the road's own wet tarmac, and are drawn just behind it, so the road, its markings
    // and the kerbs always win and no bare patch shows across the lanes.
    const slab = asphalt.clone();
    slab.polygonOffset = true;
    slab.polygonOffsetFactor = 3;
    slab.polygonOffsetUnits = 12;
    block.dispose();
    const marking = plain(0xd9d8cf, 0.6);
    marking.polygonOffset = true;
    marking.polygonOffsetFactor = -2;
    marking.polygonOffsetUnits = -2;
    const checker = (color) => Object.assign(plain(color, 0.7), { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const pool = new THREE.MeshBasicMaterial({
        map: poolTexture(), transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true
    });
    return {
        Track_Asphalt: asphalt,
        Road_Marking: marking,
        Kerb_Stone: kerb,
        Ground_Pavement: pavement,
        Ground_Block: slab,
        Ground_Grass: grass,
        Barrier_Concrete: barrier,
        Roof: roof,
        Lamp_Pole: plain(0x1b1d20, 0.45, 0.7),
        Lamp_Glow: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xffd9a0, emissiveIntensity: 9 }),
        Lamp_Pool: pool,
        Start_Gate: plain(0x16181b, 0.4, 0.6),
        Start_Checker_Dark: checker(0x0b0b0b),
        Start_Checker_Light: checker(0xe8e6df),
        Facade_Brick: facade(brick, { seed: 11, lit: 0.3, tint: '#d8c7bb' }),
        Facade_Concrete: facade(concrete, { seed: 23, lit: 0.26, tint: '#c9ccd0' }),
        Facade_Plaster: facade(plaster, { seed: 37, lit: 0.34, tint: '#e6dccb' }),
        Facade_Glass: facade(null, { seed: 51, glass: true, lit: 0.22 }, { metalness: 0.55, envMapIntensity: 1.6 })
    };
}

// Instanced trees in a grid of chunks. Each chunk has a detailed and a light version of its
// trees; only chunks near the camera draw the detailed one.
export const TREE_SPECIES = ['tree_island', 'tree_round', 'tree_tall'];
const CHUNK = 130;
const NEAR = 48;
const FAR = 380;
const MID = 250;      // with a horizon set, real tree models stop here and crowns take over

export function treeParts(model) {
    model.updateMatrixWorld(true);
    const parts = [];
    model.traverse((object) => {
        if (!object.isMesh) return;
        const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        const material = object.material.clone();
        // The foliage is the cut-out material; the exported names all say "Trunk".
        const leafy = material.transparent || material.alphaTest > 0;
        material.side = THREE.DoubleSide;
        material.roughness = 0.82;
        material.metalness = 0;
        material.transparent = false;
        material.depthWrite = true;
        parts.push({ geometry, material, leafy });
    });
    return parts;
}

// Which species each tree is: a fixed mix, so a route looks the same on every visit.
// Indexes into TREE_SPECIES: mostly the round street tree, with tall and wind-shaped ones between.
const SPECIES_MIX = [1, 2, 1, 0, 1, 2, 0, 1, 2, 1];

// options: shadows, detailed (use the near models at all), tint(tree, index) -> THREE.Color
// for the foliage of each tree (autumn colours on the scenic circuits). With recolour the
// tint replaces the leaf colour (keeping the texture's light and shade) instead of multiplying
// it, because no multiple of green is orange; a white tint leaves that tree as it is.
function recolourLeaves(material) {
    material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
            #ifdef USE_COLOR
                float leafLight = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1));
                float keepGreen = step(2.95, vColor.r + vColor.g + vColor.b);
                diffuseColor.rgb = mix(vColor.rgb * leafLight * 2.6, diffuseColor.rgb, keepGreen);
            #endif`);
    };
    material.customProgramCacheKey = () => 'recolour-leaves';
}

// A far-off tree is a few dozen triangles: a lumpy crown the size and place of the real one.
// Forests on the horizon cost almost nothing this way.
function distantCrown(parts) {
    const box = new THREE.Box3();
    for (const part of parts) {
        if (!part.leafy) continue;
        part.geometry.computeBoundingBox();
        box.union(part.geometry.boundingBox);
    }
    if (box.isEmpty()) for (const part of parts) { part.geometry.computeBoundingBox(); box.union(part.geometry.boundingBox); }
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const geometry = new THREE.IcosahedronGeometry(1, 2);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        // Deep, uneven lobes: boughs and gaps, so the outline is ragged like foliage and never a ball.
        const lump = 0.62 + 0.42 * Math.abs(Math.sin(x * 5.3 + y * 3.1) * Math.cos(z * 4.7 + y * 2.3)) + 0.24 * Math.sin(x * 11.0 + z * 9.0 + y * 6.0);
        // Narrower toward the top, like a real crown seen from far off.
        const taper = 1 - 0.35 * Math.max(0, y);
        position.setXYZ(i, centre.x + x * size.x * 0.36 * lump * taper, centre.y + y * size.y * 0.5 * lump, centre.z + z * size.z * 0.36 * lump * taper);
    }
    geometry.computeVertexNormals();
    return geometry;
}

const CROWN_GREEN = new THREE.Color(0.05, 0.08, 0.035);
const CROWN_DULL = new THREE.Color(0.1, 0.09, 0.05);

// `horizon`: how far away trees are still drawn at all (as distant crowns beyond FAR).
export function plantTrees(scene, trees, species, { shadows, detailed, tint = null, recolour = false, horizon = 0 }) {
    const crowns = horizon ? species.map(({ far }) => distantCrown(far)) : null;
    const crownMaterial = horizon ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0 }) : null;
    const far = horizon ? MID : FAR;
    const crownColour = new THREE.Color();
    if (tint && recolour) {
        for (const { near, far } of species) for (const part of [...near, ...far]) if (part.leafy) recolourLeaves(part.material);
    }
    const chunks = new Map();
    trees.forEach((tree, index) => {
        const kind = SPECIES_MIX[Math.abs(index * 7 + Math.floor(tree.position[0])) % SPECIES_MIX.length];
        const key = `${kind}:${Math.floor(tree.position[0] / CHUNK)},${Math.floor(tree.position[2] / CHUNK)}`;
        if (!chunks.has(key)) chunks.set(key, { kind, list: [] });
        chunks.get(key).list.push(tree);
    });
    const dummy = new THREE.Object3D();
    const groups = [];
    for (const { kind, list } of chunks.values()) {
        const near = species[kind].near;
        const farParts = species[kind].far;
        const centre = new THREE.Vector3();
        for (const tree of list) centre.add(new THREE.Vector3(...tree.position));
        centre.divideScalar(list.length);
        const build = (parts, castShadow) => {
            const group = new THREE.Group();
            for (const part of parts) {
                const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
                list.forEach((tree, index) => {
                    dummy.position.set(...tree.position);
                    dummy.rotation.set(0, tree.yaw, 0);
                    dummy.scale.setScalar(tree.scale);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(index, dummy.matrix);
                    if (tint && part.leafy) mesh.setColorAt(index, tint(tree, index));
                });
                if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
                mesh.instanceMatrix.needsUpdate = true;
                mesh.computeBoundingSphere();
                mesh.castShadow = castShadow;
                mesh.receiveShadow = false;
                group.add(mesh);
            }
            scene.add(group);
            return group;
        };
        let crown = null;
        if (crowns) {
            crown = new THREE.InstancedMesh(crowns[kind], crownMaterial, list.length);
            list.forEach((tree, index) => {
                dummy.position.set(...tree.position);
                dummy.rotation.set(0, tree.yaw, 0);
                dummy.scale.setScalar(tree.scale);
                dummy.updateMatrix();
                crown.setMatrixAt(index, dummy.matrix);
                const colour = tint ? tint(tree, index) : null;
                if (!colour || colour.r + colour.g + colour.b > 2.95) crownColour.copy(CROWN_GREEN);
                else if (recolour) crownColour.copy(colour).multiplyScalar(0.13).lerp(CROWN_DULL, 0.4);     // foliage in shade, not paint
                else crownColour.copy(CROWN_GREEN).multiply(colour);
                crown.setColorAt(index, crownColour);
            });
            crown.instanceMatrix.needsUpdate = true;
            crown.instanceColor.needsUpdate = true;
            crown.computeBoundingSphere();
            scene.add(crown);
        }
        groups.push({ centre, near: detailed ? build(near, shadows) : null, far: build(farParts, false), crown });
    }
    return {
        update(camera) {
            for (const group of groups) {
                const distance = group.centre.distanceTo(camera.position);
                const close = Boolean(group.near) && distance < NEAR;
                if (group.near) group.near.visible = close;
                group.far.visible = !close && distance < far;
                if (group.crown) group.crown.visible = distance >= far && distance < horizon;
            }
        },
        dispose() {
            for (const group of groups) {
                for (const item of [group.near, group.far]) {
                    if (!item) continue;
                    scene.remove(item);
                    for (const mesh of item.children) mesh.dispose();
                }
                if (group.crown) { scene.remove(group.crown); group.crown.dispose(); }
            }
            if (crowns) { for (const geometry of crowns) geometry.dispose(); crownMaterial.dispose(); }
            for (const { near, far } of species) for (const part of [...near, ...far]) { part.geometry.dispose(); part.material.dispose(); }
        }
    };
}

export async function createCityLook({ renderer, scene, camera, trackScene, meta, quality, sun, hemisphere, fill }) {
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const wait = (promise) => loadProgress.track(promise);
    const [materials, environment, backdrop, ...treeModels] = await Promise.all([
        wait(buildMaterials(anisotropy)),
        wait(loadSky()),
        wait(loadBackdrop()),
        ...TREE_SPECIES.flatMap((name) => [wait(loadModel(name)), wait(loadModel(`${name}_far`))])
    ]);

    // Dress the model: swap each exported placeholder for its real material by name.
    const prefix = `${meta.id}_`;
    const replaced = [];
    trackScene.traverse((object) => {
        if (!object.isMesh) return;
        const name = (object.material?.name || '').startsWith(prefix) ? object.material.name.slice(prefix.length) : '';
        const material = materials[name];
        if (!material) return;
        material.name = object.material.name;       // the physics still finds the road by name
        object.material = material;
        if (name === 'Lamp_Pool' || name === 'Lamp_Glow') { object.castShadow = false; object.receiveShadow = false; }
        if (name === 'Lamp_Pool') object.renderOrder = 2;
        if (name === 'Ground_Block' || name === 'Track_Asphalt' || name === 'Ground_Grass') object.castShadow = false;
        replaced.push(material);
    });

    // Sky: the HDR lights the scene and feeds reflections, the tone-mapped photo is what you see.
    const generator = new THREE.PMREMGenerator(renderer);
    environment.mapping = THREE.EquirectangularReflectionMapping;
    const envMap = generator.fromEquirectangular(environment).texture;
    generator.dispose();
    const background = new THREE.Texture(backdrop);
    background.mapping = THREE.EquirectangularReflectionMapping;
    background.colorSpace = THREE.SRGBColorSpace;
    background.needsUpdate = true;
    const previous = { environment: scene.environment, background: scene.background, fog: scene.fog, exposure: renderer.toneMappingExposure };
    scene.environment = envMap;
    scene.environmentIntensity = 1.5;
    scene.background = background;
    scene.backgroundIntensity = 1.0;
    scene.fog = new THREE.Fog(0x7f8ea3, 260, 950);
    renderer.toneMappingExposure = 1.2;

    // Dusk: the sky does most of the lighting; a low, soft key gives shape and shadows.
    hemisphere.color.set(0x9db4d6);
    hemisphere.groundColor.set(0x3b3a38);
    hemisphere.intensity = 0.55;
    sun.color.set(0xffc9a0);
    sun.intensity = 1.5;
    fill.color.set(0x8fb0e0);
    fill.intensity = 0.35;

    const species = TREE_SPECIES.map((_, index) => ({ near: treeParts(treeModels[index * 2]), far: treeParts(treeModels[index * 2 + 1]) }));
    const trees = plantTrees(scene, meta.trees || [], species,
        { shadows: quality.shadows > 0, detailed: quality.particles >= 0.8 });

    // Blade signs on the building fronts along the route.
    const signs = hangSigns(scene, trackScene, meta);

    // Bloom makes the lamps and lit windows glow. It needs its own multisampled target.
    let composer = null;
    if (quality.bloom !== false && quality.shadows > 0) {
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality.antialias ? 4 : 0 });
        composer = new EffectComposer(renderer, target);
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.52, 0.62, 0.82));
        composer.addPass(new OutputPass());
    }

    return {
        // Where the key light sits relative to the player (low in the west).
        sunOffset: new THREE.Vector3(-150, 95, 60),
        update() { trees.update(camera); },
        render() { if (composer) composer.render(); else renderer.render(scene, camera); },
        resize(width, height) { composer?.setSize(width, height); },
        setPixelRatio(ratio) { composer?.setPixelRatio(ratio); },
        dispose() {
            trees.dispose();
            signs.dispose();
            composer?.dispose();
            envMap.dispose();
            background.dispose();
            for (const material of new Set(replaced)) {
                for (const key of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) material[key]?.dispose();
                material.dispose();
            }
            scene.environment = previous.environment;
            scene.background = previous.background;
            scene.fog = previous.fog;
            renderer.toneMappingExposure = previous.exposure;
        }
    };
}
