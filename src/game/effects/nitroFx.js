import * as THREE from 'three';

// Nitro: a flickering blue-white flame at every exhaust plus a long glowing ribbon trail
// that streaks behind the car for as long as the boost burns (and fades after).

const FLAME_LENGTH = 3.4;

function glowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(150,225,255,0.95)');
    g.addColorStop(0.5, 'rgba(30,130,255,0.45)');
    g.addColorStop(1, 'rgba(0,60,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

const flameVertex = `
    uniform float uTime; uniform float uIntensity; uniform float uLength; uniform float uPhase;
    varying float vT; varying float vFlick;
    void main() {
        vec3 p = position;
        float t = clamp(-p.z / uLength, 0.0, 1.0);
        float flick = 0.88 + 0.12 * sin(uTime * 63.0 + uPhase) + 0.07 * sin(uTime * 131.0 + t * 9.0);
        // Flame swells just behind the nozzle, then tapers to a licking tip.
        float swell = 1.0 + 0.5 * sin(t * 3.14159) * flick;
        p.xy *= swell * (0.55 + 0.45 * uIntensity);
        p.xy += 0.05 * t * vec2(sin(uTime * 41.0 + uPhase + t * 7.0), cos(uTime * 37.0 + uPhase * 1.7 + t * 5.0));
        p.z *= uIntensity * (0.92 + 0.16 * flick);
        vT = t; vFlick = flick;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;

const flameFragment = `
    uniform vec3 uCore; uniform vec3 uEdge; uniform float uIntensity; uniform float uOpacity;
    varying float vT; varying float vFlick;
    void main() {
        float fade = pow(1.0 - vT, 1.25);
        vec3 color = mix(uCore, uEdge, smoothstep(0.0, 0.8, vT));
        float alpha = fade * uOpacity * uIntensity * (0.8 + 0.2 * vFlick);
        gl_FragColor = vec4(color * (1.2 + 0.8 * fade), alpha);
    }`;

function makeFlame(radius, core, edge, opacity, phase) {
    const geometry = new THREE.ConeGeometry(radius, FLAME_LENGTH, 18, 10, true);
    geometry.rotateX(-Math.PI / 2);          // axis along -Z, tip pointing backwards
    geometry.translate(0, 0, -FLAME_LENGTH / 2);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 }, uIntensity: { value: 0 }, uLength: { value: FLAME_LENGTH },
            uCore: { value: new THREE.Color(core) }, uEdge: { value: new THREE.Color(edge) },
            uOpacity: { value: opacity }, uPhase: { value: phase }
        },
        vertexShader: flameVertex,
        fragmentShader: flameFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 9;
    return mesh;
}

class RibbonTrail {
    constructor(scene, { points = 46, width = 0.7 } = {}) {
        this.count = points;
        this.width = width;
        this.positions = [];   // world points, newest first
        this.maxAge = 0.38;
        this.ages = [];
        const vertexCount = points * 2;
        this.positionArray = new Float32Array(vertexCount * 3);
        this.colorArray = new Float32Array(vertexCount * 4);
        const indices = [];
        for (let i = 0; i < points - 1; i += 1) {
            const a = i * 2;
            indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positionArray, 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('color', new THREE.BufferAttribute(this.colorArray, 4).setUsage(THREE.DynamicDrawUsage));
        geometry.setIndex(indices);
        const material = new THREE.MeshBasicMaterial({
            vertexColors: true, transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 7;
        this.mesh.visible = false;
        scene.add(this.mesh);
        this.geometry = geometry;
        this.material = material;
        this.strength = 0;
    }

    push(x, y, z) {
        this.positions.unshift(new THREE.Vector3(x, y, z));
        this.ages.unshift(0);
        if (this.positions.length > this.count) { this.positions.pop(); this.ages.pop(); }
    }

    update(dt, cameraPosition, emitting) {
        for (let i = 0; i < this.ages.length; i += 1) this.ages[i] += dt;
        while (this.ages.length && this.ages[this.ages.length - 1] > this.maxAge) { this.ages.pop(); this.positions.pop(); }
        this.strength += ((emitting ? 1 : 0) - this.strength) * Math.min(1, dt * (emitting ? 14 : 5));
        const n = this.positions.length;
        this.mesh.visible = n > 1;
        if (n < 2) return;
        const side = new THREE.Vector3();
        const dir = new THREE.Vector3();
        const toCamera = new THREE.Vector3();
        for (let i = 0; i < this.count; i += 1) {
            const k = Math.min(i, n - 1);
            const p = this.positions[k];
            const prev = this.positions[Math.max(0, k - 1)];
            const next = this.positions[Math.min(n - 1, k + 1)];
            dir.subVectors(prev, next);
            if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
            dir.normalize();
            toCamera.subVectors(cameraPosition, p).normalize();
            side.crossVectors(dir, toCamera);
            if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
            side.normalize();
            const life = i < n ? this.ages[k] / this.maxAge : 1;
            const taper = Math.pow(1 - life, 0.7) * (i === 0 ? 0.35 : 1);
            const halfWidth = this.width * taper * (0.45 + 0.55 * this.strength);
            const a = i * 2;
            this.positionArray[a * 3] = p.x + side.x * halfWidth;
            this.positionArray[a * 3 + 1] = p.y + side.y * halfWidth;
            this.positionArray[a * 3 + 2] = p.z + side.z * halfWidth;
            this.positionArray[(a + 1) * 3] = p.x - side.x * halfWidth;
            this.positionArray[(a + 1) * 3 + 1] = p.y - side.y * halfWidth;
            this.positionArray[(a + 1) * 3 + 2] = p.z - side.z * halfWidth;
            const fade = Math.pow(1 - life, 1.3) * (i < n ? 1 : 0);
            // Dissolve near the camera so the trail never fills the view of a chase camera.
            const nearT = Math.min(1, Math.max(0, (p.distanceTo(cameraPosition) - 4) / 8));
            const nearFade = nearT * nearT * (3 - 2 * nearT);
            // Hot white-cyan at the nozzle cooling to saturated blue down the trail.
            const heat = Math.pow(1 - life, 2.6);
            const r = 0.2 + 0.7 * heat, g = 0.5 + 0.45 * heat, b = 1.0;
            for (const v of [a, a + 1]) {
                this.colorArray[v * 4] = r; this.colorArray[v * 4 + 1] = g; this.colorArray[v * 4 + 2] = b;
                this.colorArray[v * 4 + 3] = fade * nearFade * 0.8;
            }
        }
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
    }

    dispose() {
        this.mesh.removeFromParent();
        this.geometry.dispose();
        this.material.dispose();
    }
}

export class NitroEffect {
    constructor(scene, visual, { exhausts, isPlayer = false, glow }) {
        this.scene = scene;
        this.visual = visual;
        this.isPlayer = isPlayer;
        this.intensity = 0;
        this.flames = [];
        this.trails = [];
        this.exhausts = exhausts;
        const phase = Math.random() * 6;
        exhausts.forEach((exhaust, index) => {
            const group = new THREE.Group();
            group.position.set(exhaust.x, exhaust.y, exhaust.z);
            const outer = makeFlame(0.3, 0x58c8ff, 0x0a46ff, 0.9, phase + index);
            const inner = makeFlame(0.16, 0xffffff, 0x7fe3ff, 1.0, phase * 1.3 + index);
            inner.scale.set(1, 1, 0.62);
            group.add(outer, inner);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: glow, color: 0x86d9ff, transparent: true, depthWrite: false,
                blending: THREE.AdditiveBlending, opacity: 0
            }));
            sprite.scale.set(1.9, 1.9, 1);
            sprite.position.z = -0.2;
            group.add(sprite);
            group.visible = false;
            visual.lean.add(group);
            this.flames.push({ group, outer, inner, sprite });
            this.trails.push(new RibbonTrail(scene, { width: isPlayer ? 0.44 : 0.36 }));
        });
        if (isPlayer) {
            this.light = new THREE.PointLight(0x3a9bff, 0, 16, 1.8);
            this.light.position.set(0, 0.7, -2.4);
            visual.lean.add(this.light);
        }
        this.world = new THREE.Vector3();
        this.accumulator = 0;
    }

    update(dt, time, vehicle, camera, particles) {
        const active = vehicle.nitroActive && vehicle.mode === 'ok';
        this.intensity += ((active ? 1 : 0) - this.intensity) * Math.min(1, dt * (active ? 18 : 9));
        const visible = this.intensity > 0.02;
        const kick = active ? 1 + 0.35 * Math.exp(-vehicle.nitroTime / 0.4) : 1;
        this.flames.forEach((flame, index) => {
            flame.group.visible = visible;
            if (!visible) return;
            for (const mesh of [flame.outer, flame.inner]) {
                mesh.material.uniforms.uTime.value = time;
                mesh.material.uniforms.uIntensity.value = this.intensity * kick;
            }
            flame.sprite.material.opacity = 0.85 * this.intensity;
            flame.sprite.scale.setScalar(1.5 + 0.6 * this.intensity * (0.8 + 0.2 * Math.sin(time * 55 + index)));
            const trail = this.trails[index];
            flame.group.getWorldPosition(this.world);
            if (active) trail.push(this.world.x, this.world.y, this.world.z);
        });
        this.trails.forEach((trail) => trail.update(dt, camera.position, active));
        if (this.light) this.light.intensity = 5.5 * this.intensity * (0.85 + 0.15 * Math.sin(time * 70));

        // Sparks spat out of the nozzles.
        if (active && particles) {
            this.accumulator += dt * 70;
            const count = Math.floor(this.accumulator);
            this.accumulator -= count;
            for (let k = 0; k < count; k += 1) {
                const flame = this.flames[k % this.flames.length];
                flame.group.getWorldPosition(this.world);
                const back = -(4 + Math.random() * 7);
                const fx = vehicle.forward.x * back + (Math.random() - 0.5) * 2.4 + vehicle.velocity.x * 0.6;
                const fy = vehicle.forward.y * back + (Math.random() - 0.3) * 2.0 + vehicle.velocity.y * 0.6;
                const fz = vehicle.forward.z * back + (Math.random() - 0.5) * 2.4 + vehicle.velocity.z * 0.6;
                const white = Math.random() < 0.4;
                particles.spawn(this.world.x, this.world.y, this.world.z, fx, fy, fz, 0.25 + Math.random() * 0.3,
                    0.16 + Math.random() * 0.16, 0.02, 0.9, white ? 0.9 : 0.25, white ? 0.97 : 0.65, 1, 0, 1.5);
            }
        }
    }

    dispose() {
        for (const flame of this.flames) {
            flame.group.removeFromParent();
            flame.outer.geometry.dispose(); flame.outer.material.dispose();
            flame.inner.geometry.dispose(); flame.inner.material.dispose();
            flame.sprite.material.dispose();
        }
        this.trails.forEach((trail) => trail.dispose());
        this.light?.removeFromParent();
    }
}

export { glowTexture };
