// Fuzzes the physics for non-finite state. AI rivals race while "fuzz" cars get random inputs,
// teleports, flips and impulses. Any NaN/Infinity or disabled Rapier body fails the run.
//   node tools/sim/fuzz-nan.mjs [seconds=60] [seed=1] [trackId ...]
import { readdirSync } from 'node:fs';
import { loadWorld, spawn, FIXED_DT, ROAD_VEHICLES, MODELS } from './harness.mjs';
import { ProgressTracker } from '../../src/game/physics/progress.js';
import { AIDriver } from '../../src/game/ai/driver.js';
import { RIVAL_PROFILES } from '../../src/game/data/roadRacing.js';
import { CollisionSystem } from '../../src/game/systems/collisions.js';
import { recoverVehicle, needsRecovery, placeOnRoad } from '../../src/game/systems/raceRules.js';

const seconds = Number(process.argv[2] || 60);
const seed = Number(process.argv[3] || 1);
const requested = process.argv.slice(4);
const tracks = requested.length
    ? requested
    : readdirSync(MODELS).filter((f) => f.endsWith('.track.json')).map((f) => f.replace('.track.json', ''));

function rng(s) {
    let a = s >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const finite3 = (o) => Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z);
function problems(v) {
    const bad = [];
    if (!finite3(v.position)) bad.push('position');
    if (!finite3(v.velocity)) bad.push('velocity');
    if (!finite3(v.body.angvel())) bad.push('angvel');
    const q = v.quaternion;
    if (!Number.isFinite(q.x + q.y + q.z + q.w)) bad.push('quaternion');
    if (!v.body.isEnabled()) bad.push('body disabled');
    return bad;
}

function randomQuaternion(rand) {
    const u1 = rand(), u2 = rand(), u3 = rand();
    return {
        x: Math.sqrt(1 - u1) * Math.sin(2 * Math.PI * u2), y: Math.sqrt(1 - u1) * Math.cos(2 * Math.PI * u2),
        z: Math.sqrt(u1) * Math.sin(2 * Math.PI * u3), w: Math.sqrt(u1) * Math.cos(2 * Math.PI * u3)
    };
}

