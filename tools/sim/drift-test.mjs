// Drift behaviour on a skidpad: approach straight, then hold throttle + handbrake + steer for a
// few seconds, then release the handbrake (and later everything). A controllable drift holds a
// steady slip angle without spinning, keeps most of its speed and recovers when released.
//   node tools/sim/drift-test.mjs [vehicleId] [speed m/s] [radius m] [verbose]
import { spawn, FIXED_DT, ROAD_VEHICLES } from './harness.mjs';
import { circleWorld } from './synthetic.mjs';

const deg = (r) => r * 180 / Math.PI;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export async function driftRun(vehicleId, speed, _unusedRadius, { handbrake = true, steer = 1, hold = 4, release = 2.5, verbose = false, steerPattern = null } = {}) {
    // A huge, flat, wall-free pad: only the car's own behaviour is measured.
    const world = await circleWorld(20000, { width: 1200, samples: 1440 });
    const car = spawn(world, vehicleId, { s: 4, lane: 0, speed });
    const cruise = (target) => {
        const e = target - car.speed;
        car.input.throttle = e > 0 ? Math.min(1, e * 0.6) : 0;
        car.input.brake = 0;
    };
    // straight-line approach is the first part of the circle; run to speed on the line
    const bot = (await import('./harness.mjs')).makeBot(world, car, { targetSpeed: speed, lookahead: 0.4 });
    for (let i = 0; i < Math.round(1.2 / FIXED_DT); i += 1) { bot.update(); world.physics.step(); }
    const log = [];
    let heading0 = Math.atan2(car.forward.x, car.forward.z);
    let course0 = Math.atan2(car.velocity.x, car.velocity.z);
    const total = hold + release + 2;
    let maxSlip = 0, minSpeed = 1e9, spunAt = null, yawSum = 0, yawN = 0;
    const proj = {};
    let heading = heading0, unwrapped = 0, lastHeading = heading0;
    for (let i = 0; i < Math.round(total / FIXED_DT); i += 1) {
        const t = i * FIXED_DT;
        cruise(speed);
        const holding = t < hold;
        const releasing = t >= hold && t < hold + release;
        const steerNow = steerPattern ? steerPattern(t) : (holding || releasing ? steer : 0);
        car.input.steer = steerNow;
        car.input.handbrake = handbrake && holding;
        world.physics.step();
        const h = Math.atan2(car.forward.x, car.forward.z);
        unwrapped += wrap(h - lastHeading);
        lastHeading = h;
        const course = Math.atan2(car.velocity.x, car.velocity.z);
        const beta = wrap(course - h);
        if (car.speedAbs > 8) maxSlip = Math.max(maxSlip, Math.abs(beta));
        minSpeed = Math.min(minSpeed, car.speedAbs);
        if (holding && t > 1) { yawSum += car.body.angvel().y; yawN += 1; }
        if (spunAt === null && Math.abs(beta) > 1.9 && car.speedAbs > 6) spunAt = t;
        if (i % Math.round(0.25 / FIXED_DT) === 0) {
            world.track.project(car.position.x, car.position.z, -1, proj);
            log.push({ t, speed: car.speedAbs, beta: deg(beta), yaw: deg(car.body.angvel().y), lane: proj.lane, grounded: car.groundedCount, turned: deg(unwrapped), hb: car.input.handbrake ? 1 : 0, steer: car.steerAngle });
        }
    }
    world.physics.dispose();
    void heading; void course0; void heading0;
    if (verbose) {
        for (const r of log) console.log(`  t ${r.t.toFixed(2)}  ${r.hb ? 'HB' : '  '}  speed ${(r.speed * 3.6).toFixed(0).padStart(3)} km/h  slip ${r.beta.toFixed(0).padStart(4)}°  yaw ${r.yaw.toFixed(0).padStart(4)}°/s  turned ${r.turned.toFixed(0).padStart(4)}°  lane ${r.lane.toFixed(1)}  steer ${deg(r.steer).toFixed(0)}°`);
    }
    const end = log[log.length - 1];
    return { maxSlip: deg(maxSlip), minSpeed, spunAt, meanYaw: deg(yawSum / Math.max(1, yawN)), endSpeed: end.speed, endSlip: Math.abs(end.beta), log };
}

if (process.argv[1].endsWith('drift-test.mjs')) {
    const vehicleId = process.argv[2] || 'car_apex_gp';
    const speed = Number(process.argv[3] || 35);
    const radius = 0;
    const verbose = process.argv[5] === 'verbose';
    if (!ROAD_VEHICLES.some((v) => v.id === vehicleId)) throw new Error(`Unknown vehicle ${vehicleId}`);
    for (const [label, opts] of [['grip turn (no handbrake)', { handbrake: false }], ['drift (handbrake + steer)', { handbrake: true }]]) {
        const r = await driftRun(vehicleId, speed, radius, { ...opts, verbose });
        console.log(`${label.padEnd(28)} max slip ${r.maxSlip.toFixed(0).padStart(3)}°  mean yaw ${r.meanYaw.toFixed(0).padStart(3)}°/s  min speed ${(r.minSpeed * 3.6).toFixed(0)} km/h  end speed ${(r.endSpeed * 3.6).toFixed(0)} km/h  ${r.spunAt !== null ? 'SPUN OUT at ' + r.spunAt.toFixed(1) + ' s' : 'no spin'}`);
    }
}
