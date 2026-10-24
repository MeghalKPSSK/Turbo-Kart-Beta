import * as THREE from 'three';

// A fixed-size ring buffer of soft point sprites rendered with one draw call. Used for
// sparks, tyre smoke, landing dust, coin sparkles and explosions.
export class ParticlePool {
    constructor(scene, { max = 1200, additive = true, depthTest = true } = {}) {
        this.max = max;
        this.cursor = 0;
        this.alive = 0;
        this.position = new Float32Array(max * 3);
        this.color = new Float32Array(max * 3);
        this.size = new Float32Array(max);
        this.alpha = new Float32Array(max);
        this.velocity = new Float32Array(max * 3);
        this.life = new Float32Array(max);
        this.age = new Float32Array(max).fill(1e9);
        this.baseSize = new Float32Array(max);
        this.endSize = new Float32Array(max);
        this.baseAlpha = new Float32Array(max);
        this.gravity = new Float32Array(max);
        this.drag = new Float32Array(max);
        this.tint = new Float32Array(max * 3);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
        this.uniforms = { uScale: { value: 600 } };
        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            transparent: true,
            depthWrite: false,
            depthTest,
            blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
            vertexShader: `
                attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
                uniform float uScale; varying vec3 vColor; varying float vAlpha;
                void main() {
                    vColor = aColor;
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    // Fade out particles close to the lens so smoke never smears over the screen.
                    float nearFade = smoothstep(2.0, 9.0, -mv.z);
                    vAlpha = aAlpha * nearFade;
                    gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 150.0);
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: `
                varying vec3 vColor; varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - 0.5) * 2.0;
                    float a = 1.0 - smoothstep(0.0, 1.0, d);
                    a *= a;
                    if (a < 0.01) discard;
                    gl_FragColor = vec4(vColor, a * vAlpha);
                }`
        });
        this.points = new THREE.Points(geometry, material);
        this.points.frustumCulled = false;
        this.points.renderOrder = additive ? 8 : 6;
        scene.add(this.points);
        this.geometry = geometry;
        this.material = material;
    }

    // options: position, velocity, life, size, endSize, alpha, color [r,g,b], gravity, drag
    spawn(x, y, z, vx, vy, vz, life, size, endSize, alpha, r, g, b, gravity = 0, drag = 0) {
        const i = this.cursor;
        this.cursor = (this.cursor + 1) % this.max;
        const i3 = i * 3;
        this.position[i3] = x; this.position[i3 + 1] = y; this.position[i3 + 2] = z;
        this.velocity[i3] = vx; this.velocity[i3 + 1] = vy; this.velocity[i3 + 2] = vz;
        this.color[i3] = r; this.color[i3 + 1] = g; this.color[i3 + 2] = b;
        this.life[i] = life;
        this.age[i] = 0;
        this.baseSize[i] = size;
        this.endSize[i] = endSize;
        this.baseAlpha[i] = alpha;
        this.gravity[i] = gravity;
        this.drag[i] = drag;
        this.size[i] = size;
        this.alpha[i] = alpha;
    }

    update(dt, camera, viewportHeight) {
        const fov = camera.fov * Math.PI / 180;
        this.uniforms.uScale.value = (viewportHeight * 0.5) / Math.tan(fov / 2);
        for (let i = 0; i < this.max; i += 1) {
            const age = this.age[i];
            if (age >= this.life[i]) {
                if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; }
                continue;
            }
            const next = age + dt;
            this.age[i] = next;
            const t = next / this.life[i];
            const i3 = i * 3;
            const drag = Math.max(0, 1 - this.drag[i] * dt);
            this.velocity[i3] *= drag;
            this.velocity[i3 + 1] = this.velocity[i3 + 1] * drag - this.gravity[i] * dt;
            this.velocity[i3 + 2] *= drag;
            this.position[i3] += this.velocity[i3] * dt;
            this.position[i3 + 1] += this.velocity[i3 + 1] * dt;
            this.position[i3 + 2] += this.velocity[i3 + 2] * dt;
            this.size[i] = this.baseSize[i] + (this.endSize[i] - this.baseSize[i]) * t;
            this.alpha[i] = this.baseAlpha[i] * (1 - t) * Math.min(1, t * 12 + 0.25);
        }
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.aColor.needsUpdate = true;
        this.geometry.attributes.aSize.needsUpdate = true;
        this.geometry.attributes.aAlpha.needsUpdate = true;
    }

    dispose() {
        this.points.removeFromParent();
        this.geometry.dispose();
        this.material.dispose();
    }
}