let failures = 0;
for (const trackId of tracks) {
    const rand = rng(seed * 7919 + trackId.length);
    const world = await loadWorld(trackId);
    const { track, physics } = world;
    const racers = [];
    for (let i = 0; i < 9; i += 1) {
        const vehicleId = ROAD_VEHICLES[(i + seed) % ROAD_VEHICLES.length].id;
        const fuzz = i >= 3;
        const car = spawn(world, vehicleId, { s: 30 + i * 9, lane: i % 2 ? 4 : -4, id: `${fuzz ? 'fuzz' : 'ai'}${i}` });
        const tracker = new ProgressTracker(track, car);
        const driver = fuzz ? null : new AIDriver({ track, vehicle: car, tracker, personality: RIVAL_PROFILES[i % RIVAL_PROFILES.length], pace: 1, seed: i + 1 });
        racers.push({ id: car.id, vehicle: car, tracker, driver, fuzz, nextInput: 0, nextEvent: 2 + rand() * 3, history: [], vehicleId });
    }
    for (let i = 0; i < 60; i += 1) physics.step();
    racers.forEach((r) => r.tracker.reset());
    const collisions = new CollisionSystem(physics);
    const tally = {};
    const events = [];
    let t = 0;
    let step = 0;
    let failed = null;

    while (t < seconds && !failed) {
        if (step % 2 === 0) {
            for (const r of racers) r.tracker.update(FIXED_DT * 2);
            for (const r of racers) {
                if (r.driver) {
                    r.driver.update(FIXED_DT * 2, { started: true, elapsed: t, racers, me: r, player: racers[0] });
                    if (r.driver.needsRespawn) {
                        r.driver.needsRespawn = false;
                        placeOnRoad(track, r.vehicle, r.tracker.s + 6, 0, 20);
                    }
                }
            }
        }
        for (const r of racers) {
            if (!r.fuzz) continue;
            const input = r.vehicle.input;
            if (t >= r.nextInput) {
                r.nextInput = t + 0.15 + rand() * 0.9;
                input.throttle = rand() < 0.65 ? 1 : rand() < 0.5 ? 0 : rand();
                input.brake = rand() < 0.25 ? 1 : 0;
                input.steer = rand() < 0.3 ? 0 : rand() * 2 - 1;
                input.nitro = rand() < 0.3;
                input.handbrake = rand() < 0.2;
            }
            if (t >= r.nextEvent) {
                r.nextEvent = t + 1.5 + rand() * 4;
                const v = r.vehicle;
                const kind = Math.floor(rand() * 6);
                const limit = track.halfWidth - 3;
                const s = rand() * track.length;
                events.push(`${t.toFixed(1)}s ${r.id} kind ${kind}`);
                if (kind === 0) placeOnRoad(track, v, s, (rand() * 2 - 1) * limit, rand() * 90);
                else if (kind === 1) {
                    const p = track.roadPoint(s, (rand() < 0.5 ? 1 : -1) * (track.halfWidth + 1 + rand() * 4));
                    v.place(p.x, p.y + 0.6, p.z, { x: p.tx, y: p.ty, z: p.tz }, rand() * 70);
                } else if (kind === 2) {
                    v.body.setRotation(randomQuaternion(rand), true);
                    v.body.setAngvel({ x: (rand() - 0.5) * 12, y: (rand() - 0.5) * 12, z: (rand() - 0.5) * 12 }, true);
                } else if (kind === 3) {
                    const m = v.spec.mass * 14;
                    v.body.applyImpulse({ x: (rand() - 0.5) * m, y: rand() * m * 0.6, z: (rand() - 0.5) * m }, true);
                } else if (kind === 4) {
                    v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
                    v.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
                } else {
                    const p = track.roadPoint(s, 0);
                    v.place(p.x, p.y + rand() * 6, p.z, { x: p.tx, y: p.ty, z: p.tz }, 40 + rand() * 50);
                    v.body.setAngvel({ x: (rand() - 0.5) * 6, y: (rand() - 0.5) * 6, z: (rand() - 0.5) * 6 }, true);
                }
            }
        }
        physics.step();
        if (step % 4 === 0) {
            for (const ev of collisions.update(FIXED_DT * 4)) tally[ev.type] = (tally[ev.type] || 0) + 1;
        }
        for (const r of racers) if (needsRecovery(r.vehicle)) recoverVehicle(track, r.tracker, r.vehicle);
        for (const r of racers) {
            const v = r.vehicle;
            r.history.push({ t: +t.toFixed(3), pos: [v.position.x, v.position.y, v.position.z].map((n) => +n.toFixed(3)), vel: [v.velocity.x, v.velocity.y, v.velocity.z].map((n) => +n.toFixed(3)), q: [v.quaternion.x, v.quaternion.y, v.quaternion.z, v.quaternion.w].map((n) => +n.toFixed(4)), input: { ...v.input }, mode: v.mode });
            if (r.history.length > 6) r.history.shift();
            const bad = problems(v);
            if (bad.length) { failed = { r, bad, t }; break; }
        }
        step += 1;
        t += FIXED_DT;
    }

    if (failed) {
        failures += 1;
        console.log(`FAIL ${trackId} ${failed.r.id} (${failed.r.vehicleId}) at ${failed.t.toFixed(2)}s: ${failed.bad.join(', ')}`);
        console.log('  recent events:', events.slice(-4).join(' | '));
        for (const h of failed.r.history) console.log('  ', JSON.stringify(h));
    } else {
        console.log(`ok   ${trackId.padEnd(18)} ${seconds}s  events ${JSON.stringify(tally)}  fuzz actions ${events.length}`);
    }
    physics.dispose();
}

if (failures) {
    console.log(`\n${failures} track(s) produced non-finite physics state`);
    process.exit(1);
}
console.log('\nno non-finite physics state');
