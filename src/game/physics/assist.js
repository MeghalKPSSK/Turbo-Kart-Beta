// Brake assist: the corner speed a careful driver would hold, taken from the same racing
// line and speed profile the rivals use, and how hard to slow a car that is going too fast
// for the corner ahead. Pure maths, shared by the game and the headless tests.

import { buildRacingLine, buildSpeedProfile, sampleAt } from '../ai/racingLine.js';

export function buildAssist(track, vehicle) {
    const spec = vehicle.spec;
    const line = buildRacingLine(track);
    const profile = buildSpeedProfile(track, line, {
        grip: spec.tires.grip,
        latAccel: (speed) => vehicle.latAccelLimit(speed),
        gravity: spec.gravity,
        topSpeed: spec.engine.topSpeed * spec.engine.nitroTopSpeed,
        brakeDecel: (spec.engine.brakeForce / spec.mass) * 0.62,
        margin: 0.97
    });
    return {
        // Returns { lift, brake }: lift cuts the throttle, brake (0..1) is added to the pedal.
        // It only steps in when the car is well over the safe speed, so a tidy driver never
        // feels it, and it never brakes below what the corner actually needs.
        correct(s, speed) {
            const safe = sampleAt(track, profile.speed, s + Math.min(14, Math.max(3, speed * 0.16)));
            const over = speed / Math.max(8, safe) - 1.1;
            if (over <= 0) return { lift: false, brake: 0 };
            return { lift: true, brake: Math.min(0.85, over * 5) };
        }
    };
}
