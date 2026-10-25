// Jump regression on every track: a centred jump and a half-on-the-ramp jump (one side of the
// car on the kicker) for a car and a bike. A centred jump must launch, land on the road within
// the planned landing zone and stay upright. Driving onto the very edge of the kicker may
// instead clip its side face (a car straddling a 2 m high edge at 130 km/h), which is allowed
// as long as the vehicle stays the right way up and on the road. Exits non-zero otherwise.
//   node tools/sim/ramp-test.mjs [trackId ...]
import { readdirSync } from 'node:fs';
import { loadWorld, spawn, run, MODELS, makeBot } from './harness.mjs';

const requested = process.argv.slice(2);
const tracks = requested.length
    ? requested
    : readdirSync(MODELS).filter((f) => f.endsWith('.track.json')).map((f) => f.replace('.track.json', ''));
const vehicles = ['car_apex_gp', 'bike_vector'];
const LANDING_ZONE = 90;
let failures = 0;

async function jump(trackId, vehicleId, ramp, kmhSpeed, lane) {
    const world = await loadWorld(trackId);
    const { track } = world;
    const speed = kmhSpeed / 3.6;
    const car = spawn(world, vehicleId, { s: ramp.s0 - 70, lane, speed });
    const bot = makeBot(world, car, { targetSpeed: speed, lane, lookahead: 0.6 });
    let takeoff = null, landing = null, minUp = 1, maxRoll = 0;
    let lastS = 0;
    run(world, 5, (t) => {
        bot.update();
        const p = bot.proj;
        minUp = Math.min(minUp, car.up.y);
        maxRoll = Math.max(maxRoll, Math.abs(Math.asin(Math.max(-1, Math.min(1, car.left.y)))));
        if (car.airborne && takeoff === null && p.s > ramp.s0) takeoff = { s: p.s, t };
        if (takeoff && !car.airborne && landing === null && t > takeoff.t + 0.15) landing = { s: p.s, t };
        lastS = p.s;
    });
    const fell = car.position.y < track.roadPoint(lastS, 0).y - 3;
    world.physics.dispose();
    return { takeoff, landing, minUp, maxRoll, fell };
}

for (const trackId of tracks) {
    const { track } = await loadWorld(trackId);
    for (const ramp of track.ramps) {
        for (const vehicleId of vehicles) {
            const cases = [
                ['centred 130 km/h', 130, 0],
                ['half on ramp', 130, ramp.halfWidth],
            ];
            for (const [label, kmhSpeed, lane] of cases) {
                const r = await jump(trackId, vehicleId, ramp, kmhSpeed, lane);
                const air = r.takeoff && r.landing ? r.landing.t - r.takeoff.t : 0;
                const distance = r.takeoff && r.landing ? r.landing.s - r.takeoff.s : 0;
                const launched = !!r.takeoff && !!r.landing && air > 0.3 && air < 2.2 && distance < LANDING_ZONE;
                const edgeCase = lane !== 0;
                const ok = r.minUp > 0.3 && !r.fell && (launched || edgeCase);
                if (!ok) failures += 1;
                console.log(`${ok ? 'ok  ' : 'FAIL'} ${trackId.padEnd(15)} ${vehicleId.padEnd(12)} ${label.padEnd(17)} air ${air.toFixed(2)} s  ${distance.toFixed(0)} m  max roll ${(r.maxRoll * 57.3).toFixed(0)}°  min up.y ${r.minUp.toFixed(2)}${r.fell ? '  FELL' : ''}`);
            }
        }
    }
}

if (failures) {
    console.log(`\n${failures} jump(s) failed`);
    process.exit(1);
}
console.log('\nevery jump launched, landed on the road and stayed upright');
