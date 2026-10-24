import * as THREE from 'three';

// Dark tyre marks laid down by sliding wheels: a ring buffer of flat instanced quads.
export class SkidMarks {
    constructor(scene, { max = 900 } = {}) {
        this.max = max;
        this.cursor = 0;
        const geometry = new THREE.PlaneGeometry(0.32, 0.9);
        geometry.rotateX(-Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({
            color: 0x050505, transparent: true, opacity: 0.5, depthWrite: false,
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
        });
        this.mesh = new THREE.InstancedMesh(geometry, material, max);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 2;
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < max; i += 1) this.mesh.setMatrixAt(i, hidden);
        scene.add(this.mesh);
        this.matrix = new THREE.Matrix4();
        this.quaternion = new THREE.Quaternion();
        this.up = new THREE.Vector3();
        this.basis = new THREE.Matrix4();
        this.last = new Map();
    }

    // key identifies a wheel so marks are spaced out along its path.
    add(key, point, normal, dirX, dirZ) {
        const previous = this.last.get(key);
        if (previous && Math.hypot(point.x - previous.x, point.z - previous.z) < 0.55) return;
        this.last.set(key, { x: point.x, z: point.z });
        const forward = new THREE.Vector3(dirX, 0, dirZ);
        if (forward.lengthSq() < 1e-6) return;
        forward.normalize();
        this.up.set(normal.x, normal.y, normal.z).normalize();
        const right = new THREE.Vector3().crossVectors(this.up, forward).normalize();
        const fwd = new THREE.Vector3().crossVectors(right, this.up).normalize();
        this.basis.makeBasis(right, this.up, fwd);
        this.quaternion.setFromRotationMatrix(this.basis);
        this.matrix.compose(new THREE.Vector3(point.x, point.y + 0.03, point.z), this.quaternion, new THREE.Vector3(1, 1, 1));
        this.mesh.setMatrixAt(this.cursor, this.matrix);
        this.cursor = (this.cursor + 1) % this.max;
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    release(key) {
        this.last.delete(key);
    }

    dispose() {
        this.mesh.removeFromParent();
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
