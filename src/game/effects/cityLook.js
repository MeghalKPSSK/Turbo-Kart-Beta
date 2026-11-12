import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// The look of the city routes. The Blender export carries geometry, UVs in metres and named
// materials only; this module dresses it at load time with photographic surface textures,
// a real dusk sky for lighting and reflections, lit windows, street-lamp glow and instanced
// scanned trees. All source images and the tree are CC0 from Poly Haven
// (see tools/assets/fetch_polyhaven.py).

const BASE = import.meta.env.BASE_URL || '/';
const cache = new Map();

function once(key, load) {
    if (!cache.has(key)) {
        const pending = load();
        pending.catch(() => cache.delete(key));
        cache.set(key, pending);
    }
    return cache.get(key);
}

const loadImage = (name) => once(`image:${name}`, () => new THREE.ImageLoader().loadAsync(`${BASE}textures/${name}.jpg`));
const loadModel = (name) => once(`model:${name}`, () => new GLTFLoader().loadAsync(`${BASE}models/nature/${name}.glb`).then((gltf) => gltf.scene));

function tiled(image, { color = false, anisotropy = 1 } = {}) {
    const texture = new THREE.Texture(image);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    return texture;
}

// A photographic PBR surface: colour, normal and roughness maps from one texture set.
async function surface(set, anisotropy, { repeat = 1, ...options } = {}) {
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

const LIT_COLOURS = ['#ffd9a0', '#ffe7c2', '#ffc980', '#e6f0ff', '#fff2d6'];

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
                const warm = LIT_COLOURS[Math.floor(random() * LIT_COLOURS.length)];
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
        surface('asphalt', anisotropy, { color: 0x9a9a9a, repeat: 2 }),
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
        return new THREE.MeshStandardMaterial({ ...textures, roughness: 1, metalness: 0, emissive: 0xffffff, emissiveIntensity: 1.7, ...extra });
    };
    const marking = plain(0xd9d8cf, 0.6);
    marking.polygonOffset = true;
    marking.polygonOffsetFactor = -2;
    marking.polygonOffsetUnits = -2;
    const checker = (color) => Object.assign(plain(color, 0.7), { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const pool = new THREE.MeshBasicMaterial({
        map: poolTexture(), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true
    });
    return {
        Track_Asphalt: asphalt,
        Road_Marking: marking,
        Kerb_Stone: kerb,
        Ground_Pavement: pavement,
        Ground_Block: block,
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
const CHUNK = 90;
const NEAR = 65;
const FAR = 520;

function treeParts(model) {
    model.updateMatrixWorld(true);
    const parts = [];
    model.traverse((object) => {
        if (!object.isMesh) return;
        const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        const material = object.material.clone();
        material.side = THREE.DoubleSide;
        material.roughness = 0.82;
        material.metalness = 0;
        material.transparent = false;
        material.depthWrite = true;
        parts.push({ geometry, material, leafy: !/Trunk/i.test(material.name) });
    });
    return parts;
}

function plantTrees(scene, trees, near, far, { shadows, detailed }) {
    const chunks = new Map();
    for (const tree of trees) {
        const key = `${Math.floor(tree.position[0] / CHUNK)},${Math.floor(tree.position[2] / CHUNK)}`;
        if (!chunks.has(key)) chunks.set(key, []);
        chunks.get(key).push(tree);
    }
    const dummy = new THREE.Object3D();
    const groups = [];
    for (const list of chunks.values()) {
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
                });
                mesh.instanceMatrix.needsUpdate = true;
                mesh.computeBoundingSphere();
                mesh.castShadow = castShadow;
                mesh.receiveShadow = false;
                group.add(mesh);
            }
            scene.add(group);
            return group;
        };
        groups.push({ centre, near: detailed ? build(near, shadows) : null, far: build(far, false) });
    }
    return {
        update(camera) {
            for (const group of groups) {
                const distance = group.centre.distanceTo(camera.position);
                const close = Boolean(group.near) && distance < NEAR;
                if (group.near) group.near.visible = close;
                group.far.visible = !close && distance < FAR;
            }
        },
        dispose() {
            for (const group of groups) {
                for (const item of [group.near, group.far]) {
                    if (!item) continue;
                    scene.remove(item);
                    for (const mesh of item.children) mesh.dispose();
                }
            }
            for (const part of [...near, ...far]) { part.geometry.dispose(); part.material.dispose(); }
        }
    };
}

export async function createCityLook({ renderer, scene, camera, trackScene, meta, quality, sun, hemisphere, fill }) {
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const [materials, environment, backdrop, nearModel, farModel] = await Promise.all([
        buildMaterials(anisotropy),
        once('sky:hdr', () => new RGBELoader().loadAsync(`${BASE}sky/dusk_1k.hdr`)),
        once('sky:jpg', () => new THREE.ImageLoader().loadAsync(`${BASE}sky/dusk_4k.jpg`)),
        loadModel('tree_island'),
        loadModel('tree_island_far')
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

    const trees = plantTrees(scene, meta.trees || [], treeParts(nearModel), treeParts(farModel),
        { shadows: quality.shadows > 0, detailed: quality.particles >= 0.8 });

    // Bloom makes the lamps and lit windows glow. It needs its own multisampled target.
    let composer = null;
    if (quality.bloom !== false && quality.shadows > 0) {
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality.antialias ? 4 : 0 });
        composer = new EffectComposer(renderer, target);
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.42, 0.55, 1.0));
        composer.addPass(new OutputPass());
    }

    return {
        // Where the key light sits relative to the player (low in the west).
        sunOffset: new THREE.Vector3(-150, 95, 60),
        update() { trees.update(camera); },
        render() { if (composer) composer.render(); else renderer.render(scene, camera); },
        resize(width, height) { composer?.setSize(width, height); },
        dispose() {
            trees.dispose();
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
