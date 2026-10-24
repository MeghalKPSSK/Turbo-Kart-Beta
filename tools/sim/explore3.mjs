import { spawn, run, kmh, makeBot } from './harness.mjs';
import { circleWorld } from './synthetic.mjs';

const vehicleId = process.argv[2] || 'car_apex_gp';

// --- straight: top speed + 0-100 + braking ---------------------------------------------
{
    const world = await circleWorld(6000);
    const car = spawn(world, vehicleId, { s: 10, lane: 0 });
    const bot = makeBot(world, car, { targetSpeed: 500 });
    let t100 = null, t200 = null, trace = [];
    run(world, 30, (t, step) => {
        bot.update();
        if (t100 === null && car.speed > 100 / 3.6) t100 = t;
        if (t200 === null && car.speed > 200 / 3.6) t200 = t;
        if (step % 240 === 0) trace.push(`${t.toFixed(0)}s:${kmh(car.speed)}`);
    });
    console.log(`[${vehicleId}] straight: 0-100 ${t100?.toFixed(2)}s, 0-200 ${t200?.toFixed(2)}s, speed trace km/h:`, trace.join(' '));
    console.log(`   top speed reached ${kmh(car.speed)} km/h (nominal ${kmh(car.spec.engine.topSpeed)})`);
    // nitro
    car.nitro = 1;
    let peak = 0;
    run(world, 6, (t) => { bot.update(); car.input.nitro = true; peak = Math.max(peak, car.speed); });
    console.log(`   with nitro peak ${kmh(peak)} km/h (nominal ${kmh(car.spec.engine.topSpeed * car.spec.engine.nitroTopSpeed)}), nitro left ${(car.nitro * 100).toFixed(0)}%`);
    car.input.nitro = false;
    // braking from current speed
    const v0 = car.speed; let d0 = bot.proj.s; let stopT = null;
    run(world, 8, (t) => { bot.update(); car.input.throttle = 0; car.input.brake = 1; if (stopT === null && car.speed < 1) stopT = t; });
    console.log(`   braking from ${kmh(v0)} km/h: stopped in ${stopT?.toFixed(2)}s, distance ${(bot.proj.s - d0).toFixed(0)} m, decel avg ${(v0 / (stopT || 8)).toFixed(1)} m/s2`);
    // then hold S -> reverse
    run(world, 3, () => { car.input.throttle = 0; car.input.brake = 1; });
    console.log(`   holding S after stop: speed ${car.speed.toFixed(1)} m/s (reversing=${car.reversing})`);
    run(world, 4, () => { car.input.throttle = 0; car.input.brake = 1; });
    console.log(`   4 s later: speed ${car.speed.toFixed(1)} m/s (reverse top ${car.spec.engine.reverseTopSpeed})`);
    run(world, 2.5, () => { car.input.throttle = 1; car.input.brake = 0; });
    console.log(`   then W: speed ${car.speed.toFixed(1)} m/s`);
}

// --- skidpad ---------------------------------------------------------------------------------
for (const radius of [40, 80]) {
    const world = await circleWorld(radius);
    let result = [];
    for (const target of [20, 26, 30, 34, 38, 44]) {
        const w2 = await circleWorld(radius);
        const car = spawn(w2, vehicleId, { s: 5, lane: 0, speed: target });
        const bot = makeBot(w2, car, { targetSpeed: target, lookahead: 0.35 });
        let maxLane = 0, minUp = 1;
        run(w2, 12, () => { bot.update(); maxLane = Math.max(maxLane, Math.abs(bot.proj.lane)); minUp = Math.min(minUp, car.up.y); });
        result.push(`${target}m/s(${kmh(target)}km/h): lane ${bot.proj.lane.toFixed(1)}, maxLane ${maxLane.toFixed(1)}, speed ${car.speed.toFixed(0)}, up ${minUp.toFixed(2)}, latG ${(car.lateralAccel / 9.81).toFixed(2)}`);
        w2.physics.dispose();
    }
    console.log(`skidpad R=${radius} m, theory vmax = sqrt(mu*g*R) = ${Math.sqrt(1.43 * 13 * radius).toFixed(1)} m/s`);
    console.log('   ' + result.join('\n   '));
}
