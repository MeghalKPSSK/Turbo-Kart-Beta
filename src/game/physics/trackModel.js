// Shared, numeric-only description of a circuit. It never touches the DOM, three.js
// scene objects or Rapier, so the physics, AI, game loop and the headless tests all
// use exactly the same route maths.

const TAU = Math.PI * 2;

function wrapIndex(index, count) {
    return ((index % count) + count) % count;
}

export class TrackModel {
    constructor(meta) {
        this.id = meta.id;
        this.width = meta.width;
        this.halfWidth = meta.width / 2;
        this.guardrailOffset = meta.guardrailOffset ?? 3;
        this.gravity = meta.gravity ?? 13;
        this.meta = meta;

        const route = meta.route;
        const count = route.length;
        this.count = count;
        this.x = new Float64Array(count);
        this.y = new Float64Array(count);
        this.z = new Float64Array(count);
        for (let i = 0; i < count; i += 1) {
            this.x[i] = route[i][0];
            this.y[i] = route[i][1];
            this.z[i] = route[i][2];
        }
        this.s = new Float64Array(count + 1);
        for (let i = 0; i < count; i += 1) {
            const j = (i + 1) % count;
            this.s[i + 1] = this.s[i] + Math.hypot(this.x[j] - this.x[i], this.y[j] - this.y[i], this.z[j] - this.z[i]);
        }
        this.length = this.s[count];

        // Tangent (3D, central difference) and signed curvature per sample.
        this.tx = new Float64Array(count);
        this.ty = new Float64Array(count);
        this.tz = new Float64Array(count);
        this.heading = new Float64Array(count);
        const span = 2;
        for (let i = 0; i < count; i += 1) {
            const a = wrapIndex(i - span, count);
            const b = wrapIndex(i + span, count);
            let dx = this.x[b] - this.x[a];
            let dy = this.y[b] - this.y[a];
            let dz = this.z[b] - this.z[a];
            const len = Math.hypot(dx, dy, dz) || 1;
            dx /= len; dy /= len; dz /= len;
            this.tx[i] = dx; this.ty[i] = dy; this.tz[i] = dz;
            this.heading[i] = Math.atan2(dx, dz);
        }
        this.kappa = new Float64Array(count);
        const stencil = 3;
        for (let i = 0; i < count; i += 1) {
            const a = wrapIndex(i - stencil, count);
            const b = wrapIndex(i + stencil, count);
            let dTheta = this.heading[b] - this.heading[a];
            dTheta = ((dTheta + Math.PI) % TAU + TAU) % TAU - Math.PI;
            const ds = this.distanceBetween(a, b);
            this.kappa[i] = ds > 1e-6 ? dTheta / ds : 0;
        }

        this.start = meta.start;
        this.ramps = meta.ramps || [];
        this.hazards = meta.hazards || [];
        this.nitro = meta.nitro || [];
        this.coins = meta.coins || [];
    }

    distanceBetween(a, b) {
        const d = this.s[b] - this.s[a];
        return d >= 0 ? d : d + this.length;
    }

    wrapS(s) {
        return ((s % this.length) + this.length) % this.length;
    }

