import { spawn, FIXED_DT, makeBot } from './harness.mjs';
import { circleWorld } from './synthetic.mjs';
const id = process.argv[2] || 'car_apex_gp';
const speed = Number(process.argv[3] || 38);
const world = await circleWorld(20000, { width: 1200, samples: 1440 });
const car = spawn(world, id, { s: 4, lane: 0, speed });
const bot = makeBot(world, car, { targetSpeed: speed, lookahead: 0.4 });
for (let i = 0; i < 144; i += 1) { bot.update(); world.physics.step(); }
let prev = { x: car.velocity.x, y: car.velocity.y, z: car.velocity.z };
for (let i = 0; i < Math.round(2.0 / FIXED_DT); i += 1) {
  const t = i * FIXED_DT;
  car.input.throttle = 0; car.input.brake = 0; car.input.steer = 1; car.input.handbrake = true;
  world.physics.step();
  const v = car.velocity; const sp = Math.hypot(v.x, v.z);
  const ux = v.x / sp, uz = v.z / sp;
  const aAlong = ((v.x - prev.x) * ux + (v.z - prev.z) * uz) / FIXED_DT;
  prev = { x: v.x, y: v.y, z: v.z };
  if (i % 24 === 0) console.log(`t ${t.toFixed(2)} speed ${sp.toFixed(2)} aAlong ${aAlong.toFixed(2)} m/s²  blend ${car.driftBlend.toFixed(2)} latForceSum/m ${(car._lastLatForce / car.spec.mass).toFixed(1)} nitro ${car.nitroActive}`);
}
