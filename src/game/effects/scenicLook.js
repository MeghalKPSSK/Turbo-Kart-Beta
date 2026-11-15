import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadProgress } from '../loadProgress.js';
import { carve, fillSea, makeCrags, paintLanes, raiseMountains, scatterRocks } from './roadDressing.js';
import { TREE_SPECIES, loadBackdrop, loadImage, loadModel, loadSky, plantTrees, surface, tiled, treeParts } from './cityLook.js';

// The look of the scenic circuits. Like the city look, it dresses the Blender export at load
// time: the terrain gets photographic rock, meadow and snow blended by slope and height, the
// sky is a real photograph that also lights the scene, mist hangs in the distance, and the
// generated cone trees are replaced by forests of scanned trees (positions come from
// tools/assets/place_scenic_trees.mjs). Textures and skies are CC0 from Poly Haven.

// Which themes have been brought up to this standard, and how each one looks.
export const SCENIC_THEMES = {
    mountain_adventure: {
        sky: 'day',
        snowAbove: 95,              // metres above the lowest point of the road
        mist: 0xbfd0e2,
        fog: [240, 1500],
        terrainTint: [1, 1, 1],
        light: [0xcfe0f5, 0x5a5346, 0xfff3dd, 0xa9c6ea],
        // Autumn in the mountains: most trees have turned. With recolour the entries are the
        // leaf colour itself (white keeps the tree green), not a multiplier.
        recolour: true,
        foliage: [[1, 1, 1], [1.0, 0.42, 0.07], [1.0, 0.72, 0.1], [0.78, 0.16, 0.05], [1.0, 0.55, 0.08], [1, 1, 1], [0.9, 0.3, 0.06]]
    },
    canyon: {
        sky: 'day', snowAbove: 10000, mist: 0xd1b995, fog: [180, 1250], terrainTint: [1.18, 0.94, 0.76],
        light: [0xffe0b0, 0x62513e, 0xffdfb0, 0xffbc7b],
        foliage: [[0.95, 0.82, 0.55], [1.2, 0.8, 0.42], [0.76, 0.72, 0.46]]
    },
    island: {
        sky: 'day', snowAbove: 10000, mist: 0x9ec8d6, fog: [220, 1450], terrainTint: [0.8, 1.08, 0.82],
        light: [0xd6f2ff, 0x40564b, 0xfff4db, 0x8ad2ec],
        foliage: [[0.5, 1.08, 0.62], [0.72, 1.18, 0.42], [0.42, 0.9, 0.54]]
    },
    volcano: {
        sky: 'dusk', snowAbove: 10000, mist: 0x88766d, fog: [170, 1050], terrainTint: [1.08, 0.88, 0.78],
        light: [0xc9c5ce, 0x393435, 0xffb28a, 0xb1a0ad], foliage: [[0.55, 0.52, 0.48]]
    },
    ice: {
        sky: 'day', snowAbove: -10000, mist: 0xb6c9d8, fog: [200, 1350], terrainTint: [0.78, 0.88, 1.08],
        light: [0xd8ecff, 0x526171, 0xe5f2ff, 0x8db6e0], foliage: [[0.58, 0.78, 0.82], [0.68, 0.84, 0.88]]
    },
    jungle: {
        sky: 'day', snowAbove: 10000, mist: 0x9ebc9d, fog: [150, 1050], terrainTint: [0.74, 1.12, 0.72],
        light: [0xc7dfc3, 0x394b36, 0xffe7b6, 0x8db9a0],
        foliage: [[0.48, 1.18, 0.45], [0.72, 1.28, 0.38], [0.36, 0.88, 0.46]]
    },
    industrial: {
        sky: 'dusk', snowAbove: 10000, mist: 0x767b80, fog: [160, 1150], terrainTint: [0.8, 0.82, 0.82],
        light: [0xaab5c7, 0x34383b, 0xffbd82, 0x91a9c8], foliage: [[0.65, 0.73, 0.58]]
    },
    coastal_sunset: {
        sky: 'day', snowAbove: 10000, mist: 0xb9c8c5, fog: [220, 1450], terrainTint: [1.08, 1.02, 0.84],
        light: [0xd6e5ef, 0x5a5547, 0xffd3a0, 0xa1c9dc],
        foliage: [[0.86, 1.02, 0.55], [1.15, 0.9, 0.48], [0.58, 0.84, 0.52]]
    }
};

