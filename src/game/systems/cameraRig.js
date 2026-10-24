import * as THREE from 'three';

// Time constants of the position / look-at filters below (1 / rate), in seconds.
const POSITION_LEAD = 1 / 9;
const LOOK_LEAD = 1 / 12;

// Third-person chase camera. It follows where the car is *going* as much as where it
// points (so slides and spins stay readable), widens its field of view with speed and
// nitro, shakes on impacts, and stays level through jumps.
export class CameraRig {
    constructor(camera) {
        this.camera = camera;
        this.position = new THREE.Vector3();
        this.look = new THREE.Vector3();
        this.heading = new THREE.Vector3(0, 0, 1);
        this.fov = 64;
        this.shake = 0;
        this.shakeTime = 0;
        this.initialised = false;
        this.groundY = 0;
        // Smoothed flat velocity, used to cancel the steady-state lag of the follow filters
        // (otherwise the car drifts ~6 m further from the camera at 200 km/h).
        this.vx = 0;
        this.vz = 0;
        this._desired = new THREE.Vector3();
        this._flat = new THREE.Vector3();
        this._target = new THREE.Vector3();
    }

    addShake(amount) {
        this.shake = Math.min(1.4, this.shake + amount);
    }

    snap(position, forward) {
        this.heading.set(forward.x, 0, forward.z);
        if (this.heading.lengthSq() < 1e-6) this.heading.set(0, 0, 1);
        this.heading.normalize();
        this._desired.copy(position).addScaledVector(this.heading, -9).add(new THREE.Vector3(0, 3.6, 0));
        this.position.copy(this._desired);
        this.camera.position.copy(this._desired);
        this.look.copy(position).addScaledVector(this.heading, 7).add(new THREE.Vector3(0, 1.2, 0));
        this.camera.lookAt(this.look);
        this.initialised = true;
        this.groundY = position.y;
        this.vx = 0;
        this.vz = 0;
    }

    update(dt, vehicle, position, intensity = {}) {
        const { nitro = 0, speedRatio = 0 } = intensity;
        // The smoothing below keeps state between frames, so a single non-finite input would
        // freeze the camera on NaN for the rest of the race. Skip bad frames and re-snap.
        if (!Number.isFinite(position.x + position.y + position.z + nitro + speedRatio + dt)) return;
        const state = this.position.x + this.position.z + this.look.x + this.look.z + this.heading.x + this.heading.z + this.fov;
        if (!this.initialised || !Number.isFinite(state)) {
            this.fov = 64;
            this.snap(position, vehicle.forward);
        }
        // Blend facing direction with travel direction when moving, so drifts look right.
        const vx = vehicle.velocity.x;
        const vz = vehicle.velocity.z;
        const flatSpeed = Math.hypot(vx, vz);
        this._flat.set(vehicle.forward.x, 0, vehicle.forward.z);
        if (this._flat.lengthSq() < 1e-4) this._flat.copy(this.heading);
        this._flat.normalize();
        if (flatSpeed > 9 && vehicle.speed > 0) {
            this._target.set(vx / flatSpeed, 0, vz / flatSpeed);
            this._flat.lerp(this._target, 0.42).normalize();
        }
        const reverse = vehicle.speed < -3;
        const follow = 1 - Math.exp(-dt * (reverse ? 3 : 5.2));
        this.heading.lerp(this._flat, follow).normalize();
        const leadBlend = 1 - Math.exp(-dt * 3);
        this.vx += (vx - this.vx) * leadBlend;
        this.vz += (vz - this.vz) * leadBlend;

        const distance = 8.3 + speedRatio * 2.4 + nitro * 1.5;
        const height = 3.0 + speedRatio * 0.5;
        this._desired.copy(position).addScaledVector(this.heading, -distance);
        this._desired.x += this.vx * POSITION_LEAD;
        this._desired.z += this.vz * POSITION_LEAD;
        // Keep vertical motion calmer than horizontal, especially mid-air.
        const airborne = vehicle.airborne ? 0.55 : 1;
        this.groundY += (position.y - this.groundY) * (1 - Math.exp(-dt * 4.5 * airborne));
        this._desired.y = this.groundY + height + (vehicle.airborne ? 0.6 : 0);

        const k = 1 - Math.exp(-dt * 9);
        this.position.x += (this._desired.x - this.position.x) * k;
        this.position.z += (this._desired.z - this.position.z) * k;
        this.position.y += (this._desired.y - this.position.y) * (1 - Math.exp(-dt * 6));

        const ahead = 6.5 + speedRatio * 4;
        this._target.copy(position).addScaledVector(this.heading, ahead);
        this._target.x += this.vx * LOOK_LEAD;
        this._target.z += this.vz * LOOK_LEAD;
        this._target.y = position.y + 1.1;
        this.look.lerp(this._target, 1 - Math.exp(-dt * 12));

        this.shakeTime += dt;
        this.shake = Math.max(0, this.shake - dt * 2.6);
        const rumble = nitro * 0.018 + this.shake * 0.22;
        const sx = Math.sin(this.shakeTime * 47) * rumble;
        const sy = Math.cos(this.shakeTime * 59) * rumble;
        this.camera.position.set(this.position.x + sx, this.position.y + sy, this.position.z + sx * 0.5);
        this.camera.lookAt(this.look);

        const targetFov = 62 + speedRatio * 9 + nitro * 13;
        this.fov += (targetFov - this.fov) * (1 - Math.exp(-dt * 4));
        if (Math.abs(this.camera.fov - this.fov) > 0.02) {
            this.camera.fov = this.fov;
            this.camera.updateProjectionMatrix();
        }
    }
}
