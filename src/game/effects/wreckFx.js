import * as THREE from 'three';

// Flying wreckage: the pieces a bike breaks into when it is wrecked. One instanced mesh of
// boxes with per-piece colour, simple ballistic motion and a bounce on the road.
export class WreckFx {
    constructor(scene, { max = 72, gravity = 13 } = {}) {
        this.max = max;
        this.gravity = gravity;
        this.cursor = 0;
        this.pieces = Array.from({ length: max }, () => ({
            life: 0, position: new THREE.Vector3(), velocity: new THREE.Vector3(), spin: new THREE.Vector3(),
            rotation: new THREE.Euler(), size: new THREE.Vector3(), ground: 0
        }));
        const material = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.4 });
        this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, max);
        this.mesh.frustumCulled = false;
        this.mesh.castShadow = true;
        this.dummy = new THREE.Object3D();
        this.colour = new THREE.Color();
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        for (let i = 0; i < max; i += 1) {
            this.mesh.setMatrixAt(i, this.dummy.matrix);
            this.mesh.setColorAt(i, this.colour.set(0x222222));
        }
        scene.add(this.mesh);
        this.scene = scene;
    }

    // Throws `count` pieces out from `position`, carrying some of `velocity`. Half take the
    // vehicle's paint, the rest are dark frame and tyre parts.
    burst(position, velocity, paint, count = 16) {
        for (let i = 0; i < count; i += 1) {
            const index = this.cursor;
            this.cursor = (this.cursor + 1) % this.max;
            const piece = this.pieces[index];
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 9;
            piece.life = 2.6 + Math.random() * 1.6;
            piece.ground = position.y + 0.08;
            piece.position.set(position.x + (Math.random() - 0.5), position.y + 0.5 + Math.random() * 0.8, position.z + (Math.random() - 0.5));
            piece.velocity.set(velocity.x * 0.55 + Math.cos(angle) * speed, 4 + Math.random() * 8, velocity.z * 0.55 + Math.sin(angle) * speed);
            piece.spin.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
            const wheel = i < 2;
            if (wheel) piece.size.set(0.16, 0.6, 0.6);
            else piece.size.set(0.12 + Math.random() * 0.4, 0.08 + Math.random() * 0.22, 0.15 + Math.random() * 0.55);
            this.mesh.setColorAt(index, this.colour.set(wheel ? 0x0c0c0d : i % 2 ? paint : 0x2a2d31));
        }
        this.mesh.instanceColor.needsUpdate = true;
    }

    update(dt) {
        if (!dt) return;
        const dummy = this.dummy;
        for (let i = 0; i < this.max; i += 1) {
            const piece = this.pieces[i];
            if (piece.life <= 0) continue;
            piece.life -= dt;
            piece.velocity.y -= this.gravity * dt;
            piece.position.addScaledVector(piece.velocity, dt);
            if (piece.position.y < piece.ground && piece.velocity.y < 0) {
                // Bounce, losing most of the energy, then skid to a stop.
                piece.position.y = piece.ground;
                piece.velocity.y *= -0.32;
                piece.velocity.x *= 0.7;
                piece.velocity.z *= 0.7;
                piece.spin.multiplyScalar(0.6);
            }
            piece.rotation.x += piece.spin.x * dt;
            piece.rotation.y += piece.spin.y * dt;
            piece.rotation.z += piece.spin.z * dt;
            dummy.position.copy(piece.position);
            dummy.rotation.copy(piece.rotation);
            // Shrink away over the last half second rather than popping out.
            dummy.scale.copy(piece.size).multiplyScalar(piece.life > 0 ? Math.min(1, piece.life / 0.5) : 0);
            dummy.updateMatrix();
            this.mesh.setMatrixAt(i, dummy.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.mesh.dispose();
    }
}
