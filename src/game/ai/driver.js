// AI driver. It steers with pure pursuit along a racing line, brakes for corners using a
// precomputed speed profile, spends nitro on straights, avoids hazards - and is built to
// fight: it rubber-bands toward the player, blocks, rams from behind and side-swipes.

import { buildRacingLine, buildSpeedProfile, sampleAt } from './racingLine.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class AIDriver {
    constructor({ track, vehicle, tracker, personality, pace = 1, seed = 1 }) {
        this.track = track;
        this.vehicle = vehicle;
        this.tracker = tracker;
        this.aggression = personality.aggression;
        this.skill = personality.skill;
        this.pace = pace;
        this.rng = mulberry32(seed * 7919 + 13);

        const spec = vehicle.spec;
        this.line = buildRacingLine(track);
        this.profile = buildSpeedProfile(track, this.line, {
            grip: spec.tires.grip,
            gravity: spec.gravity,
            topSpeed: spec.engine.topSpeed,
            brakeDecel: (spec.engine.brakeForce / spec.mass) * 0.62,
            margin: clamp(0.84 + (this.skill - 0.95) * 1.1, 0.8, 0.97)
        });
        this.laneLimit = track.halfWidth - 2.4;
        this.laneCmd = null;
        this.avoidSide = new Map();
        this.nitroTimer = 0;
        this.engage = 0;
        this.engageCooldown = 3 + this.rng() * 6;
        this.bumpCooldown = 0;
        this.stuckTime = 0;
        this.stallMemory = 0;
        this.reverseTime = 0;
        this.reaction = this.rng() * 0.35;
        this.launched = false;
        this.needsRespawn = false;
        this.mode = 'race';
        this.debug = {};
    }

    update(dt, ctx) {
        const v = this.vehicle;
        const t = this.tracker;
        const track = this.track;
        const input = v.input;
        if (!ctx.started) {
            input.throttle = 0; input.brake = 0; input.steer = 0; input.nitro = false; input.handbrake = false;
            return;
        }
        if (!this.launched) {
            this.reaction -= dt;
            if (this.reaction > 0) return;
            this.launched = true;
        }
        if (v.mode === 'wrecked') {
            input.throttle = 0; input.brake = 0; input.steer = 0; input.nitro = false; input.handbrake = false;
            return;
        }

        const s = t.s;
        const speed = v.speed;
        const me = ctx.me;
        const player = ctx.player;

        // ---- recovery: stuck against something -----------------------------------------
        if (Math.abs(speed) < 2.2 && ctx.elapsed > 4) this.stuckTime += dt; else this.stuckTime = Math.max(0, this.stuckTime - dt * 2);
        this.stallMemory = Math.max(0, this.stallMemory - dt);
        if (this.reverseTime > 0) {
            this.reverseTime -= dt;
            input.throttle = 0; input.brake = 1; input.nitro = false; input.handbrake = false;
            // Backing up, the nose swings opposite to the steering: aim it at the free lane.
            input.steer = clamp((t.lane - this.laneCmd) * 0.25, -1, 1);
            return;
        }
        if (this.stuckTime > 1.8) {
            // Back out far enough to get a run at the gap; a repeat stall means a respawn.
            this.reverseTime = this.nearHazard(s, 16) ? 2.4 : 1.2;
            this.stuckTime = 0;
            if (this.stallMemory > 0) this.needsRespawn = true;
            this.stallMemory = 14;
        }
        if (t.offRoadTime > 3 || v.flippedTime > 1.6) this.needsRespawn = true;

        // ---- tactical lane (absolute: metres left of the centre line, or null) ---------------
        const lineAhead = (distance) => sampleAt(track, this.line, s + distance);
        if (this.laneCmd === null) this.laneCmd = t.lane;
        let override = null;
        let ramTarget = null;
        this.engageCooldown -= dt;
        this.bumpCooldown -= dt;
        if (this.engage > 0) this.engage -= dt;

        const ahead = this.nearestAhead(ctx, s, 34, 3.6);
        if (ahead) {
            const side = ahead.lane >= t.lane ? -1 : 1;
            let wanted = ahead.lane + side * 4.4;
            if (Math.abs(wanted) > this.laneLimit) wanted = ahead.lane - side * 4.4;
            override = wanted;
        }

        if (player && player !== me && this.aggression > 0.55) {
            const along = wrapDelta(player.tracker.total - t.total, track.length);
            const lateral = player.tracker.lane - t.lane;
            const straight = track.maxCurvature(s, 55) < 0.0075;
            if (this.engage <= 0 && this.engageCooldown <= 0 && straight && Math.abs(along) < 26
                && this.rng() < this.aggression * dt * 1.4) {
                this.engage = 3.2 + this.rng() * 1.6;
                this.engageCooldown = 8 + this.rng() * 9;
            }
            if (this.engage > 0 && straight) {
                if (along > 2 && along < 30) {
                    // Chase the player's rear bumper and hit it hard.
                    ramTarget = player;
                    override = player.tracker.lane;
                } else if (Math.abs(along) <= 6 && Math.abs(lateral) < 6.5 && this.bumpCooldown <= 0) {
                    // Alongside: lean on them.
                    override = player.tracker.lane - (lateral > 0 ? 1 : -1) * 0.3;
                    if (Math.abs(lateral) < 2.4) this.bumpCooldown = 4;
                } else if (along < -3 && along > -24) {
                    // Cut across in front of them (block).
                    override = clamp(player.tracker.lane * 0.85, -this.laneLimit, this.laneLimit);
                }
            }
        }

        // Hazards take priority over everything else; ramps are taken square on.
        const dodge = this.hazardAvoidance(s, override ?? this.laneCmd, speed);
        if (dodge) override = dodge.lane;
        const ramp = this.upcomingRamp(s);
        if (ramp && !dodge) override = 0;

        const goal = clamp(override ?? lineAhead(clamp(7 + Math.abs(speed) * 0.5, 9, 58)), -this.laneLimit, this.laneLimit);
        const slew = dodge ? 16 : override !== null ? 11 : 15;
        this.laneCmd += clamp(goal - this.laneCmd, -slew * dt, slew * dt);

        // ---- steering: pure pursuit ------------------------------------------------------------
        // A shorter lookahead while dodging makes the car turn in sooner.
        const lookahead = clamp(7 + Math.abs(speed) * 0.5, 9, 58) * (dodge ? 0.62 : 1);
        const targetS = s + lookahead;
        const targetLane = clamp(this.laneCmd, -this.laneLimit, this.laneLimit);
        const target = track.roadPoint(targetS, targetLane);
        const dx = target.x - v.position.x;
        const dz = target.z - v.position.z;
        const forwardComponent = dx * v.forward.x + dz * v.forward.z;
        const leftComponent = dx * v.left.x + dz * v.left.z;
        const alpha = Math.atan2(leftComponent, Math.max(0.1, forwardComponent));
        const tires = v.spec.tires;
        const maxAngle = Math.max(0.09, tires.maxSteer / (1 + (v.speedAbs / tires.steerSpeedRef) ** 2));
        const wheelAngle = Math.atan2(2 * v.spec.wheelbase * Math.sin(alpha), lookahead);
        input.steer = clamp(wheelAngle / maxAngle, -1, 1);

        // ---- speed ---------------------------------------------------------------------------------
        let rubber = 1;
        if (player && player !== me && ctx.elapsed > 6) {
            const gap = t.total - player.tracker.total; // + means we are ahead
            rubber = gap < 0 ? 1 + clamp(-gap / 1100, 0, 0.11) : 1 - clamp((gap - 70) / 1700, 0, 0.07);
        }
        const profileSpeed = sampleAt(track, this.profile.speed, s + clamp(speed * 0.12, 2, 12));
        let target_v = profileSpeed * this.pace * rubber;
        if (ramTarget) target_v = Math.max(target_v, ramTarget.vehicle.speed + 9);
        if (dodge) {
            // Never arrive at an obstacle faster than the car can still steer around it.
            const shift = Math.max(0, dodge.shift - 0.8);
            if (shift > 0.4) {
                const lateral = v.spec.tires.grip * v.spec.gravity * 0.42;
                const needed = Math.sqrt((2 * shift) / lateral) + 0.2;
                target_v = Math.min(target_v, Math.max(9, (dodge.ahead - 4) / needed));
            }
        }
        const error = target_v - speed;
        input.throttle = error > 0 ? clamp(error * 0.45, 0, 1) : 0;
        input.brake = error < -3 ? clamp((-error - 3) * 0.2, 0, 1) : 0;
        if (ramp) { input.brake = 0; input.throttle = Math.max(input.throttle, 0.85); }
        input.handbrake = v.speedAbs > 25 && Math.abs(input.steer) > 0.9 && error < -6 && this.aggression > 0.8;

        // ---- nitro ---------------------------------------------------------------------------------
        const spec = v.spec;
        const straight = track.maxCurvature(s, 60) < 0.006;
        const behind = player && player !== me && t.total < player.tracker.total - 25;
        const wantNitro = v.nitro > 0.12 && straight && Math.abs(input.steer) < 0.35 && !ramp
            && speed > 12 && speed < spec.engine.topSpeed * 1.08
            && (behind || ramTarget || this.nitroTimer > 0 || this.rng() < dt * 0.35);
        if (wantNitro && this.nitroTimer <= 0) this.nitroTimer = 1.6 + this.rng() * 2.2;
        if (this.nitroTimer > 0) this.nitroTimer -= dt;
        input.nitro = wantNitro || (this.nitroTimer > 0 && straight && v.nitro > 0.05);
        // Rivals "collect" nitro too: a steady trickle, faster when chasing.
        v.nitro = Math.min(1, v.nitro + dt * (behind ? 0.075 : 0.042));

        this.debug = { targetLane, targetSpeed: target_v, engage: this.engage, rubber };
    }

    nearestAhead(ctx, s, range, laneWidth) {
        const track = this.track;
        let best = null;
        let bestGap = range;
        for (const other of ctx.racers) {
            if (other === ctx.me) continue;
            const along = wrapDelta(other.tracker.total - this.tracker.total, track.length);
            if (along > 1 && along < bestGap && Math.abs(other.tracker.lane - this.tracker.lane) < laneWidth) {
                best = other.tracker;
                bestGap = along;
            }
        }
        return best;
    }

    // The nearest hazard that threatens the car: { lane, ahead, shift } where `lane` is an
    // absolute lane that clears it, `ahead` the route distance to it and `shift` how far the car
    // still has to move sideways - or null. The side is chosen from where the car actually is
    // and then kept until the hazard has been passed.
    hazardAvoidance(s, plannedLane, speed) {
        const track = this.track;
        const actual = this.tracker.lane;
        const horizon = clamp(25 + Math.abs(speed) * 1.7, 45, 125);
        let best = null;
        for (const hazard of track.hazards) {
            const ahead = track.wrapS(hazard.s - s);
            const passed = ahead > track.length - 6;
            if (passed || ahead > horizon) {
                this.avoidSide.delete(hazard.id);
                continue;
            }
            const radius = hazard.half[0] + 1.5 + 1.3;
            let side = this.avoidSide.get(hazard.id);
            if (!side) {
                const threatened = Math.abs(plannedLane - hazard.lane) < radius || Math.abs(actual - hazard.lane) < radius + 0.6;
                if (!threatened) continue;
                side = actual - hazard.lane < 0 ? -1 : 1;
                if (Math.abs(hazard.lane + side * radius) > this.laneLimit) side = -side;
                this.avoidSide.set(hazard.id, side);
            }
            if (best && best.ahead <= ahead) continue;
            const lane = clamp(hazard.lane + side * radius, -this.laneLimit, this.laneLimit);
            best = { lane, ahead, shift: Math.abs(lane - actual) };
        }
        return best;
    }

    // True when a hazard lies within `range` metres ahead of (or just beside) route distance `s`.
    nearHazard(s, range) {
        const track = this.track;
        return track.hazards.some((hazard) => {
            const d = wrapDelta(hazard.s - s, track.length);
            return d > -6 && d < range;
        });
    }

    upcomingRamp(s) {
        for (const ramp of this.track.ramps) {
            const ahead = this.track.wrapS(ramp.s0 - s);
            if (ahead < 55 || this.track.wrapS(s - ramp.s0) < ramp.s1 - ramp.s0 + 6) return ramp;
        }
        return null;
    }
}

export function wrapDelta(delta, length) {
    let d = delta % length;
    if (d > length / 2) d -= length;
    if (d < -length / 2) d += length;
    return d;
}

function mulberry32(a) {
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
