// Rigid-body vehicle: a Rapier chassis supported by four ray-cast suspension corners, with
// a friction-limited tyre model, engine/brake/reverse logic, handbrake drift, nitro, aero,
// air control and wreck/respawn handling. Everything is driven through `input`, so the
// player, the AI and the headless tests all use exactly the same car.

import { FIXED_DT, GROUP, groups } from './trackWorld.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Rotate (x, y, z) by quaternion q into `out`.
function rotate(q, x, y, z, out) {
    const ix = q.w * x + q.y * z - q.z * y;
    const iy = q.w * y + q.z * x - q.x * z;
    const iz = q.w * z + q.x * y - q.y * x;
    const iw = -q.x * x - q.y * y - q.z * z;
    out.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
    out.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
    out.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
    return out;
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

export function quaternionFromYaw(yaw) {
    return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

// Orientation whose forward (+Z) follows `dir` and whose up is as close to +Y as possible.
export function quaternionFromForward(dx, dy, dz) {
    const len = Math.hypot(dx, dy, dz) || 1;
    const f = { x: dx / len, y: dy / len, z: dz / len };
    // left = up x forward
    let lx = f.z;
    let ly = 0;
    let lz = -f.x;
    const ll = Math.hypot(lx, lz);
    if (ll < 1e-6) { lx = 1; lz = 0; } else { lx /= ll; lz /= ll; }
    // up = forward x left
    const ux = f.y * lz - f.z * ly;
    const uy = f.z * lx - f.x * lz;
    const uz = f.x * ly - f.y * lx;
    // Rotation matrix with columns (left, up, forward).
    const m00 = lx, m01 = ux, m02 = f.x;
    const m10 = ly, m11 = uy, m12 = f.y;
    const m20 = lz, m21 = uz, m22 = f.z;
    const trace = m00 + m11 + m22;
    let x, y, z, w;
    if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2;
        w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
    } else if (m11 > m22) {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
    } else {
        const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
        w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
    }
    const n = Math.hypot(x, y, z, w) || 1;
    return { x: x / n, y: y / n, z: z / n, w: w / n };
}

export class Vehicle {
    constructor(physics, spec, { id = 'car', name = 'Car', isPlayer = false } = {}) {
        const RAPIER = physics.RAPIER;
        this.physics = physics;
        this.spec = spec;
        this.id = id;
        this.name = name;
        this.isPlayer = isPlayer;

        const body = physics.world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(0, 5, 0)
                .setLinearDamping(0.02)
                .setAngularDamping(0.9)
                .setCanSleep(false)
                .setCcdEnabled(true)
        );
        const [hx, hy, hz] = spec.body.half;
        const [cx, cy, cz] = spec.body.center;
        const com = { x: 0, y: spec.comHeight - cy, z: -cz };
        const collider = physics.world.createCollider(
            RAPIER.ColliderDesc.cuboid(hx, hy, hz)
                .setTranslation(cx, cy, cz)
                .setMassProperties(spec.mass, com, spec.inertia, { x: 0, y: 0, z: 0, w: 1 })
                .setFriction(0.25)
                .setRestitution(0.2)
                .setCollisionGroups(groups(GROUP.VEHICLE, GROUP.WORLD | GROUP.OBSTACLE | GROUP.VEHICLE))
                .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
                .setContactForceEventThreshold(spec.mass * 6),
            body
        );
        this.body = body;
        this.collider = collider;

        this.input = { throttle: 0, brake: 0, steer: 0, nitro: false, handbrake: false };
        this.steer = 0;
        this.steerAngle = 0;

        this.wheels = spec.wheels.map((w) => ({
            def: w,
            grounded: false,
            springLength: spec.suspension.maxLength,
            compression: 0,
            load: 0,
            spin: 0,
            steer: 0,
            slip: 0,
            hitPoint: { x: 0, y: 0, z: 0 },
            normal: { x: 0, y: 1, z: 0 },
            vLong: 0,
            sliding: 0
        }));

        // Telemetry (read by the game, camera, HUD, audio and effects).
        this.speed = 0;            // signed, along the car's forward axis (m/s)
        this.speedAbs = 0;
        this.lateralSpeed = 0;
        this.slipAngle = 0;
        this.yawRate = 0;
        this.groundedCount = 0;
        this.airborne = false;
        this.airTime = 0;
        this.lastAirTime = 0;
        this.landingImpact = 0;
        this.landed = false;
        this.reversing = false;
        this.braking = false;
        this.nitro = 0.3;
        this.nitroActive = false;
        this.nitroTime = 0;
        this.drifting = false;
        this.driftTime = 0;
        this.driftCharge = 0;
        this.driftAngle = 0;
        this.lateralAccel = 0;
        this.longAccel = 0;
        this.health = 1;
        this.mode = 'ok';
        this.wreckTimer = 0;
        this.ghostTimer = 0;
        this.rpm = 0.2;
        this.gear = 1;
        this.contactSpeed = 0;
        this.hold = false;
        // Set when the Rapier body went non-finite or was disabled. Rapier never re-enables
        // such a body by itself, so the game repairs it (see raceRules.recoverVehicle).
        this.invalid = false;
        this.stepDv = 0;   // velocity change caused by contacts during the last physics step (m/s)
        this.wallScrape = 0;
        this.surfaceGrip = 1;
        this.stillTime = 0;
        this.flippedTime = 0;
        this.up = { x: 0, y: 1, z: 0 };
        this.forward = { x: 0, y: 0, z: 1 };
        this.left = { x: 1, y: 0, z: 0 };
        this.position = { x: 0, y: 0, z: 0 };
        this.quaternion = { x: 0, y: 0, z: 0, w: 1 };
        this.velocity = { x: 0, y: 0, z: 0 };

        this.prev = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } };
        this.curr = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } };

        this._tmp = { a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, c: { x: 0, y: 0, z: 0 } };
        this._prevVel = { x: 0, y: 0, z: 0 };
        this.readState();
        this.snapshot();
        this.snapshot();
    }

    // Places the car upright on the road facing `forward` with an optional starting speed.
    place(x, y, z, forward, speed = 0) {
        if (!Number.isFinite(x + y + z + forward.x + forward.y + forward.z + speed)) return false;
        const q = quaternionFromForward(forward.x, forward.y, forward.z);
        this.body.setEnabled(true);
        this.body.setTranslation({ x, y, z }, true);
        this.body.setRotation(q, true);
        this.body.setLinvel({ x: forward.x * speed, y: forward.y * speed, z: forward.z * speed }, true);
        this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.steer = 0;
        this.steerAngle = 0;
        this.airTime = 0;
        this.landed = false;
        this.stillTime = 0;
        this.flippedTime = 0;
        for (const wheel of this.wheels) { wheel.springLength = this.spec.suspension.springLengthAtRest; wheel.grounded = false; }
        this.invalid = false;
        this.readState();
        this.snapshot();
        this.snapshot();
        return true;
    }

    setCollisionMode(ghost) {
        const filter = ghost ? GROUP.WORLD | GROUP.OBSTACLE : GROUP.WORLD | GROUP.OBSTACLE | GROUP.VEHICLE;
        this.collider.setCollisionGroups(groups(ghost ? GROUP.GHOST : GROUP.VEHICLE, filter));
    }

    readState() {
        const t = this.body.translation();
        const q = this.body.rotation();
        const v = this.body.linvel();
        // Keep the last good pose when the body has gone bad so nothing downstream sees NaN.
        if (!Number.isFinite(t.x + t.y + t.z + v.x + v.y + v.z + q.x + q.y + q.z + q.w) || !this.body.isEnabled()) {
            this.invalid = true;
            return;
        }
        this.position.x = t.x; this.position.y = t.y; this.position.z = t.z;
        this.quaternion.x = q.x; this.quaternion.y = q.y; this.quaternion.z = q.z; this.quaternion.w = q.w;
        this.velocity.x = v.x; this.velocity.y = v.y; this.velocity.z = v.z;
        rotate(q, 0, 1, 0, this.up);
        rotate(q, 0, 0, 1, this.forward);
        rotate(q, 1, 0, 0, this.left);
        this.speed = dot(v, this.forward);
        this.speedAbs = Math.hypot(v.x, v.y, v.z);
        this.lateralSpeed = dot(v, this.left);
    }

    snapshot() {
        const c = this.curr;
        const p = this.prev;
        p.p.x = c.p.x; p.p.y = c.p.y; p.p.z = c.p.z;
        p.q.x = c.q.x; p.q.y = c.q.y; p.q.z = c.q.z; p.q.w = c.q.w;
        c.p.x = this.position.x; c.p.y = this.position.y; c.p.z = this.position.z;
        c.q.x = this.quaternion.x; c.q.y = this.quaternion.y; c.q.z = this.quaternion.z; c.q.w = this.quaternion.w;
    }

    // ----------------------------------------------------------------------------------
    beforeStep(dt) {
        this.readState();
        if (this.invalid) return;
        const spec = this.spec;
        const body = this.body;
        const input = this.input;
        const eng = spec.engine;
        const tires = spec.tires;
        const suspension = spec.suspension;
        const q = this.quaternion;
        const up = this.up;
        const fwd = this.forward;
        const left = this.left;
        const vel = this.velocity;
        const wrecked = this.mode === 'wrecked';

        // --- driver intent ------------------------------------------------------------
        const vf = this.speed;
        let drive = 0;
        let brake = 0;
        this.reversing = false;
        if (!wrecked) {
            const wantFwd = clamp(input.throttle, 0, 1);
            const wantBack = clamp(input.brake, 0, 1);
            if (wantBack > 0.05 && wantFwd > 0.05) {
                brake = wantBack;
            } else if (wantBack > 0.05) {
                if (vf > 1.2) brake = wantBack;
                else { drive = -wantBack; this.reversing = true; }
            } else if (wantFwd > 0.05) {
                if (vf < -1.2) brake = wantFwd;
                else drive = wantFwd;
            }
        } else {
            brake = 0.15;
        }
        if (this.hold) { drive = 0; brake = 1; this.reversing = false; }
        this.braking = brake > 0.05 && vf > 2;

        // Nitro implies full throttle (it is a boost, not a brake) and never works in reverse.
        const nitroWanted = !wrecked && input.nitro && this.nitro > 0.002 && brake < 0.05 && !this.reversing && vf > -1;
        if (nitroWanted && !this.nitroActive) this.nitroTime = 0;
        this.nitroActive = nitroWanted;
        if (this.nitroActive) {
            this.nitro = Math.max(0, this.nitro - eng.nitroDrain * dt);
            this.nitroTime += dt;
            drive = 1;
        }

        // Steering: slower build-up at speed, quicker return to centre.
        const steerTarget = wrecked ? 0 : clamp(input.steer, -1, 1);
        const rate = (Math.abs(steerTarget) > Math.abs(this.steer) ? 7.5 : 11) / (1 + this.speedAbs / 70);
        this.steer += clamp(steerTarget - this.steer, -rate * dt, rate * dt);
        const speedFactor = 1 / (1 + (this.speedAbs / tires.steerSpeedRef) ** 1.5);
        const driftBoost = input.handbrake ? 1.18 : 1;
        this.steerAngle = this.steer * tires.maxSteer * Math.max(0.14, speedFactor) * driftBoost;

        // --- engine ------------------------------------------------------------------
        let engineForce = 0;
        const topSpeed = eng.curveTopSpeed * (this.nitroActive ? eng.nitroTopSpeed : 1);
        if (drive > 0) {
            const x = Math.max(0, vf) / topSpeed;
            const curve = x < 1 ? 1 - x ** 2.2 : 0;
            const kick = this.nitroActive ? 1 + 0.35 * Math.exp(-this.nitroTime / 0.45) : 1;
            engineForce = eng.force * drive * curve * (this.nitroActive ? eng.nitroPower * kick : 1);
        } else if (drive < 0) {
            const x = Math.max(0, -vf) / eng.reverseTopSpeed;
            engineForce = -eng.reverseForce * (-drive) * (x < 1 ? 1 - x * x : 0);
        }

        // --- suspension pass ------------------------------------------------------------
        const wheels = this.wheels;
        let grounded = 0;
        let totalLoad = 0;
        let drivenLoad = 0;
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        let nx = 0, ny = 0, nz = 0;
        const mount = this._tmp.a;
        const contact = this._tmp.b;
        for (const wheel of wheels) {
            const def = wheel.def;
            rotate(q, def.mount.x, def.mount.y, def.mount.z, mount);
            mount.x += this.position.x; mount.y += this.position.y; mount.z += this.position.z;
            const reach = suspension.maxLength + def.radius;
            const hit = this.physics.probe(mount.x, mount.y, mount.z, -up.x, -up.y, -up.z, reach, body);
            if (!hit || hit.ny < 0.25) {
                wheel.grounded = false;
                wheel.load = 0;
                wheel.springLength += (suspension.maxLength - wheel.springLength) * Math.min(1, dt * 9);
                wheel.compression = suspension.restLength - wheel.springLength;
                continue;
            }
            const distance = hit.toi;
            const springLength = Math.max(0.02, distance - def.radius);
            contact.x = mount.x - up.x * distance;
            contact.y = mount.y - up.y * distance;
            contact.z = mount.z - up.z * distance;
            const vc = body.velocityAtPoint(contact);
            const compressRate = -(vc.x * up.x + vc.y * up.y + vc.z * up.z);
            const compression = suspension.restLength - springLength;
            let damping = suspension.damping;
            if (compressRate > 1.8) damping *= 1 + Math.min(4, (compressRate - 1.8) / 1.8);
            let force = suspension.stiffness * compression + damping * compressRate;
            if (springLength < suspension.minLength) {
                force += suspension.stiffness * 20 * (suspension.minLength - springLength);
            }
            force = clamp(force, 0, suspension.maxForce);
            wheel.grounded = true;
            wheel.springLength = springLength;
            wheel.compression = compression;
            wheel.load = force;
            wheel.hitPoint.x = contact.x; wheel.hitPoint.y = contact.y; wheel.hitPoint.z = contact.z;
            wheel.normal.x = hit.nx; wheel.normal.y = hit.ny; wheel.normal.z = hit.nz;
            wheel.vel = vc;
            if (force > 0) {
                body.applyImpulseAtPoint({ x: up.x * force * dt, y: up.y * force * dt, z: up.z * force * dt }, contact, true);
            }
            grounded += 1;
            totalLoad += force;
            if (def.driven) drivenLoad += force;
            nx += hit.nx; ny += hit.ny; nz += hit.nz;
            const height = contact.y;
            if (height < minHeight) minHeight = height;
            if (height > maxHeight) maxHeight = height;
        }
        this.groundedCount = grounded;

        // --- anti-sink clamp: prevent the chassis from penetrating the road --------
        // If any wheel's spring is fully compressed and the body is still moving into
        // the ground, cancel the downward component so the car cannot sink through.
        if (grounded > 0) {
            let bottomed = false;
            for (const wheel of wheels) {
                if (wheel.grounded && wheel.springLength < suspension.minLength + 0.02) {
                    bottomed = true;
                    break;
                }
            }
            if (bottomed) {
                const downSpeed = -(vel.x * up.x + vel.y * up.y + vel.z * up.z);
                if (downSpeed > 0.5) {
                    // Kill the velocity component that pushes the car into the road.
                    const correction = downSpeed * 0.85;
                    body.setLinvel({
                        x: vel.x + up.x * correction,
                        y: vel.y + up.y * correction,
                        z: vel.z + up.z * correction
                    }, true);
                }
            }
        }

        // --- tyre forces ------------------------------------------------------------------
        const com = body.worldCom();
        const sinS = Math.sin(this.steerAngle);
        const cosS = Math.cos(this.steerAngle);
        const handbrake = !wrecked && input.handbrake;
        const brakeTotal = brake * eng.brakeForce;
        const wheelMass = spec.mass * 0.25;
        let slidingWheels = 0;
        let latImpulseSum = 0;
        let longImpulseSum = 0;
        for (const wheel of wheels) {
            if (!wheel.grounded) { wheel.slip = 0; continue; }
            const def = wheel.def;
            const n = wheel.normal;
            const load = wheel.load;
            // Wheel heading: chassis forward turned by the steering angle, flattened onto the ground.
            let fx = def.steered ? fwd.x * cosS + left.x * sinS : fwd.x;
            let fy = def.steered ? fwd.y * cosS + left.y * sinS : fwd.y;
            let fz = def.steered ? fwd.z * cosS + left.z * sinS : fwd.z;
            const fn = fx * n.x + fy * n.y + fz * n.z;
            fx -= n.x * fn; fy -= n.y * fn; fz -= n.z * fn;
            const fl = Math.hypot(fx, fy, fz) || 1;
            fx /= fl; fy /= fl; fz /= fl;
            // left = n x f
            const lx = n.y * fz - n.z * fy;
            const ly = n.z * fx - n.x * fz;
            const lz = n.x * fy - n.y * fx;
            const vc = wheel.vel;
            const vLong = vc.x * fx + vc.y * fy + vc.z * fz;
            const vLat = vc.x * lx + vc.y * ly + vc.z * lz;
            wheel.vLong = vLong;

            const rear = !def.front;
            const gripScale = (rear && handbrake ? tires.driftRearGrip : 1) * this.surfaceGrip;
            const slip = Math.atan2(vLat, Math.abs(vLong) + 2);
            const fade = clamp((Math.abs(slip) - 0.2) / 0.38, 0, 1);
            const mu = tires.grip * gripScale * (1 - 0.32 * fade);
            const limit = mu * load;

            // Longitudinal: engine share by load, brakes, rolling resistance.
            let longForce = 0;
            if (engineForce !== 0 && def.driven && drivenLoad > 1) longForce += engineForce * (load / drivenLoad);
            if (brakeTotal > 0 && totalLoad > 1) {
                const share = load / totalLoad;
                longForce -= Math.sign(vLong || vf) * Math.min(brakeTotal * share, Math.abs(vLong) * wheelMass / dt);
            }
            if (handbrake && rear && totalLoad > 1) {
                longForce -= Math.sign(vLong) * Math.min(eng.brakeForce * 0.35 * (load / totalLoad), Math.abs(vLong) * wheelMass / dt * 0.5);
            }
            longForce -= tires.rollingResistance * load * clamp(vLong, -1, 1);
            // Traction control: engine force may use at most ~85% of the grip so there is always
            // some left for cornering (otherwise hard acceleration spins the car out).
            const isBraking = longForce * Math.sign(vLong || 1) < 0;
            const longLimit = Math.min(limit * (isBraking ? 1.05 : 0.85), Math.abs(longForce));
            longForce = Math.sign(longForce) * longLimit;

            // Lateral: cancel sideways slip, limited by what is left of the friction circle.
            const latLimit = Math.sqrt(Math.max(0, limit * limit - longForce * longForce));
            let latForce = (-vLat * wheelMass / Math.max(tires.lateralTau, dt)) * 0.9;
            if (Math.abs(latForce) > latLimit) { latForce = Math.sign(latForce) * latLimit; slidingWheels += 1; wheel.sliding = 1; } else wheel.sliding = 0;
            wheel.slip = slip;

            // Apply at the wheel's ground position but at centre-of-mass height so the grip
            // steers the car without rolling or pitching it (weight transfer is cosmetic).
            const rise = (com.x - wheel.hitPoint.x) * up.x + (com.y - wheel.hitPoint.y) * up.y + (com.z - wheel.hitPoint.z) * up.z;
            const point = this._tmp.c;
            point.x = wheel.hitPoint.x + up.x * rise;
            point.y = wheel.hitPoint.y + up.y * rise;
            point.z = wheel.hitPoint.z + up.z * rise;
            const ix = (fx * longForce + lx * latForce) * dt;
            const iy = (fy * longForce + ly * latForce) * dt;
            const iz = (fz * longForce + lz * latForce) * dt;
            body.applyImpulseAtPoint({ x: ix, y: iy, z: iz }, point, true);
            latImpulseSum += latForce;
            longImpulseSum += longForce;
        }

        // --- aero ---------------------------------------------------------------------------
        const aero = spec.aero;
        const speed = this.speedAbs;
        if (speed > 0.1) {
            const dragK = aero.drag * speed * dt;
            body.applyImpulse({ x: -vel.x * dragK, y: -vel.y * dragK, z: -vel.z * dragK }, true);
        }
        if (grounded > 0) {
            const down = aero.downforce * speed * speed * dt;
            body.applyImpulse({ x: -up.x * down, y: -up.y * down, z: -up.z * down }, true);
        }

        // --- stability and driver assists -----------------------------------------------
        const w = body.angvel();
        const yawRate = w.x * up.x + w.y * up.y + w.z * up.z;
        this.yawRate = yawRate;
        if (grounded >= 2) {
            const flatness = 1 - clamp((maxHeight - minHeight - 0.35) / 0.8, 0, 1);
            const share = grounded / 4;
            const nl = Math.hypot(nx, ny, nz) || 1;
            const ex = (up.y * nz - up.z * ny) / nl;
            const ey = (up.z * nx - up.x * nz) / nl;
            const ez = (up.x * ny - up.y * nx) / nl;
            const wRoll = { x: w.x - up.x * yawRate, y: w.y - up.y * yawRate, z: w.z - up.z * yawRate };
            const inertia = spec.mass * 0.9;
            const kp = 70 * flatness * share;
            const kd = 11 * (0.4 + 0.6 * flatness) * share;
            body.applyTorqueImpulse({
                x: (ex * kp - wRoll.x * kd) * inertia * dt,
                y: (ey * kp - wRoll.y * kd) * inertia * dt,
                z: (ez * kp - wRoll.z * kd) * inertia * dt
            }, true);

            // Yaw assist toward the bicycle-model yaw rate for the current steering angle.
            if (!wrecked) {
                let target = (vf * Math.tan(this.steerAngle)) / spec.wheelbase;
                if (handbrake) target *= 1.45;
                const maxYaw = (tires.grip * spec.gravity * 0.9) / Math.max(8, Math.abs(vf));
                target = clamp(target, -maxYaw * (handbrake ? 1.6 : 1), maxYaw * (handbrake ? 1.6 : 1));
                const assist = clamp((target - yawRate) * 3.8, -14, 14) * share * spec.inertia.y;
                body.applyTorqueImpulse({ x: up.x * assist * dt, y: up.y * assist * dt, z: up.z * assist * dt }, true);
            }
        } else if (grounded === 0 && speed > 3) {
            // Air control: level the car for landing and let the nose follow the flight path.
            const inv = 1 / speed;
            const dx = vel.x * inv, dy = vel.y * inv, dz = vel.z * inv;
            const levelX = -up.z, levelZ = up.x; // up x worldUp
            const cx = fwd.y * dz - fwd.z * dy;
            const cy = fwd.z * dx - fwd.x * dz;
            const cz = fwd.x * dy - fwd.y * dx;
            const pitchError = cx * left.x + cy * left.y + cz * left.z;
            const air = spec.mass * 0.9;
            const levelGain = 5.0;
            const pathGain = 2.2;
            const damp = 2.2;
            body.applyTorqueImpulse({
                x: (levelX * levelGain + left.x * pitchError * pathGain - w.x * damp) * air * dt,
                y: (left.y * pitchError * pathGain - w.y * damp) * air * dt,
                z: (levelZ * levelGain + left.z * pitchError * pathGain - w.z * damp) * air * dt
            }, true);
        }

        // Bookkeeping for the next readState().
        this._lastLatForce = latImpulseSum;
        this._lastLongForce = longImpulseSum;
        this._sliding = slidingWheels;
        this._prevVel.x = vel.x; this._prevVel.y = vel.y; this._prevVel.z = vel.z;
    }

    // ----------------------------------------------------------------------------------
    afterStep(dt) {
        const prevSpeedY = this._prevVel.y;
        this.readState();
        if (this.invalid) return;
        {
            const g = this.spec.gravity * dt;
            const dx = this.velocity.x - this._prevVel.x;
            const dy = this.velocity.y - this._prevVel.y + g;
            const dz = this.velocity.z - this._prevVel.z;
            const dv = Math.hypot(dx, dy, dz);
            // Tyre forces change velocity by well under 0.4 m/s per step; contacts far more.
            this.stepDv = dv > 0.4 ? dv : 0;
        }
        this.snapshot();
        const spec = this.spec;

        // Air time and landing detection.
        const wasAirborne = this.airborne;
        this.airborne = this.groundedCount === 0;
        this.landed = false;
        if (this.airborne) {
            this.airTime += dt;
        } else {
            if (wasAirborne && this.airTime > 0.25) {
                this.landed = true;
                this.lastAirTime = this.airTime;
                this.landingImpact = Math.max(0, -prevSpeedY);
            }
            if (!this.airborne) this.airTime = 0;
        }

        // Accelerations (for body-lean visuals, audio and effects).
        const ax = (this.velocity.x - this._prevVel.x) / dt;
        const ay = (this.velocity.y - this._prevVel.y) / dt;
        const az = (this.velocity.z - this._prevVel.z) / dt;
        const lateral = ax * this.left.x + ay * this.left.y + az * this.left.z;
        const longitudinal = ax * this.forward.x + ay * this.forward.y + az * this.forward.z;
        this.lateralAccel += (lateral - this.lateralAccel) * Math.min(1, dt * 14);
        this.longAccel += (longitudinal - this.longAccel) * Math.min(1, dt * 14);

        // Slip angle between heading and travel direction (flat), drift detection.
        const flatSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        let angle = 0;
        if (flatSpeed > 6 && this.speed > 0) {
            angle = Math.atan2(this.lateralSpeed, Math.max(0.1, this.speed));
        }
        this.slipAngle = angle;
        const steering = Math.abs(this.input.steer) > 0.2;
        const slidingNow = Math.abs(angle) > 0.2 && flatSpeed > 16 && this.groundedCount >= 2 && this.mode === 'ok';
        const wantDrift = slidingNow && (this.input.handbrake || steering || this.input.brake > 0.1);
        if (wantDrift) {
            this.drifting = true;
            this.driftTime += dt;
            this.driftAngle = angle;
            this.driftCharge = Math.min(1, this.driftCharge + dt * (0.18 + Math.min(0.5, Math.abs(angle)) * 0.9) * (flatSpeed / 50));
        } else if (this.drifting && (!slidingNow || !(this.input.handbrake || steering))) {
            this.drifting = false;
        }
        if (!this.drifting) this.driftTime = Math.max(0, this.driftTime - dt * 2);

        // Wheel visuals: spin from ground speed, suspension from compression.
        for (const wheel of this.wheels) {
            const rolling = wheel.grounded ? wheel.vLong : this.speed;
            wheel.spin += (rolling / wheel.def.radius) * dt;
            wheel.steer = wheel.def.steered ? this.steerAngle : 0;
        }

        // Engine speed for audio (six-speed gearbox on the nominal top speed).
        const top = spec.engine.topSpeed * (this.nitroActive ? spec.engine.nitroTopSpeed : 1);
        const ratio = clamp(Math.abs(this.speed) / top, 0, 1.05);
        const gearCount = 6;
        const bandwidth = 1 / gearCount;
        const gear = Math.min(gearCount, Math.floor(ratio / bandwidth) + 1);
        const within = (ratio - (gear - 1) * bandwidth) / bandwidth;
        this.gear = gear;
        this.rpm = clamp(0.22 + 0.78 * within * (0.7 + 0.3 * (this.input.throttle > 0.1 ? 1 : 0.4)), 0.15, 1);

        // Housekeeping timers.
        if (this.ghostTimer > 0) {
            this.ghostTimer -= dt;
            if (this.ghostTimer <= 0) this.setCollisionMode(false);
        }
        if (this.mode === 'wrecked') {
            this.wreckTimer -= dt;
        }
        this.stillTime = Math.abs(this.speed) < 1.5 ? this.stillTime + dt : 0;
        this.flippedTime = this.up.y < 0.25 ? this.flippedTime + dt : 0;
    }

    // ----------------------------------------------------------------------------------
    // Spins the car out for a takedown or a crash. `away` is a horizontal unit direction.
    wreck(away, severity = 1, duration = 1.6) {
        if (this.mode === 'wrecked') return;
        this.mode = 'wrecked';
        this.wreckTimer = duration;
        const m = this.spec.mass;
        const v = this.body.linvel();
        const flatSpeed = Math.hypot(v.x, v.z);
        const up = 3.2 + Math.min(4.5, flatSpeed * 0.07) * severity;
        this.body.applyImpulse({ x: away.x * m * 3.5, y: m * up, z: away.z * m * 3.5 }, true);
        const spin = (4 + 5 * severity) * (Math.random() < 0.5 ? -1 : 1);
        this.body.applyTorqueImpulse({
            x: this.forward.x * m * 1.4 * spin * 0.35 + this.up.x * this.spec.inertia.y * spin * 0.5,
            y: this.forward.y * m * 1.4 * spin * 0.35 + this.up.y * this.spec.inertia.y * spin * 0.5,
            z: this.forward.z * m * 1.4 * spin * 0.35 + this.up.z * this.spec.inertia.y * spin * 0.5
        }, true);
        this.nitroActive = false;
        this.drifting = false;
    }

    recover() {
        this.mode = 'ok';
        this.wreckTimer = 0;
    }

    grantGhost(seconds) {
        this.ghostTimer = Math.max(this.ghostTimer, seconds);
        this.setCollisionMode(true);
    }

    // Interpolated render pose between the last two fixed steps.
    pose(alpha, outPosition, outQuaternion) {
        const p0 = this.prev.p, p1 = this.curr.p;
        outPosition.x = p0.x + (p1.x - p0.x) * alpha;
        outPosition.y = p0.y + (p1.y - p0.y) * alpha;
        outPosition.z = p0.z + (p1.z - p0.z) * alpha;
        const a = this.prev.q, b = this.curr.q;
        let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
        const sign = cos < 0 ? -1 : 1;
        cos *= sign;
        let k0 = 1 - alpha;
        let k1 = alpha;
        if (cos < 0.9995) {
            const theta = Math.acos(cos);
            const sinTheta = Math.sin(theta);
            k0 = Math.sin((1 - alpha) * theta) / sinTheta;
            k1 = Math.sin(alpha * theta) / sinTheta;
        }
        outQuaternion.x = a.x * k0 + b.x * k1 * sign;
        outQuaternion.y = a.y * k0 + b.y * k1 * sign;
        outQuaternion.z = a.z * k0 + b.z * k1 * sign;
        outQuaternion.w = a.w * k0 + b.w * k1 * sign;
    }
}

export { FIXED_DT };
