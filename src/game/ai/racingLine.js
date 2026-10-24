// Racing line and speed profile for AI drivers. Both are derived from the same TrackModel
// the physics uses, so what the AI "knows" about the circuit is exactly what exists.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Lateral offset (metres, + = left) the AI aims for at every route sample: cut toward the
// inside of corners, stay central on straights and in front of ramps.
export function buildRacingLine(track, { maxOffset = 6.5, gain = 330 } = {}) {
    const n = track.count;
    const smooth = new Float64Array(n);
    const window = 14; // samples each side (~30-40 m)
    for (let i = 0; i < n; i += 1) {
        let sum = 0;
        let weight = 0;
        for (let k = -window; k <= window; k += 1) {
            const w = window + 1 - Math.abs(k);
            sum += track.kappa[(i + k + n) % n] * w;
            weight += w;
        }
        smooth[i] = sum / weight;
    }
    const offset = new Float32Array(n);
    for (let i = 0; i < n; i += 1) offset[i] = clamp(smooth[i] * gain, -maxOffset, maxOffset);
    // Ramps are taken near the middle so both sides of the car are supported.
    for (const ramp of track.ramps) {
        for (let i = 0; i < n; i += 1) {
            const into = track.wrapS(track.s[i] - (ramp.s0 - 45));
            if (into < ramp.s1 - ramp.s0 + 45 + 20) {
                const fade = clamp(into < 45 ? into / 45 : 1, 0, 1);
                offset[i] *= 1 - fade;
            }
        }
    }
    return offset;
}

// Fastest speed the AI will carry through every sample, limited by grip (with aero
// downforce) and by how late it can brake for the next slow section.
export function buildSpeedProfile(track, line, { grip, gravity, topSpeed, brakeDecel, downforceFraction = 0.45, margin = 0.9 }) {
    const n = track.count;
    const x = new Float64Array(n);
    const z = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
        const flat = Math.hypot(track.tx[i], track.tz[i]) || 1;
        const lx = track.tz[i] / flat;
        const lz = -track.tx[i] / flat;
        x[i] = track.x[i] + lx * line[i];
        z[i] = track.z[i] + lz * line[i];
    }
    const speed = new Float64Array(n);
    const aLat = grip * gravity * margin;
    const c = (downforceFraction / (topSpeed * topSpeed)) * aLat; // extra lateral accel per v^2
    const stencil = 3;
    for (let i = 0; i < n; i += 1) {
        const a = (i - stencil + n) % n;
        const b = (i + stencil) % n;
        const abx = x[i] - x[a], abz = z[i] - z[a];
        const bcx = x[b] - x[i], bcz = z[b] - z[i];
        const acx = x[b] - x[a], acz = z[b] - z[a];
        const cross = Math.abs(abx * acz - abz * acx);
        const lab = Math.hypot(abx, abz), lbc = Math.hypot(bcx, bcz), lac = Math.hypot(acx, acz);
        const curvature = cross < 1e-9 ? 0 : (2 * cross) / (lab * lbc * lac);
        const free = curvature - c;
        speed[i] = free <= 1e-6 ? topSpeed * 1.2 : Math.min(topSpeed * 1.2, Math.sqrt(aLat / free));
    }
    // Backward pass: never be going faster than we can brake down to the next limit.
    for (let pass = 0; pass < 3; pass += 1) {
        for (let k = n - 1; k >= 0; k -= 1) {
            const i = k;
            const j = (i + 1) % n;
            const ds = track.s[i + 1] - track.s[i];
            const allowed = Math.sqrt(speed[j] * speed[j] + 2 * brakeDecel * ds);
            if (allowed < speed[i]) speed[i] = allowed;
        }
    }
    return { speed, x, z };
}

export function sampleAt(track, array, s) {
    const loc = track.locate(s);
    const i = loc.index;
    const j = (i + 1) % track.count;
    return array[i] + (array[j] - array[i]) * loc.t;
}
