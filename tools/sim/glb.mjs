// Minimal GLB reader for the headless tools: pulls the road/ramp triangles (by material
// name) out of an exported circuit so the real Blender collision mesh can be simulated
// without a browser. Mirrors what RoadRaceGame does with the loaded glTF scene.

import { readFileSync } from 'node:fs';

const COMPONENT = {
    5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2],
    5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4]
};
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function readGlb(path) {
    const buffer = readFileSync(path);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error(`${path} is not a GLB file`);
    let offset = 12;
    let json = null;
    let bin = null;
    while (offset < buffer.byteLength) {
        const length = view.getUint32(offset, true);
        const type = view.getUint32(offset + 4, true);
        const start = offset + 8;
        if (type === 0x4e4f534a) json = JSON.parse(buffer.subarray(start, start + length).toString('utf8'));
        else if (type === 0x004e4942) bin = buffer.subarray(start, start + length);
        offset = start + length;
    }
    return { json, bin };
}

export function accessorData({ json, bin }, index) {
    const accessor = json.accessors[index];
    const bufferView = json.bufferViews[accessor.bufferView];
    const [Type, bytes] = COMPONENT[accessor.componentType];
    const width = WIDTH[accessor.type];
    const stride = bufferView.byteStride || bytes * width;
    const base = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const out = new Float64Array(accessor.count * width);
    const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    const read = {
        5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true),
        5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true)
    }[accessor.componentType];
    for (let i = 0; i < accessor.count; i += 1) {
        for (let c = 0; c < width; c += 1) out[i * width + c] = read(base + i * stride + c * bytes);
    }
    void Type;
    return { data: out, width };
}

// Triangle soup for every primitive whose material name matches `pattern`.
export function collectTriangles(glb, pattern) {
    const positions = [];
    const indices = [];
    for (const mesh of glb.json.meshes) {
        for (const primitive of mesh.primitives) {
            const material = glb.json.materials[primitive.material]?.name || '';
            if (!pattern.test(material)) continue;
            const pos = accessorData(glb, primitive.attributes.POSITION).data;
            const idx = primitive.indices !== undefined
                ? accessorData(glb, primitive.indices).data
                : Array.from({ length: pos.length / 3 }, (_, i) => i);
            const offset = positions.length / 3;
            for (let i = 0; i < pos.length; i += 1) positions.push(pos[i]);
            for (let i = 0; i < idx.length; i += 1) indices.push(idx[i] + offset);
        }
    }
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

export function roadGeometryFromGlb(path) {
    const glb = readGlb(path);
    const road = collectTriangles(glb, /Track_Asphalt|JumpRamp_Sidewall/);
    if (!road.positions.length) throw new Error(`No road geometry found in ${path}`);
    return road;
}
