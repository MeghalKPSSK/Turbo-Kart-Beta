// A keyboard-style driver for the headless tests: it can only press left / right / throttle /
// brake / drift (no analogue steering), reacts after a delay, steers toward a look-ahead
// point and brakes for corners with an imperfect idea of how fast it can go. If a car can
// be lapped by this driver without constant wall hits, a person can drive it too.
import { buildRacingLine, sampleAt } from '../../src/game/ai/racingLine.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function makeKeyboardDriver(world, vehicle, options = {}) {
    const o = {
        reaction: 0.12,       // seconds between seeing something and pressing a key
        deadband: 0.2,        // steering demand below this releases the key
        lookTime: 0.42,       // how far ahead (seconds of travel) the driver aims
        aLat: 15,             // lateral acceleration the driver believes the car can hold (m/s²)
        brakeDecel: 14,       // braking the driver plans with (m/s²)
        speedBias: 1.0,       // >1 brakes late, <1 brakes early
        useLine: true,        // follow an outside-inside-outside line instead of the centre
        drift: 'off',         // 'off' | 'corners' (hold the handbrake while turning in hard)
        driftSpeed: 24,       // only drift above this speed (m/s)
        ...options
    };
    const { track } = world;
    const line = o.useLine ? buildRacingLine(track) : null;
    const proj = {};
    let hint = -1;
    let time = 0;
    const queue = [];
    const driver = {
        proj,
        pressed: { left: false, right: false, throttle: false, brake: false, drift: false },
        update(dt) {
            time += dt;
            track.project(vehicle.position.x, vehicle.position.z, hint, proj);
            hint = proj.index;
            const speed = Math.max(0, vehicle.speed);
            const lookahead = Math.max(9, speed * o.lookTime + 6);
            let lane = line ? sampleAt(track, line, proj.s + lookahead) : 0;
            // Steer around the next obstacle once it is close enough to be seen.
            for (const hazard of track.hazards) {
                const ahead = track.wrapS(hazard.s - proj.s);
                if (ahead > 4 && ahead < 38 + speed * 0.9 && Math.abs(lane - hazard.lane) < hazard.half[0] + 3.4) {
                    const side = hazard.lane >= 0 ? -1 : 1;
                    lane = hazard.lane + side * (hazard.half[0] + 3.4);
                }
            }
            const target = track.roadPoint(proj.s + lookahead, clamp(lane, -track.halfWidth + 3, track.halfWidth - 3));
            const dx = target.x - vehicle.position.x;
            const dz = target.z - vehicle.position.z;
            const forward = dx * vehicle.forward.x + dz * vehicle.forward.z;
            const side = dx * vehicle.left.x + dz * vehicle.left.z;
            const alpha = Math.atan2(side, Math.max(0.1, forward));
            const wheelAngle = Math.atan2(2 * vehicle.spec.wheelbase * Math.sin(alpha), lookahead);
            const demand = wheelAngle / Math.max(0.05, vehicle.steerLimit());

            const brakingDistance = (speed * speed) / (2 * o.brakeDecel) + 20;
            const kappa = track.maxCurvature(proj.s, brakingDistance);
            const cornerSpeed = kappa > 1e-4 ? Math.sqrt(o.aLat / kappa) * o.speedBias : Infinity;
            const decision = {
                left: demand > o.deadband,
                right: demand < -o.deadband,
                throttle: speed < cornerSpeed * 0.97,
                brake: speed > cornerSpeed * 1.03,
                drift: false
            };
            if (decision.brake) decision.throttle = false;
            if (o.drift === 'corners' && speed > o.driftSpeed && Math.abs(demand) > 0.55 && cornerSpeed < speed * 1.15) decision.drift = true;
            queue.push({ at: time + o.reaction, decision });
            while (queue.length > 1 && queue[1].at <= time) queue.shift();
            const active = queue[0].at <= time ? queue[0].decision : driver.pressed;
            driver.pressed = active;
            const input = vehicle.input;
            input.steer = (active.left ? 1 : 0) - (active.right ? 1 : 0);
            input.throttle = active.throttle ? 1 : 0;
            input.brake = active.brake ? 1 : 0;
            input.handbrake = active.drift;
            input.nitro = false;
        }
    };
    return driver;
}
