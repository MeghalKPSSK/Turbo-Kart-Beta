// Rules shared by the game and the headless simulation: where cars start, how a wrecked
// car comes back, and how a stranded car is put back on the road.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Two-wide grid staggered behind the start line; slot 0 is pole position.
export function gridSlot(track, index) {
    const row = Math.floor(index / 2);
    const lane = index % 2 === 0 ? 3.6 : -3.6;
    const s = track.wrapS(track.length - 11 - row * 10);
    const p = track.roadPoint(s, lane);
    return { s, lane, x: p.x, y: p.y, z: p.z, forward: { x: p.tx, y: p.ty, z: p.tz } };
}

// A lane with room around the hazards near route distance `s`, so a respawned car never
// overlaps an obstacle. The preferred lane wins whenever it is clear.
export function clearLane(track, s, preferred = 0, reach = 14) {
    const limit = track.halfWidth - 3;
    const candidates = [preferred, 0, 4, -4, 8, -8].map((lane) => clamp(Number.isFinite(lane) ? lane : 0, -limit, limit));
    let best = candidates[0];
    let bestGap = -Infinity;
    for (const lane of candidates) {
        let gap = Infinity;
        for (const hazard of track.hazards) {
            let d = track.wrapS(hazard.s - s);
            if (d > track.length / 2) d -= track.length;
            if (d < -8 || d > reach) continue;
            gap = Math.min(gap, Math.abs(hazard.lane - lane) - hazard.half[0]);
        }
        if (gap >= 3) return lane;
        if (gap > bestGap) { bestGap = gap; best = lane; }
    }
    return best;
}

// Put a car back on the road at route distance `s`, facing the race direction.
export function placeOnRoad(track, vehicle, s, lane = 0, speed = 0, { ghost = 1.8 } = {}) {
    const safeS = Number.isFinite(s) ? s : 0;
    const p = track.roadPoint(safeS, clearLane(track, safeS, lane));
    vehicle.place(p.x, p.y + 0.45, p.z, { x: p.tx, y: p.ty, z: p.tz }, Number.isFinite(speed) ? speed : 0);
    vehicle.recover();
    if (ghost > 0) vehicle.grantGhost(ghost);
}

// A wrecked car lands, spins for a moment, then is stood back up where it ended. A car whose
// physics body went invalid is put back the same way from its last good position.
export function recoverVehicle(track, tracker, vehicle) {
    const speed = Math.max(0, vehicle.speed) * 0.3;
    if (vehicle.mode === 'wrecked') vehicle.health = Math.max(vehicle.health, 0.55);
    placeOnRoad(track, vehicle, tracker.s + 3, tracker.lane, speed, { ghost: 2 });
}

export function needsRecovery(vehicle) {
    return vehicle.invalid || (vehicle.mode === 'wrecked' && vehicle.wreckTimer <= 0);
}
