import { spawn, FIXED_DT, makeBot } from './harness.mjs';
import { circleWorld } from './synthetic.mjs';
const id = process.argv[2] || 'bike_vector';
const speed = Number(process.argv[3] || 25);
const world = await circleWorld(20000, { width: 1200, samples: 1440 });
const car = spawn(world, id, { s: 4, lane: 0, speed });
const bot = makeBot(world, car, { targetSpeed: speed, lookahead: 0.4 });
for (let i = 0; i < 144; i += 1) { bot.update(); world.physics.step(); }
const deg = (r) => (r * 57.3).toFixed(0).padStart(4);
console.log(id, 'maxSteer', car.spec.tires.maxSteer, 'steerLimit@v', car.steerLimit(speed).toFixed(3), 'latAccelLimit', car.latAccelLimit(speed).toFixed(1), 'Iy', car.spec.inertia.y.toFixed(0));
let prev = { x: car.velocity.x, z: car.velocity.z };
for (let i = 0; i < Math.round(2.0 / FIXED_DT); i += 1) {
  const t = i * FIXED_DT;
  const e = speed - car.speed; car.input.throttle = e > 0 ? Math.min(1, e * 0.6) : 0; car.input.brake = 0;
  car.input.steer = 1; car.input.handbrake = false;
  world.physics.step();
  const v = car.velocity;
  const aLat = Math.hypot(v.x - prev.x, v.z - prev.z) / FIXED_DT; prev = { x: v.x, z: v.z };
  if (i % 12 === 0 && t < 1.6) {
    const beta = Math.atan2(car.lateralSpeed, Math.max(2, car.speed));
    console.log(`t ${t.toFixed(2)} steerAng ${deg(car.steerAngle)}° yaw ${deg(car.body.angvel().y)}°/s course ${deg(car.courseRate)}°/s beta ${deg(beta)}° aLat ${aLat.toFixed(1)} m/s² speed ${car.speed.toFixed(1)} sliding ${car._sliding}`);
  }
}
