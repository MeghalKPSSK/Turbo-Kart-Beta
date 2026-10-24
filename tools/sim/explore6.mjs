import { loadWorld, spawn, run, kmh, makeBot } from './harness.mjs';
const trackId = process.argv[2] || 'ember_crater';
const vehicleId = process.argv[3] || 'car_apex_gp';
const deg = (r) => (r * 180 / Math.PI).toFixed(0);
const base = await loadWorld(trackId);
const ramp = base.track.ramps[0];
base.physics.dispose();
console.log('ramp half width', ramp.halfWidth);
for (const lane of [7.2, 7.6, 8.0, 8.4, 8.8, -7.2, -7.6, -8.0, -8.4, -8.8]) {
    const world = await loadWorld(trackId);
    const { track } = world;
    const car = spawn(world, vehicleId, { s: ramp.s0 - 60, lane, speed: 42 });
    const bot = makeBot(world, car, { targetSpeed: 42, lane, lookahead: 0.6 });
    let maxRoll = 0, minUp = 1, minAir = null, airMax = 0, rollSeq = [], minGround = 99, sawAir = false;
    run(world, 4.5, (t, step) => {
        bot.update();
        const roll = Math.asin(Math.max(-1, Math.min(1, car.left.y)));
        maxRoll = Math.max(maxRoll, Math.abs(roll));
        minUp = Math.min(minUp, car.up.y);
        minGround = Math.min(minGround, car.groundedCount);
        airMax = Math.max(airMax, car.airTime);
        if (car.airborne) sawAir = true;
        if (step % 30 === 0 && bot.proj.s > ramp.s0 - 12 && bot.proj.s < ramp.s1 + 45) rollSeq.push(`${bot.proj.s.toFixed(0)}:${deg(roll)}°/${car.groundedCount}w/lane${bot.proj.lane.toFixed(1)}`);
    });
    console.log(`lane ${String(lane).padStart(5)}: maxRoll ${deg(maxRoll)}° minUp ${minUp.toFixed(2)} fewestWheels ${minGround} maxAir ${airMax.toFixed(2)}s  endLane ${bot.proj.lane.toFixed(1)}  ${rollSeq.slice(0, 9).join(' ')}`);
    world.physics.dispose();
}
