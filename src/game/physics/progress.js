// Tracks how far along the circuit a vehicle is, using the shared TrackModel. Works for
// every racer (player, AI, test bots) and survives the start/finish line in both
// directions, so reversing over the line never awards a lap.

export class ProgressTracker {
    constructor(track, vehicle) {
        this.track = track;
        this.vehicle = vehicle;
        this.proj = {};
        this.hint = -1;
        this.s = 0;
        this.lane = 0;
        this.lapOffset = 0;
        this.total = 0;
        this.index = 0;
        this.distanceFromRoute = 0;
        this.headingError = 0;
        this.alongSpeed = 0;
        this.wrongWayTime = 0;
        this.offRoadTime = 0;
        this.reset();
    }

    reset() {
        const v = this.vehicle;
        this.track.project(v.position.x, v.position.z, -1, this.proj);
        this.hint = this.proj.index;
        this.s = this.proj.s;
        this.lane = this.proj.lane;
        this.index = this.proj.index;
        // Cars waiting on the grid sit behind the line: their distance is negative.
        this.lapOffset = this.s > this.track.length * 0.5 ? -1 : 0;
        this.total = this.lapOffset * this.track.length + this.s;
        this.wrongWayTime = 0;
        this.offRoadTime = 0;
    }

    update(dt) {
        const track = this.track;
        const v = this.vehicle;
        track.project(v.position.x, v.position.z, this.hint, this.proj);
        const previousS = this.s;
        this.s = this.proj.s;
        this.lane = this.proj.lane;
        this.hint = this.proj.index;
        this.index = this.proj.index;
        this.distanceFromRoute = this.proj.dist;
        const delta = this.s - previousS;
        if (delta < -track.length * 0.5) this.lapOffset += 1;
        else if (delta > track.length * 0.5) this.lapOffset -= 1;
        this.total = this.lapOffset * track.length + this.s;

        const frame = track.frameAt(this.s, ProgressTracker._frame);
        const fx = v.forward.x;
        const fz = v.forward.z;
        const flat = Math.hypot(fx, fz) || 1;
        const tflat = Math.hypot(frame.tx, frame.tz) || 1;
        const cross = (fx / flat) * (frame.tz / tflat) - (fz / flat) * (frame.tx / tflat);
        const dotp = (fx / flat) * (frame.tx / tflat) + (fz / flat) * (frame.tz / tflat);
        // Positive when the route bends to the LEFT of where the car points.
        this.headingError = Math.atan2(-cross, dotp);
        this.alongSpeed = v.velocity.x * frame.tx + v.velocity.y * frame.ty + v.velocity.z * frame.tz;

        // Wrong way: travelling or pointing against the race direction.
        const against = this.alongSpeed < -2.5 || (dotp < -0.35 && v.speedAbs > 4);
        this.wrongWayTime = against ? this.wrongWayTime + dt : Math.max(0, this.wrongWayTime - dt * 2);
        this.offRoadTime = Math.abs(this.lane) > track.halfWidth + 1 ? this.offRoadTime + dt : 0;
    }
}

ProgressTracker._frame = {};
