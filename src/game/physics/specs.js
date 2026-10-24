import { UPGRADE_MAX_LEVEL } from '../data/roadRacing.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const DEFAULT_GRAVITY = 13;

export function normalizeUpgrades(upgrades = {}) {
    const out = {};
    for (const key of ['speed', 'accel', 'handling', 'nitro', 'armor']) {
        out[key] = clamp(Math.round(upgrades[key] || 0), 0, UPGRADE_MAX_LEVEL);
    }
    return out;
}

// Turns a catalogue entry (stats 1-5), the player's upgrade levels and an optional AI
// pace multiplier into the physical parameters the vehicle simulation uses.
export function buildVehicleSpec(vehicle, upgrades = {}, { gravity = DEFAULT_GRAVITY, pace = 1, power = 1 } = {}) {
    const up = normalizeUpgrades(upgrades);
    const isBike = vehicle.type === 'BIKE';
    const dims = vehicle.dims;
    const stats = vehicle.stats;
    const mass = dims.mass + up.armor * 14;

    const topSpeed = (isBike ? 62 : 64) + 4 * (stats.speed - 3) + 2 * up.speed;
    const peakAccel = ((isBike ? 13.5 : 10.2) + (isBike ? 1.4 : 1.3) * (stats.acceleration - 3) + 0.82 * up.accel) * power;
    const grip = (isBike ? 1.30 : 1.34) + 0.075 * (stats.handling - 3) + 0.054 * up.handling;
    const maxSteer = (isBike ? 0.60 : 0.50) + 0.02 * (stats.handling - 3) + 0.012 * up.handling;

    const engineForce = mass * peakAccel;
    const perWheelMass = mass / 4;
    const frequency = isBike ? 1.9 : 1.65;
    const stiffness = perWheelMass * (2 * Math.PI * frequency) ** 2;
    const damping = 2 * 0.58 * Math.sqrt(stiffness * perWheelMass);
    const restLength = 0.42;
    const staticCompression = (perWheelMass * gravity) / stiffness;
    const springLengthAtRest = restLength - staticCompression;

    const wheels = dims.wheels.map((wheel) => ({
        ...wheel,
        mount: { x: wheel.x, y: wheel.radius + springLengthAtRest, z: wheel.z }
    }));

    const length = dims.length;
    const width = dims.width;
    const inertia = {
        x: mass * (length * length / 12 + 0.08) * 1.1,
        y: mass * (length * length + width * width) / 12 * (isBike ? 0.62 : 0.78),
        z: mass * (width * width + 1) / 12 * (isBike ? 1.8 : 1.2)
    };

    return {
        id: vehicle.id,
        type: vehicle.type,
        isBike,
        mass,
        gravity,
        wheelbase: dims.wheelbase,
        wheels,
        body: dims.body,
        comHeight: dims.comHeight,
        inertia,
        suspension: {
            stiffness,
            damping,
            restLength,
            minLength: 0.1,
            maxLength: restLength + 0.1,
            springLengthAtRest,
            maxForce: perWheelMass * gravity * 15
        },
        engine: {
            force: engineForce,
            topSpeed: topSpeed * pace,
            // The power curve reaches zero here; drag and rolling resistance pull the real top
            // speed down to the advertised one.
            curveTopSpeed: topSpeed * pace * 1.108,
            reverseForce: engineForce * 0.5,
            reverseTopSpeed: 15,
            brakeForce: mass * (isBike ? 17 : 19),
            nitroPower: 1.55 + 0.06 * up.nitro,
            nitroTopSpeed: 1.17 + 0.012 * up.nitro,
            nitroDrain: 0.25 - 0.016 * up.nitro
        },
        tires: {
            grip,
            maxSteer,
            steerSpeedRef: isBike ? 38 : 34,
            driftRearGrip: 0.4,
            lateralTau: 0.045,
            rollingResistance: 0.012
        },
        aero: {
            drag: (0.1 * engineForce) / (topSpeed * topSpeed),
            downforce: (0.45 * mass * gravity) / (topSpeed * topSpeed)
        },
        armor: {
            damageMultiplier: clamp(1 - 0.08 * (stats.armor - 3) - 0.06 * up.armor, 0.3, 1.25)
        },
        upgrades: up
    };
}

// Human readable numbers for the garage (what an upgrade level actually does).
export function describeSpec(spec) {
    const e = spec.engine;
    return {
        topSpeedKmh: Math.round(e.topSpeed * 3.6),
        nitroTopSpeedKmh: Math.round(e.topSpeed * e.nitroTopSpeed * 3.6),
        accel0to100: (100 / 3.6) / Math.min(spec.tires.grip * spec.gravity * 0.55, (e.force / spec.mass) * 0.85),
        gripG: spec.tires.grip,
        nitroSeconds: 1 / e.nitroDrain,
        durability: Math.round((1 / spec.armor.damageMultiplier) * 100)
    };
}