// The country around each circuit: how high the distant ranges stand (metres; `terraces` steps
// them into canyon walls, `gap` opens the ring toward the sea) and how much loose rock lies about.
const COUNTRY = {
    mountain_adventure: { crags: { height: 15 }, mountains: { height: 540 }, rocks: { count: 620, reach: 90 } },
    canyon: { crags: { height: 24, terraces: 3 }, mountains: { height: 320, terraces: 5 }, rocks: { count: 380, size: 1.3 } },
    island: { crags: { height: 5 }, mountains: { height: 0 }, rocks: { count: 140 } },
    volcano: { crags: { height: 17 }, mountains: { height: 440 }, rocks: { count: 380, size: 1.2 } },
    ice: { crags: { height: 13 }, mountains: { height: 500 }, rocks: { count: 260 } },
    jungle: { crags: { height: 9 }, mountains: { height: 300 }, rocks: { count: 160 } },
    industrial: { crags: { height: 4 }, mountains: { height: 170 }, rocks: { count: 80 } },
    coastal_sunset: { crags: { height: 11 }, mountains: { height: 340, gap: 0.42 }, rocks: { count: 260 } }
};

const HIDDEN = /_(Scenery_Canopy|Scenery_Canopy_Light|Scenery_Trunk|Scenery_SnowTips|Ridge_Silhouette)$/;
// Rock props exported as plain shapes: boulders, cliffs, sea stacks. They take the landscape's rock.
const ROCKY = /_(Scenery_Boulder|Crater_Rock|Ice_Ridge|SeaStack_Coral|Falls_Cliff|Beacon_Stone)$/;
// Things that stand on the landscape and must move with it when it is carved.
const GROUNDED = /_(Scenery_Lava|Falls_Water|Lighthouse_Paint|Lighthouse_Lamp|Scenery_Steel|Landmark_Steel|Landmark_Accent)$/;
// The light and shadow patches are cells of the same landscape, coloured differently.
const TERRAIN = /_Terrain_(Base|Rock|High|LightPatches|ShadowPatches)$/;

// One material for the whole landscape. Textures are projected from three sides (so cliffs
// are not stretched) and blended: rock where it is steep, meadow where it is flat, snow on
// the high ground. A second, much larger sample of each texture breaks up the repeat.
function terrainMaterial({ meadow, rock, snow, snowline, tint }) {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0 });
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, {
            tMeadow: { value: meadow }, tRock: { value: rock }, tSnow: { value: snow }, uSnowline: { value: snowline },
            uTerrainTint: { value: new THREE.Vector3(...tint) }
        });
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainPos;\nvarying vec3 vTerrainNormal;')
            .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
                vTerrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vTerrainNormal = normalize(mat3(modelMatrix) * objectNormal);`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                uniform sampler2D tMeadow; uniform sampler2D tRock; uniform sampler2D tSnow; uniform float uSnowline; uniform vec3 uTerrainTint;
                varying vec3 vTerrainPos; varying vec3 vTerrainNormal;
                vec3 threeSided(sampler2D map, vec3 p, vec3 w, float scale) {
                    return texture2D(map, p.zy * scale).rgb * w.x + texture2D(map, p.xz * scale).rgb * w.y + texture2D(map, p.xy * scale).rgb * w.z;
                }`)
            .replace('#include <map_fragment>', `
                vec3 tn = normalize(vTerrainNormal);
                vec3 w = pow(abs(tn), vec3(4.0));
                w /= (w.x + w.y + w.z);
                float patchy = texture2D(tMeadow, vTerrainPos.xz * 0.0031).g;
                float veins = texture2D(tRock, vTerrainPos.xz * 0.0043).r;
                vec3 meadow = threeSided(tMeadow, vTerrainPos, w, 0.085) * mix(0.75, 1.25, patchy) * vec3(0.6, 1.0, 0.44);
                vec3 rock = threeSided(tRock, vTerrainPos, w, 0.045) * mix(0.78, 1.18, veins);
                vec3 snow = threeSided(tSnow, vTerrainPos, w, 0.06) * 1.08;
                float rockiness = 1.0 - smoothstep(0.6, 0.86, tn.y + (patchy - 0.5) * 0.14);
                // Crags and scree: bands of bare rock break through the grass wherever the
                // ground tilts at all, so a hillside is never one flat colour.
                float crag = texture2D(tRock, vTerrainPos.xz * 0.0017 + 0.31).g + texture2D(tMeadow, vTerrainPos.zx * 0.0061).r * 0.5;
                rockiness = max(rockiness, smoothstep(0.62, 0.8, crag + (1.0 - tn.y) * 1.7) * 0.9);
                rock *= mix(0.62, 1.0, texture2D(tRock, vTerrainPos.xz * 0.011).r);
                float snowiness = smoothstep(uSnowline - 22.0, uSnowline + 30.0, vTerrainPos.y + (patchy - 0.5) * 46.0 + (veins - 0.5) * 30.0) * smoothstep(0.3, 0.68, tn.y);
                diffuseColor.rgb = mix(mix(meadow, rock, rockiness), snow, snowiness) * uTerrainTint;`);
    };
    return material;
}

