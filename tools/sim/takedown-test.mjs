import { spawn, run, kmh, makeBot, FIXED_DT } from './harness.mjs';
import { circleWorld } from './synthetic.mjs';
import { CollisionSystem } from '../../src/game/systems/collisions.js';
import { ProgressTracker } from '../../src/game/physics/progress.js';
import { recoverVehicle, needsRecovery } from '../../src/game/systems/raceRules.js';

for (const [label, attackerSpeed, victimSpeed, lateral] of [['hard rear-end', 70, 40, 0], ['gentle tap', 42, 40, 0], ['side swipe', 55, 55, -2.2], ['head-on-ish rear hit slow victim', 60, 15, 0.4]]) {
    const world = await circleWorld(6000);
    const victim = spawn(world, 'car_vector_gp', { s: 60, lane: 0, speed: victimSpeed, id: 'victim' });
    const attacker = spawn(world, 'car_apex_gp', { s: 60 - 14, lane: lateral, speed: attackerSpeed, id: 'attacker' });
    const vb = makeBot(world, victim, { targetSpeed: victimSpeed });
    const ab = makeBot(world, attacker, { targetSpeed: attackerSpeed + 30, lane: lateral });
    const vt = new ProgressTracker(world.track, victim);
    const col = new CollisionSystem(world.physics);
    const log = [];
    let wreckedAt = null, recovered = null, maxUpTilt = 1, maxSpin = 0;
    run(world, 7, (t, step) => {
        vb.update(); if (victim.mode === 'ok') { /* keep driving */ }
        ab.update();
        vt.update(FIXED_DT);
        if (step % 4 === 0) {
            for (const ev of col.update(FIXED_DT * 4)) {
                if (ev.type === 'vehicle') log.push(`  t=${t.toFixed(2)} contact closing=${ev.closing.toFixed(1)} m/s`);
                if (ev.type === 'takedown') { log.push(`  t=${t.toFixed(2)} TAKEDOWN ${ev.attacker.id} -> ${ev.victim.id} closing=${ev.closing.toFixed(1)}`); wreckedAt = t; }
            }
        }
        if (victim.mode === 'wrecked') { maxUpTilt = Math.min(maxUpTilt, victim.up.y); maxSpin = Math.max(maxSpin, Math.abs(victim.yawRate)); }
        if (needsRecovery(victim)) { recoverVehicle(world.track, vt, victim); recovered = t; }
    });
    console.log(`[${label}] attacker ${attackerSpeed} m/s vs victim ${victimSpeed} m/s: wrecked=${wreckedAt !== null} (min up.y ${maxUpTilt.toFixed(2)}, peak yaw ${maxSpin.toFixed(1)} rad/s) recovered at ${recovered?.toFixed(1)} s, victim hp ${(victim.health * 100).toFixed(0)}%, attacker hp ${(attacker.health * 100).toFixed(0)}%`);
    console.log(log.slice(0, 6).join('\n'));
    world.physics.dispose();
}
