// Keyboard-steering stability at speed. Keys are digital, so a tap, a held turn and a
// bang-bang lane-keeping driver must all stay controllable on a straight road.
//   node tools/sim/steer-test.mjs [vehicleId]
import { spawn, run, FIXED_DT, ROAD_VEHICLES } from './harness.mjs';
import { circleWorld } from './synthetic.mjs';

const vehicleId = process.argv[2] || 'car_apex_gp';
if (!ROAD_VEHICLES.some((v) => v.id === vehicleId)) throw new Error(`Unknown vehicle ${vehicleId}`);
const deg = (r) => r * 180 / Math.PI;
const heading = (car) => Math.atan2(car.forward.x, car.forward.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function cruise(car, speed) {
    const error = speed - car.speed;
    car.input.throttle = error > 0 ? Math.min(1, error * 0.5) : 0;
    car.input.brake = error < -3 ? 0.3 : 0;
}

async function fresh(speed) {
    const world = await circleWorld(6000);
    const car = spawn(world, vehicleId, { s: 10, lane: 0, speed });
    run(world, 0.6, () => cruise(car, speed));
    const proj = {};
    world.track.project(car.position.x, car.position.z, -1, proj);
    return { world, car, h0: heading(car), lane0: proj.lane, proj };
}

console.log(`${vehicleId}: digital steering stability`);
for (const speed of [20, 35, 50, 65]) {
    // 1) a 0.25 s tap to the left, then hands off
    {
        const { world, car, h0, lane0, proj } = await fresh(speed);
        let peakYaw = 0, signChanges = 0, lastSign = 0, maxSlip = 0;
        const tapEnd = 0.25;
        for (let i = 0; i < Math.round(4.5 / FIXED_DT); i += 1) {
            const t = i * FIXED_DT;
            cruise(car, speed);
            car.input.steer = t < tapEnd ? 1 : 0;
            world.physics.step();
            const yaw = car.body.angvel().y;
            peakYaw = Math.max(peakYaw, Math.abs(yaw));
            if (t > 1.2 && Math.abs(yaw) > 0.01) {
                const sign = Math.sign(yaw);
                if (lastSign && sign !== lastSign) signChanges += 1;
                lastSign = sign;
            }
            maxSlip = Math.max(maxSlip, Math.abs(car.slipAngle));
        }
        world.track.project(car.position.x, car.position.z, -1, proj);
        console.log(`  ${String(speed).padStart(2)} m/s tap 0.25 s: heading ${deg(wrap(heading(car) - h0)).toFixed(1)}°, peak yaw ${deg(peakYaw).toFixed(1)}°/s, ` +
            `yaw sign flips after 1.2 s: ${signChanges}, max slip ${deg(maxSlip).toFixed(1)}°, lane drift ${(proj.lane - lane0).toFixed(1)} m, final yaw ${deg(car.body.angvel().y).toFixed(2)}°/s`);
    }
    // 2) hold left for 3 s
    {
        const { world, car } = await fresh(speed);
        let latAccel = 0, slip = 0, minSpeed = speed;
        for (let i = 0; i < Math.round(3 / FIXED_DT); i += 1) {
            cruise(car, speed);
            car.input.steer = 1;
            world.physics.step();
            latAccel = Math.abs(car.speed * car.body.angvel().y);
            slip = Math.abs(car.slipAngle);
            minSpeed = Math.min(minSpeed, car.speed);
        }
        console.log(`  ${String(speed).padStart(2)} m/s hold left 3 s: lat accel ${(latAccel / 9.81).toFixed(2)} g, slip ${deg(slip).toFixed(1)}°, min speed ${(minSpeed * 3.6).toFixed(0)} km/h, up.y ${car.up.y.toFixed(2)}`);
    }
    // 3) bang-bang lane keeping (what a keyboard player does)
    {
        const { world, car, proj } = await fresh(speed);
        const track = world.track;
        let maxLane = 0, sumSq = 0, n = 0;
        for (let i = 0; i < Math.round(12 / FIXED_DT); i += 1) {
            cruise(car, speed);
            if (i % 2 === 0) {
                track.project(car.position.x, car.position.z, -1, proj);
                const look = 12 + speed * 0.45;
                const tp = track.roadPoint(proj.s + look, 0);
                const dx = tp.x - car.position.x, dz = tp.z - car.position.z;
                const fl = Math.hypot(car.forward.x, car.forward.z) || 1;
                const angle = Math.atan2(-(car.forward.x * dz - car.forward.z * dx) / fl, (car.forward.x * dx + car.forward.z * dz) / fl);
                const steer = Math.max(-1, Math.min(1, angle * 2.2));
                car.input.steer = steer > 0.1 ? 1 : steer < -0.1 ? -1 : 0;
            }
            world.physics.step();
            if (i * FIXED_DT > 3) { maxLane = Math.max(maxLane, Math.abs(proj.lane)); sumSq += proj.lane * proj.lane; n += 1; }
        }
        console.log(`  ${String(speed).padStart(2)} m/s bang-bang keeping lane 0: max |lane| ${maxLane.toFixed(1)} m, rms ${Math.sqrt(sumSq / n).toFixed(1)} m`);
    }
}