// The exported terrain is flat-shaded (every triangle has its own corners). Weld the corners
// and recompute normals so slopes shade as one surface.
// Rock props ride up and down with the ground they stand on (once: the model is cached).
function reshape(mesh, crags) {
    if (mesh.geometry.userData.carved) return;
    carve(mesh, crags);
    mesh.geometry.userData.carved = true;
}

function smoothTerrain(mesh, crags) {
    if (mesh.geometry.userData.smoothed) return;
    const geometry = mesh.geometry;
    for (const name of Object.keys(geometry.attributes)) if (name !== 'position') geometry.deleteAttribute(name);
    const welded = mergeVertices(geometry, 0.01);
    welded.computeVertexNormals();
    // The export winds the landscape inconsistently (it was drawn two-sided): some triangles
    // face down. It is a height field, so turn every triangle to face the sky, or the
    // single-sided material would leave holes where they are culled.
    const position = welded.attributes.position;
    const index = welded.index.array;
    for (let i = 0; i < index.length; i += 3) {
        const a = index[i], b = index[i + 1], c = index[i + 2];
        const ux = position.getX(b) - position.getX(a), uz = position.getZ(b) - position.getZ(a);
        const vx = position.getX(c) - position.getX(a), vz = position.getZ(c) - position.getZ(a);
        if (uz * vx - ux * vz < 0) { index[i + 1] = c; index[i + 2] = b; }
    }
    welded.index.needsUpdate = true;
    welded.computeVertexNormals();
    welded.userData.smoothed = true;
    mesh.geometry = welded;
    carve(mesh, crags);
}

// Where the sun is in an equirectangular HDR sky: the direction of its brightest pixel.
function sunDirection(texture) {
    const { data, width, height } = texture.image;
    const half = texture.type === THREE.HalfFloatType;
    let best = -1;
    let at = 0;
    for (let i = 0; i < width * height; i += 3) {
        const r = half ? THREE.DataUtils.fromHalfFloat(data[i * 4]) : data[i * 4];
        const g = half ? THREE.DataUtils.fromHalfFloat(data[i * 4 + 1]) : data[i * 4 + 1];
        if (r + g > best) { best = r + g; at = i; }
    }
    const u = (at % width) / width;
    const v = Math.floor(at / width) / height;
    const longitude = (u - 0.5) * Math.PI * 2;
    const latitude = (0.5 - v) * Math.PI;
    // Never lower than 25 degrees: a grazing sun would leave the whole road in shadow.
    const lift = Math.max(latitude, 0.44);
    return new THREE.Vector3(Math.cos(lift) * Math.cos(longitude), Math.sin(lift), Math.cos(lift) * Math.sin(longitude)).normalize();
}

