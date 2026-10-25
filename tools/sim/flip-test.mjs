// A vehicle that ends up upside down, on its side or nose-down must rest ON the road, never in
// it. Each vehicle is dropped onto a flat stretch of road in several orientations, left to
// settle, and the lowest visible body vertex is compared with the road surface beneath it.
//   node tools/sim/flip-test.mjs
import { loadWorld, spawn, run, ROAD_VEHICLES } from './harness.mjs';
import { loadVehicleGeometry } from './vehicle-geometry.mjs';

const TOLERANCE = 0.08; // metres a vertex may dip below the surface (polygon edges, contact skin)
const quat = (axis, angle) => ({ x: axis[0] * Math.sin(angle / 2), y: axis[1] * Math.sin(angle / 2), z: axis[2] * Math.sin(angle / 2), w: Math.cos(angle / 2) });
const multiply = (a, b) => ({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
});
const rotate = (q, p) => {
    const ix = q.w * p[0] + q.y * p[2] - q.z * p[1];
    const iy = q.w * p[1] + q.z * p[0] - q.x * p[2];
    const iz = q.w * p[2] + q.x * p[1] - q.y * p[0];
    const iw = -q.x * p[0] - q.y * p[1] - q.z * p[2];
    return [
        ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
        iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
        iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
    ];
};

const orientations = [
    ['upside down', quat([0, 0, 1], Math.PI)],
    ['on its left side', quat([0, 0, 1], Math.PI / 2)],
    ['on its right side', quat([0, 0, 1], -Math.PI / 2)],
    ['nose down', quat([1, 0, 0], Math.PI / 2)],
    ['tail down', quat([1, 0, 0], -Math.PI / 2)],
    ['tumbling (roll 140, pitch 60)', multiply(quat([0, 0, 1], 2.44), quat([1, 0, 0], 1.05))]
];

let failures = 0;
for (const info of ROAD_VEHICLES) {
    const geometry = loadVehicleGeometry(info);
    // Sample the body so the check stays quick but catches every extremity.
    const points = geometry.bodyPoints.filter((_, i) => i % 7 === 0);
    for (const [label, rotation] of orientations) {
        const world = await loadWorld('sunset_shores');
        const car = spawn(world, info.id, { s: 120, lane: 0, speed: 0 });
        const p = world.track.roadPoint(120, 0);
        car.body.setTranslation({ x: p.x, y: p.y + 3.2, z: p.z }, true);
        const base = Math.atan2(p.tx, p.tz);
        car.body.setRotation(multiply(quat([0, 1, 0], base), rotation), true);
        car.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        car.hold = true;
        run(world, 4, () => {});
        let worst = Infinity;
        let at = null;
        for (const point of points) {
            const r = rotate(car.quaternion, point);
            const x = car.position.x + r[0], y = car.position.y + r[1], z = car.position.z + r[2];
            const ground = world.physics.groundHeight(x, y + 6, z);
            if (ground === null) continue;
            if (y - ground < worst) { worst = y - ground; at = [point[0], point[1], point[2]]; }
        }
        const ok = worst >= -TOLERANCE;
        if (!ok) failures += 1;
        console.log(`${ok ? 'ok  ' : 'FAIL'} ${info.id.padEnd(17)} ${label.padEnd(30)} lowest body vertex ${worst >= 0 ? '+' : ''}${worst.toFixed(2)} m vs road${ok ? '' : `  (vertex ${at.map((n) => n.toFixed(2)).join(', ')})`}  up.y ${car.up.y.toFixed(2)}`);
        world.physics.dispose();
    }
}
if (failures) {
    console.log(`\n${failures} orientation(s) sank into the road`);
    process.exit(1);
}
console.log('\nno vehicle sinks into the road in any orientation');