    // Index of the segment containing arc length s, and the fraction along it.
    locate(s, out = { index: 0, t: 0 }) {
        s = this.wrapS(s);
        let lo = 0;
        let hi = this.count;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (this.s[mid] <= s) lo = mid; else hi = mid;
        }
        const seg = this.s[lo + 1] - this.s[lo];
        out.index = lo;
        out.t = seg > 1e-9 ? (s - this.s[lo]) / seg : 0;
        return out;
    }

    // Frame on the route centre line at arc length s.
    frameAt(s, out = {}) {
        const loc = this.locate(s, TrackModel._loc);
        const i = loc.index;
        const j = (i + 1) % this.count;
        const t = loc.t;
        out.x = this.x[i] + (this.x[j] - this.x[i]) * t;
        out.y = this.y[i] + (this.y[j] - this.y[i]) * t;
        out.z = this.z[i] + (this.z[j] - this.z[i]) * t;
        const tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t;
        const ty = this.ty[i] + (this.ty[j] - this.ty[i]) * t;
        const tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t;
        const len = Math.hypot(tx, ty, tz) || 1;
        out.tx = tx / len; out.ty = ty / len; out.tz = tz / len;
        const flat = Math.hypot(out.tx, out.tz) || 1;
        // Lateral + is LEFT of the direction of travel: left = up x forward = (tz, -tx).
        out.lx = out.tz / flat;
        out.lz = -out.tx / flat;
        out.kappa = this.kappa[i] + (this.kappa[j] - this.kappa[i]) * t;
        out.index = i;
        return out;
    }

    // Point on the road surface `lane` metres to the left of the centre line.
    roadPoint(s, lane = 0, out = {}) {
        const f = this.frameAt(s, TrackModel._frame);
        out.x = f.x + f.lx * lane;
        out.z = f.z + f.lz * lane;
        out.y = f.y + 0.05;
        out.tx = f.tx; out.ty = f.ty; out.tz = f.tz;
        out.lx = f.lx; out.lz = f.lz;
        out.kappa = f.kappa;
        return out;
    }

    // Closest route position to (x, z). `hint` (a sample index) keeps the search
    // local so that parts of the loop that pass close to each other never get mixed up.
    project(x, z, hint = -1, out = {}) {
        const count = this.count;
        let best = Infinity;
        let bestIndex = 0;
        let bestT = 0;
        const search = (from, to) => {
            for (let k = from; k <= to; k += 1) {
                const i = wrapIndex(k, count);
                const j = (i + 1) % count;
                const ax = this.x[i];
                const az = this.z[i];
                const bx = this.x[j] - ax;
                const bz = this.z[j] - az;
                const len2 = bx * bx + bz * bz;
                if (len2 < 1e-12) continue;
                const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / len2));
                const px = ax + bx * t - x;
                const pz = az + bz * t - z;
                const d2 = px * px + pz * pz;
                if (d2 < best) { best = d2; bestIndex = i; bestT = t; }
            }
        };
        if (hint >= 0) {
            search(hint - 14, hint + 14);
            if (best > 45 * 45) { best = Infinity; search(0, count - 1); }
        } else {
            search(0, count - 1);
        }
        const i = bestIndex;
        const j = (i + 1) % count;
        const seg = this.s[i + 1] - this.s[i];
        out.index = i;
        out.s = this.s[i] + seg * bestT;
        out.dist = Math.sqrt(best);
        const tx = this.tx[i] + (this.tx[j] - this.tx[i]) * bestT;
        const tz = this.tz[i] + (this.tz[j] - this.tz[i]) * bestT;
        const flat = Math.hypot(tx, tz) || 1;
        const cx = this.x[i] + (this.x[j] - this.x[i]) * bestT;
        const cz = this.z[i] + (this.z[j] - this.z[i]) * bestT;
        out.lane = ((x - cx) * (tz / flat)) + ((z - cz) * (-tx / flat));
        out.y = this.y[i] + (this.y[j] - this.y[i]) * bestT;
        return out;
    }

    // Maximum curvature magnitude over [s, s + distance].
    maxCurvature(s, distance, step = 6) {
        let worst = 0;
        for (let d = 0; d <= distance; d += step) {
            const loc = this.locate(s + d, TrackModel._loc);
            worst = Math.max(worst, Math.abs(this.kappa[loc.index]));
        }
        return worst;
    }

    rampAt(s) {
        for (const ramp of this.ramps) {
            const offset = this.wrapS(s - ramp.s0);
            if (offset <= ramp.s1 - ramp.s0) return ramp;
        }
        return null;
    }
}

TrackModel._loc = { index: 0, t: 0 };
TrackModel._frame = {};
