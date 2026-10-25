import { spawn, FIXED_DT, makeBot } from './harness.mjs';
import { circleWorld } from './synthetic.mjs';
const id = process.argv[2] || 'bike_vector';
const speed = Number(process.argv[3] || 38);
const world = await circleWorld(20000, { width: 1200, samples: 1440 });
const car = spawn(world, id, { s: 4, lane: 0, speed });
const bot = makeBot(world, car, { targetSpeed: speed, lookahead: 0.4 });
for (let i = 0; i < 144; i += 1) { bot.update(); world.physics.step(); }
console.log('yawAuthority', car.spec.yawAuthority.toFixed(1), 'Iy', car.spec.inertia.y.toFixed(0), 'mass', car.spec.mass, 'wheelbase', car.spec.wheelbase);
const deg = (r) => (r * 57.3).toFixed(0).padStart(4);
for (let i = 0; i < Math.round(1.6 / FIXED_DT); i += 1) {
  const t = i * FIXED_DT;
  const e = speed - car.speed; car.input.throttle = e > 0 ? Math.min(1, e * 0.6) : 0; car.input.brake = 0;
  car.input.steer = 1; car.input.handbrake = true;
  world.physics.step();
  if (i % 12 === 0) {
    const beta = Math.atan2(car.lateralSpeed, Math.max(2, car.speed));
    console.log(`t ${t.toFixed(2)} blend ${car.driftBlend.toFixed(2)} goal ${deg(car.driftSlip)}° beta ${deg(beta)}° yaw ${deg(car.body.angvel().y)}°/s course ${deg(car.courseRate)}°/s steerAng ${deg(car.steerAngle)}° steer ${car.steer.toFixed(2)} grounded ${car.groundedCount} speed ${car.speed.toFixed(1)} latV ${car.lateralSpeed.toFixed(1)}`);
  }
}
