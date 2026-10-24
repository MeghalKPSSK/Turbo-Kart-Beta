import { spawn, run, kmh } from './harness.mjs';
import { circleWorld } from './synthetic.mjs';
const world = await circleWorld(6000);
const car = spawn(world, 'car_apex_gp', { s: 10, lane: 0 });
run(world, 1.5, null);
console.log('settled speed', car.speed.toFixed(3));
for (let k = 0; k < 8; k += 1) {
    run(world, 0.5, () => { car.input.throttle = 0; car.input.brake = 1; });
    const w = car.wheels[2];
    console.log(`t=${(k * 0.5 + 0.5).toFixed(1)} speed=${car.speed.toFixed(3)} reversing=${car.reversing} mode=${car.mode} grounded=${car.groundedCount} load=${w.load.toFixed(0)} vLong=${w.vLong.toFixed(3)}`);
}
