import { spawn, FIXED_DT } from './harness.mjs';
import { circleWorld } from './synthetic.mjs';

const vehicleId = process.argv[2] || 'car_apex_gp';
const speed = Number(process.argv[3] || 35);
const world = await circleWorld(6000);
const car = spawn(world, vehicleId, { s: 10, lane: 0, speed });
const proj = {};
const deg = (r) => (r * 180 / Math.PI).toFixed(1);
const cruise = () => { const e = speed - car.speed; car.input.throttle = e > 0 ? Math.min(1, e * 0.5) : 0; car.input.brake = 0; };
for (let i = 0; i < Math.round(0.6 / FIXED_DT); i += 1) { cruise(); world.physics.step(); }
world.track.project(car.position.x, car.position.z, -1, proj);
const lane0 = proj.lane;
const h0 = Math.atan2(car.forward.x, car.forward.z);
console.log(`start: speed ${car.speed.toFixed(1)} lane ${lane0.toFixed(2)} grounded ${car.groundedCount} up.y ${car.up.y.toFixed(3)}`);
for (let i = 0; i < Math.round(3 / FIXED_DT); i += 1) {
    const t = i * FIXED_DT;
    cruise();
    car.input.steer = t < 0.25 ? 1 : 0;
    world.physics.step();
    if (i % 12 === 0) {
        world.track.project(car.position.x, car.position.z, -1, proj);
        const h = Math.atan2(car.forward.x, car.forward.z);
        console.log(`t ${t.toFixed(2)} steerIn ${car.input.steer} steer ${car.steer.toFixed(2)} angle ${deg(car.steerAngle)}° yaw ${deg(car.body.angvel().y)}°/s heading ${deg(Math.atan2(Math.sin(h - h0), Math.cos(h - h0)))}° slip ${deg(car.slipAngle)}° latV ${car.lateralSpeed.toFixed(2)} lane ${(proj.lane - lane0).toFixed(2)} spd ${car.speed.toFixed(1)} gc ${car.groundedCount} roll ${car.up.x.toFixed(2)}`);
    }
}
