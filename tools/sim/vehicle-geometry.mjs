// Reads a vehicle GLB and returns the geometry of its visible body (everything that is not a
// wheel) as world-space vertices, the wheel pivots with their measured radii, and bounds.
// Shared by the asset check and the flip test.
import { resolve } from 'node:path';
import { MODELS } from './harness.mjs';
import { accessorData, readGlb } from './glb.mjs';

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function compose(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
    const [x, y, z, w] = q;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    return [
        (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
        (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
        (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
        t[0], t[1], t[2], 1
    ];
}

function multiply(a, b) {
    const out = new Array(16).fill(0);
    for (let c = 0; c < 4; c += 1) {
        for (let r = 0; r < 4; r += 1) {
            for (let k = 0; k < 4; k += 1) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
        }
    }
    return out;
}

const apply = (m, x, y, z) => [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
];

export const emptyBounds = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
export function grow(bounds, p) {
    for (let i = 0; i < 3; i += 1) {
        bounds.min[i] = Math.min(bounds.min[i], p[i]);
        bounds.max[i] = Math.max(bounds.max[i], p[i]);
    }
}

export function analyse(path) {
    const glb = readGlb(path);
    const { json } = glb;
    const body = emptyBounds();
    const bodyPoints = [];
    const wheels = [];

    const visit = (index, parentMatrix, wheel) => {
        const node = json.nodes[index];
        let world = multiply(parentMatrix, compose(node.translation, node.rotation, node.scale));
        let current = wheel;
        if (node.name.startsWith('WheelPivot_')) {
            // The game lifts wheels out of the scaled body: the pivot keeps its scaled position
            // but its meshes are measured in the pivot's own unscaled frame.
            current = { name: node.name, position: apply(world, 0, 0, 0), bounds: emptyBounds() };
            wheels.push(current);
            world = identity();
        }
        if (node.mesh !== undefined) {
            for (const primitive of json.meshes[node.mesh].primitives) {
                const { data } = accessorData(glb, primitive.attributes.POSITION);
                for (let i = 0; i < data.length; i += 3) {
                    const point = apply(world, data[i], data[i + 1], data[i + 2]);
                    grow(current ? current.bounds : body, point);
                    if (!current) bodyPoints.push(point);
                }
            }
        }
        for (const child of node.children || []) visit(child, world, current);
    };
    for (const root of json.scenes[0].nodes) visit(root, identity(), null);
    return { body, bodyPoints, wheels };
}


export const loadVehicleGeometry = (info) => analyse(resolve(MODELS, info.model));
