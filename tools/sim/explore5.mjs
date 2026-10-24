import { loadWorld, spawn, run, kmh, makeBot } from './harness.mjs';

const trackId = process.argv[2] || 'ember_crater';
const vehicleId = process.argv[3] || 'car_apex_gp';
const deg = (r) => (r * 180 / Math.PI).toFixed(1);

async function jump(speedKmh, lane) {
    const world = await loadWorld(trackId);
    const { track } = world;
    const ramp = track.ramps[0];
    const speed = speedKmh / 3.6;
    // approach from 70 m before the ramp at the target speed on the requested lane
    const car = spawn(world, vehicleId, { s: ramp.s0 - 70, lane, speed });
    const bot = makeBot(world, car, { targetSpeed: speed, lane, lookahead: 0.6 });
    let apex = -1e9, tAir = 0, takeoff = null, landing = null, maxRoll = 0, maxPitch = 0, rollAtLip = 0, rollLand = 0, minUp = 1, airFrames = 0;
    let lastS = 0, groundBeforeLip = 0;
    run(world, 6, (t) => {
        bot.update();
        const p = bot.proj;
        const roll = Math.asin(Math.max(-1, Math.min(1, car.left.y)));
        const pitch = Math.asin(Math.max(-1, Math.min(1, car.forward.y)));
        maxRoll = Math.max(maxRoll, Math.abs(roll));
        maxPitch = Math.max(maxPitch, Math.abs(pitch));
        minUp = Math.min(minUp, car.up.y);
        if (car.airborne && takeoff === null && p.s > ramp.s0) { takeoff = { s: p.s, t, roll }; }
        if (takeoff && !car.airborne && landing === null && t > takeoff.t + 0.15) { landing = { s: p.s, t, roll, pitch, vy: car.landingImpact }; }
        if (car.airborne) { apex = Math.max(apex, car.position.y - track.roadPoint(p.s, p.lane).y); airFrames += 1; }
        lastS = p.s;
    });
    const roadAfter = track.roadPoint(lastS, 0);
    const fell = car.position.y < roadAfter.y - 3;
    console.log(`${String(speedKmh).padStart(3)} km/h lane ${String(lane).padStart(5)}: ` + (takeoff ? `air ${(landing ? landing.t - takeoff.t : NaN).toFixed(2)}s  dist ${(landing ? landing.s - takeoff.s : NaN).toFixed(0)}m  apex ${apex.toFixed(2)}m  maxRoll ${deg(maxRoll)} maxPitch ${deg(maxPitch)}  rollAtLand ${landing ? deg(landing.roll) : '-'}  landVy ${landing ? landing.vy.toFixed(1) : '-'}  minUp ${minUp.toFixed(2)} fell=${fell} endSpeed ${kmh(car.speed)}` : 'no takeoff'));
    world.physics.dispose();
}

const { track } = await loadWorld(trackId);
console.log(trackId, 'ramp', JSON.stringify(track.ramps[0]));
console.log('--- centred jumps at different speeds');
for (const v of [90, 130, 180, 230]) await jump(v, 0);
console.log('--- partial ramp (only one side of the car on the ramp), 150 km/h');
const hw = track.ramps[0].halfWidth;
for (const lane of [hw - 3, hw - 1.5, hw, hw + 1.0, hw + 2.2, -hw]) await jump(150, Number(lane.toFixed(2)));