export async function createScenicLook({ renderer, scene, camera, trackScene, meta, quality, sun, hemisphere, fill }) {
    const theme = SCENIC_THEMES[meta.theme];
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const wait = (promise) => loadProgress.track(promise);
    const [environment, backdrop, meadowImage, rockImage, snowImage, asphalt, ...treeModels] = await Promise.all([
        wait(loadSky(theme.sky)), wait(loadBackdrop(theme.sky)),
        wait(loadImage('meadow_diff')), wait(loadImage('rock_diff')), wait(loadImage('snow_diff')),
        wait(surface('asphalt', anisotropy, { color: 0xa6a6a6, repeat: 3 })),
        ...TREE_SPECIES.flatMap((name) => [wait(loadModel(name)), wait(loadModel(`${name}_far`))])
    ]);

    const lowest = Math.min(...meta.route.map((point) => point[1]));
    const terrainMaps = [meadowImage, rockImage, snowImage].map((image) => tiled(image, { color: true, anisotropy }));
    const terrain = terrainMaterial({ meadow: terrainMaps[0], rock: terrainMaps[1], snow: terrainMaps[2], snowline: lowest + theme.snowAbove, tint: theme.terrainTint });
    const rail = new THREE.MeshStandardMaterial({ color: 0xb9bdc1, metalness: 0.85, roughness: 0.42 });
    const post = new THREE.MeshStandardMaterial({ color: 0x6f7377, metalness: 0.7, roughness: 0.55 });
    const paint = new THREE.MeshStandardMaterial({ color: 0xe6e4da, roughness: 0.6 });
    const owned = [terrain, rail, post, paint, asphalt];

    const country = COUNTRY[meta.theme] || {};
    const crags = makeCrags(meta, country.crags);
    trackScene.traverse((object) => {
        if (!object.isMesh) return;
        const name = object.material?.name || '';
        if (HIDDEN.test(name)) { object.visible = false; return; }
        let material = null;
        if (TERRAIN.test(name)) { smoothTerrain(object, crags); material = terrain; object.castShadow = false; }
        else if (ROCKY.test(name)) { reshape(object, crags); material = terrain; }
        else if (GROUNDED.test(name)) reshape(object, crags);
        else if (/_Track_Asphalt$/.test(name)) { material = asphalt; object.castShadow = false; }
        else if (/_Barrier_Guardrail$/.test(name)) material = rail;
        else if (/_Barrier_Support$/.test(name)) material = post;
        else if (/_Road_EdgeLine$/.test(name)) material = paint;
        if (!material) return;
        material.name = name;       // the physics still finds the road by material name
        object.material = material;
    });

    // Beyond the exported landscape: lane lines on the road, broken rock on the verges and
    // a ring of mountains on the horizon, all in the same rock, meadow and snow.
    const dressing = [
        paintLanes(scene, trackScene, meta),
        scatterRocks(scene, trackScene, meta, terrain, country.rocks),
        raiseMountains(scene, meta, terrain, country.mountains),
        fillSea(scene, trackScene)
    ];

    // Sky: the HDR lights the scene and feeds reflections, the photograph is what you see.
    const generator = new THREE.PMREMGenerator(renderer);
    environment.mapping = THREE.EquirectangularReflectionMapping;
    const envMap = generator.fromEquirectangular(environment).texture;
    generator.dispose();
    const background = new THREE.Texture(backdrop);
    background.mapping = THREE.EquirectangularReflectionMapping;
    background.colorSpace = THREE.SRGBColorSpace;
    background.needsUpdate = true;
    const previous = {
        environment: scene.environment, environmentIntensity: scene.environmentIntensity,
        background: scene.background, backgroundIntensity: scene.backgroundIntensity,
        fog: scene.fog, exposure: renderer.toneMappingExposure,
        hemisphere: [hemisphere.color.clone(), hemisphere.groundColor.clone(), hemisphere.intensity],
        sun: [sun.color.clone(), sun.intensity], fill: [fill.color.clone(), fill.intensity]
    };
    scene.environment = envMap;
    scene.environmentIntensity = 0.9;
    scene.background = background;
    scene.backgroundIntensity = 1.0;
    // Distance mist: near things are crisp, far ridges fade into the air.
    scene.fog = new THREE.Fog(theme.mist, ...theme.fog);
    renderer.toneMappingExposure = 0.95;

    hemisphere.color.set(theme.light[0]);
    hemisphere.groundColor.set(theme.light[1]);
    hemisphere.intensity = 0.55;
    sun.color.set(theme.light[2]);
    sun.intensity = theme.sky === 'dusk' ? 2.0 : 3.4;
    fill.color.set(theme.light[3]);
    fill.intensity = 0.3;

    const palette = theme.foliage.map(([r, g, b]) => new THREE.Color(r, g, b));
    const species = TREE_SPECIES.map((_, index) => ({ near: treeParts(treeModels[index * 2]), far: treeParts(treeModels[index * 2 + 1]) }));
    // Trees were placed on the exported ground: lift each with the relief under it.
    const planted = (meta.trees || []).map((tree) => ({ ...tree, position: [tree.position[0], tree.position[1] + crags(tree.position[0], tree.position[2]), tree.position[2]] }));
    const trees = plantTrees(scene, planted, species, {
        shadows: quality.shadows > 0,
        detailed: quality.particles >= 0.8,
        recolour: Boolean(theme.recolour),
        horizon: 700,
        tint: (tree, index) => palette[Math.abs(index * 13 + Math.floor(tree.position[2])) % palette.length]
    });

    return {
        sunOffset: sunDirection(environment).multiplyScalar(230),
        update() { trees.update(camera); },
        render() { renderer.render(scene, camera); },
        resize() {},
        dispose() {
            trees.dispose();
            for (const item of dressing) item.dispose();
            envMap.dispose();
            background.dispose();
            for (const map of terrainMaps) map.dispose();
            for (const material of owned) {
                for (const key of ['map', 'normalMap', 'roughnessMap']) material[key]?.dispose();
                material.dispose();
            }
            scene.environment = previous.environment;
            scene.environmentIntensity = previous.environmentIntensity;
            scene.background = previous.background;
            scene.backgroundIntensity = previous.backgroundIntensity;
            scene.fog = previous.fog;
            renderer.toneMappingExposure = previous.exposure;
            hemisphere.color.copy(previous.hemisphere[0]);
            hemisphere.groundColor.copy(previous.hemisphere[1]);
            hemisphere.intensity = previous.hemisphere[2];
            sun.color.copy(previous.sun[0]); sun.intensity = previous.sun[1];
            fill.color.copy(previous.fill[0]); fill.intensity = previous.fill[1];
        }
    };
}
