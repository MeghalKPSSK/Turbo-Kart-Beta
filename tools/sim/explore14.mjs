import { loadWorld } from './harness.mjs';

const trackId = process.argv[2] || 'canyon_springs';
const world = await loadWorld(trackId);
const { track, physics } = world;
const ramp = track.ramps[0];
physics.step(); // the query pipeline is only built by the first step
console.log(trackId, 'ramp', ramp.s0.toFixed(1), '-', ramp.s1.toFixed(1), 'halfWidth', ramp.halfWidth, 'rise', ramp.rise);
const lanes = [7.0, 8.0, 8.5, 8.8, 9.0, 9.3, 9.8, 10.5, 12];
console.log('s \\ lane'.padEnd(10) + lanes.map((l) => String(l).padStart(7)).join(''));
for (const s of [ramp.s0 - 3, ramp.s0 + 3, ramp.s0 + 8, ramp.s0 + 14, ramp.s0 + 18, ramp.s0 + 21, ramp.s0 + 23, ramp.s1 - 0.5, ramp.s1 + 0.5, ramp.s1 + 3]) {
    const row = lanes.map((lane) => {
        const p = track.roadPoint(s, lane);
        const h = physics.groundHeight(p.x, p.y + 6, p.z);
        return (h === null ? 'none' : (h - p.y).toFixed(2)).padStart(7);
    });
    console.log(`${(s - ramp.s0).toFixed(1).padStart(8)}  ` + row.join(''));
}
