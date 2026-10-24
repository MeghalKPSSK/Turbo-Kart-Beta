import { loadWorld, spawn, FIXED_DT } from './harness.mjs';

const trackId = process.argv[2] || 'sunset_shores';
const startS = Number(process.argv[3] || 390);
const endS = Number(process.argv[4] || 600);
const speed = Number(process.argv[5] || 45);
const analog = process.argv[6] === 'analog';
const world = await loadWorld(trackId);
const { track, physics } = world;
const car = spawn(world, 'car_apex_gp', { s: startS, lane: 0, speed });
const proj = {};
let next = startS;
const rows = [];
for (let i = 0; i < Math.round(12 / FIXED_DT); i += 1) {
    track.project(car.position.x, car.position.z, -1, proj);
    if (proj.s > endS || proj.s < startS - 5) break;
    car.input.throttle = 1;
    car.input.brake = 0;
    if (i % 2 === 0) {
        const look = 12 + car.speedAbs * 0.45;
        const tp = track.roadPoint(proj.s + look, 0);
        const dx = tp.x - car.position.x, dz = tp.z - car.position.z;
        const fl = Math.hypot(car.forward.x, car.forward.z) || 1;
        const angle = Math.atan2(-(car.forward.x * dz - car.forward.z * dx) / fl, (car.forward.x * dx + car.forward.z * dz) / fl);
        const steer = Math.max(-1, Math.min(1, angle * 2.2));
        car.input.steer = analog ? steer : steer > 0.1 ? 1 : steer < -0.1 ? -1 : 0;
    }
    physics.step();
    if (proj.s >= next) {
        const frame = track.frameAt(proj.s, {});
        rows.push(`s ${proj.s.toFixed(0)} lane ${proj.lane.toFixed(1)} kmh ${(car.speedAbs * 3.6).toFixed(0)} air ${car.airborne ? 1 : 0} kappa ${(frame.kappa ?? 0).toFixed(4)} y ${car.position.y.toFixed(2)} steer ${car.steer.toFixed(2)} hp ${car.health.toFixed(2)}`);
        next += 10;
    }
}
console.log(rows.join('\n'));
