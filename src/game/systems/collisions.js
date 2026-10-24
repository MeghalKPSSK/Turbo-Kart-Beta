// Turns raw Rapier contact-force events into game events: wall scrapes, hazard hits,
// car-to-car contact and takedowns (a hard hit that wrecks the victim, Asphalt style).
// Pure logic - it only needs vehicles, so it also runs in the headless simulation.

const TAKEDOWN_CLOSING_SPEED = 10;   // m/s combined closing speed along the hit normal
const TAKEDOWN_ATTACK_SPEED = 5.5;   // the attacker must be driving into the victim
const CONTACT_COOLDOWN = 0.18;       // seconds between damage ticks for the same pair

export class CollisionSystem {
    constructor(physics) {
        this.physics = physics;
        this.cooldowns = new Map();
        this.events = [];
        this.time = 0;
    }

    // Call once per frame (after the fixed steps). Returns the events produced.
    update(dt) {
        this.time += dt;
        const impacts = this.physics.drainImpacts();
        this.events = [];
        if (!impacts.length) return this.events;
        // Merge the per-step events of one contact into a single strongest event.
        const merged = new Map();
        for (const impact of impacts) {
            const key = pairKey(impact);
            const entry = merged.get(key);
            if (!entry || impact.dv > entry.dv) merged.set(key, impact);
        }
        for (const [key, impact] of merged) {
            const last = this.cooldowns.get(key) ?? -1;
            if (this.time - last < CONTACT_COOLDOWN) continue;
            this.cooldowns.set(key, this.time);
            this.handle(impact);
        }
        // Forget stale cooldown entries.
        if (this.cooldowns.size > 300) {
            for (const [key, t] of this.cooldowns) if (this.time - t > 2) this.cooldowns.delete(key);
        }
        return this.events;
    }

    handle(impact) {
        const { a, b } = impact;
        const vehicles = [a, b].filter((o) => o?.type === 'vehicle').map((o) => o.vehicle);
        if (vehicles.length === 2) {
            this.vehicleHit(impact);
        } else if (vehicles.length === 1) {
            const other = a?.type === 'vehicle' ? b : a;
            const kind = other?.type === 'hazard' || other?.type === 'gate' ? 'hazard' : 'wall';
            this.staticHit(impact, kind, other);
        }
    }

    // Closing speed along the line between two cars, from their velocities *before* the step
    // in which they touched.
    vehicleHit(impact) {
        const a = impact.a.vehicle;
        const b = impact.b.vehicle;
        if (a.mode === 'wrecked' && b.mode === 'wrecked') return;
        const nx0 = impact.posB.x - impact.posA.x;
        const ny0 = impact.posB.y - impact.posA.y;
        const nz0 = impact.posB.z - impact.posA.z;
        const len = Math.hypot(nx0, ny0, nz0) || 1;
        const nx = nx0 / len, ny = ny0 / len, nz = nz0 / len;
        const va = impact.preA;
        const vb = impact.preB;
        const aToward = va.x * nx + va.y * ny + va.z * nz;       // A moving toward B
        const bToward = -(vb.x * nx + vb.y * ny + vb.z * nz);    // B moving toward A
        const closing = aToward + bToward;
        const attacker = aToward >= bToward ? a : b;
        const victim = attacker === a ? b : a;
        const attackSpeed = Math.max(aToward, bToward);
        const mid = { x: (impact.posA.x + impact.posB.x) / 2, y: (impact.posA.y + impact.posB.y) / 2 + 0.6, z: (impact.posA.z + impact.posB.z) / 2 };

        const dvA = impact.dvA || 0;
        const dvB = impact.dvB || 0;
        const impulseSpeed = Math.max(dvA, dvB);
        const severity = Math.min(1.5, Math.max(impulseSpeed, Math.max(0, closing) * 0.6) / 16);
        this.damage(a, Math.max(0, dvA - 3) * 0.011 * (a === victim ? 1.15 : 0.75));
        this.damage(b, Math.max(0, dvB - 3) * 0.011 * (b === victim ? 1.15 : 0.75));
        this.events.push({ type: 'vehicle', a, b, closing, impulseSpeed, severity, point: mid });

        const canTakeDown = victim.mode === 'ok' && attacker.mode === 'ok' && victim.ghostTimer <= 0 && attacker.ghostTimer <= 0;
        if (canTakeDown && closing >= TAKEDOWN_CLOSING_SPEED && attackSpeed >= TAKEDOWN_ATTACK_SPEED) {
            // Direction the victim is knocked: from the attacker toward the victim.
            const dirX = victim.position.x - attacker.position.x;
            const dirZ = victim.position.z - attacker.position.z;
            const dl = Math.hypot(dirX, dirZ) || 1;
            const direction = { x: dirX / dl, z: dirZ / dl };
            const resilience = 0.75 + 0.25 * victim.spec.armor.damageMultiplier;
            victim.wreck(direction, Math.min(1.2, 0.55 + closing / 28) * resilience, 1.5 + Math.min(0.9, closing / 40));
            this.damage(victim, 0.12 * victim.spec.armor.damageMultiplier);
            this.events.push({ type: 'takedown', attacker, victim, closing, point: mid });
        }
    }

    staticHit(impact, kind, other) {
        const vehicle = (impact.a?.type === 'vehicle' ? impact.a : impact.b).vehicle;
        if (vehicle.mode === 'wrecked') return;
        // The physical impact: how much that one step changed the car's velocity.
        const impulseSpeed = (impact.a?.type === 'vehicle' ? impact.dvA : impact.dvB) || 0;
        const hard = kind === 'hazard' ? 1.35 : 1;
        const speed = vehicle.speedAbs;
        this.damage(vehicle, Math.max(0, impulseSpeed - 3) * 0.011 * hard);
        this.events.push({ type: kind, vehicle, impulseSpeed, speed, hazard: other?.hazard, severity: Math.min(1.5, impulseSpeed / 16), force: impact.force });
    }

    damage(vehicle, amount) {
        if (amount <= 0 || vehicle.ghostTimer > 0) return;
        vehicle.health = Math.max(0, vehicle.health - amount * vehicle.spec.armor.damageMultiplier);
        if (vehicle.health <= 0 && vehicle.mode === 'ok') {
            vehicle.wreck({ x: -vehicle.forward.x, z: -vehicle.forward.z }, 1.1, 2.1);
            this.events.push({ type: 'destroyed', vehicle });
        }
    }
}

function ownerId(o) {
    if (!o) return 'none';
    if (o.type === 'vehicle') return `v${o.vehicle.id}`;
    if (o.type === 'hazard') return `h${o.hazard?.id}`;
    return o.type;
}

function pairKey({ a, b }) {
    const ka = ownerId(a);
    const kb = ownerId(b);
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}
