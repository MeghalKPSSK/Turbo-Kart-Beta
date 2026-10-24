import { loadWorld, spawn, run, kmh } from './harness.mjs';

const world = await loadWorld('sunset_shores');
const { track } = world;
console.log('track', track.id, 'length', track.length.toFixed(0), 'ramps', track.ramps.length, 'hazards', track.hazards.length);

// 1) settle
let car = spawn(world, 'car_apex_gp', { s: 30, lane: 0 });
console.log('mass', car.body.mass().toFixed(0), 'com', JSON.stringify(car.body.localCom()), 'start pos y', car.position.y.toFixed(3));
run(world, 2.0, null);
const settle = world.track.roadPoint(30, 0);
console.log('after 2s settle: y=', car.position.y.toFixed(3), 'road y', settle.y.toFixed(3), 'speed', car.speed.toFixed(3), 'grounded', car.groundedCount);
console.log('wheel compression', car.wheels.map((w) => w.compression.toFixed(3)).join(' '), ' loads(N)', car.wheels.map((w) => w.load.toFixed(0)).join(' '));
console.log('up', car.up.y.toFixed(4));
