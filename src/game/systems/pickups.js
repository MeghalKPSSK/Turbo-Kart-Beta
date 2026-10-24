import * as THREE from 'three';

// Collectables: Asphalt-style nitro canisters and instanced road coins. Both are driven
// by world-space positions exported from the Blender track metadata, so they always sit
// exactly where the layout planner put them (clear of hazards, ramps and each other).

function labelTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#0b3d91');
    gradient.addColorStop(0.5, '#1578ff');
    gradient.addColorStop(1, '#0b3d91');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    // Lightning bolt
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#9ee6ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(150, 24);
    ctx.lineTo(82, 140);
    ctx.lineTo(124, 140);
    ctx.lineTo(104, 232);
    ctx.lineTo(176, 108);
    ctx.lineTo(132, 108);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N2O', 128, 250);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
}

// A pressurised nitro cylinder: glowing blue body with a bolt label, chrome valve head,
// hazard-yellow collar, base ring and a holographic halo that spins around it.
export function createNitroCanister(glow) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    const label = labelTexture();
    const shell = new THREE.MeshStandardMaterial({
        color: 0x1a8cff, emissive: 0x0a5cff, emissiveIntensity: 1.35, metalness: 0.35, roughness: 0.28, map: label,
        emissiveMap: label
    });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe6f2ff, metalness: 0.95, roughness: 0.16, emissive: 0x2a6fb0, emissiveIntensity: 0.25 });
    const collar = new THREE.MeshStandardMaterial({ color: 0xffc21a, emissive: 0xff8a00, emissiveIntensity: 0.55, metalness: 0.2, roughness: 0.4 });

    const profile = [
        new THREE.Vector2(0.0, 0.0), new THREE.Vector2(0.34, 0.0), new THREE.Vector2(0.4, 0.08),
        new THREE.Vector2(0.42, 0.2), new THREE.Vector2(0.42, 1.0), new THREE.Vector2(0.38, 1.16),
        new THREE.Vector2(0.28, 1.3), new THREE.Vector2(0.2, 1.36), new THREE.Vector2(0.0, 1.38)
    ];
    const tank = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), shell);
    tank.position.y = -0.7;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.24, 14), chrome);
    neck.position.y = 0.74;
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16), chrome);
    valve.position.y = 0.9;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 20), collar);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.y = 0.97;
    const bandTop = new THREE.Mesh(new THREE.TorusGeometry(0.425, 0.04, 8, 28), collar);
    bandTop.rotation.x = Math.PI / 2;
    bandTop.position.y = 0.22;
    const bandBottom = bandTop.clone();
    bandBottom.position.y = -0.52;
    body.add(tank, neck, valve, wheel, bandTop, bandBottom);

    const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.74, 0.025, 8, 48),
        new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.rotation.x = Math.PI / 2.4;
    const halo2 = halo.clone();
    halo2.rotation.set(Math.PI / 2.4, 0, Math.PI / 2);
    halo2.scale.setScalar(0.85);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color: 0x4db8ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    sprite.scale.set(3.4, 3.4, 1);

    // Pillar of light so the canister reads from far down the road; fades out with height.
    const beamGeometry = new THREE.CylinderGeometry(0.3, 0.55, 8, 18, 8, true);
    const beamPositions = beamGeometry.attributes.position;
    const beamColors = new Float32Array(beamPositions.count * 4);
    for (let i = 0; i < beamPositions.count; i += 1) {
        const t = (beamPositions.getY(i) + 4) / 8;
        const alpha = Math.pow(1 - t, 1.6) * 0.55;
        beamColors.set([0.35, 0.72, 1.0, alpha], i * 4);
    }
    beamGeometry.setAttribute('color', new THREE.BufferAttribute(beamColors, 4));
    const beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    }));
    beam.position.y = 2.9;
    beam.renderOrder = 5;

    group.add(body, halo, halo2, sprite, beam);
    group.scale.setScalar(1.4);
    body.rotation.z = 0.14;
    group.traverse((object) => { if (object.isMesh && object.material === shell) object.castShadow = false; });
    group.userData = { body, halo, halo2, sprite, shell, label, owned: [shell, chrome, collar, halo.material, sprite.material, beam.material] };
    return group;
}

export class NitroPickups {
    constructor(scene, track, glow) {
        this.scene = scene;
        this.items = track.nitro.map((entry, index) => {
            const object = createNitroCanister(glow);
            const [x, y, z] = entry.position;
            object.position.set(x, y + 1.55, z);
            object.userData.baseY = y + 1.55;
            object.userData.phase = index * 1.7;
            scene.add(object);
            return { object, s: entry.s, position: new THREE.Vector3(x, y + 1.1, z), availableAt: -Infinity, takenBy: null };
        });
        this.geometries = [];
    }

    // True when a pickup was just collected by `who` at the given race time.
    collect(position, time, radius = 3.4) {
        for (const item of this.items) {
            if (item.availableAt > time) continue;
            const dx = position.x - item.position.x;
            const dz = position.z - item.position.z;
            const dy = position.y - item.position.y;
            if (dx * dx + dz * dz < radius * radius && Math.abs(dy) < 3.2) {
                item.availableAt = time + 14;
                item.object.visible = false;
                return item;
            }
        }
        return null;
    }

    update(dt, time) {
        for (const item of this.items) {
            if (!item.object.visible && item.availableAt <= time) item.object.visible = true;
            if (!item.object.visible) continue;
            const data = item.object.userData;
            data.body.rotation.y += dt * 1.9;
            data.halo.rotation.z += dt * 2.4;
            data.halo2.rotation.y -= dt * 2.1;
            item.object.position.y = data.baseY + Math.sin(time * 2.4 + data.phase) * 0.16;
            data.sprite.material.opacity = 0.65 + 0.25 * Math.sin(time * 4 + data.phase);
        }
    }

    dispose() {
        for (const item of this.items) {
            item.object.traverse((object) => { object.geometry?.dispose(); });
            for (const material of item.object.userData.owned) material.dispose();
            item.object.userData.label.dispose();
            item.object.removeFromParent();
        }
    }
}

// Coins are instanced from the single Blender coin mesh embedded in each track.
export class CoinField {
    constructor(scene, track, template) {
        this.scene = scene;
        this.track = track;
        this.coins = track.coins.map((coin, index) => {
            const [x, y, z] = coin.position;
            return { x, y, z, s: coin.s, kind: coin.kind, phase: index * 0.7, hidden: false, availableAt: -Infinity };
        });
        this.meshes = [];
        const count = this.coins.length;
        template.updateMatrixWorld(true);
        template.traverse((child) => {
            if (!child.isMesh) return;
            // Slight self-illumination keeps the gold readable in shade and at distance.
            const material = child.material.clone();
            material.emissive?.set(0xffa21a);
            material.emissiveIntensity = 0.42;
            const instanced = new THREE.InstancedMesh(child.geometry, material, count);
            instanced.castShadow = true;
            instanced.frustumCulled = false;
            instanced.userData.sourceMatrix = child.matrixWorld.clone();
            scene.add(instanced);
            this.meshes.push(instanced);
        });
        // The disc is exported flat; find its thin axis so it can be stood on its edge.
        const first = this.meshes[0];
        first.geometry.computeBoundingBox();
        const size = first.geometry.boundingBox.getSize(new THREE.Vector3());
        this.base = new THREE.Quaternion();
        if (size.y <= size.x && size.y <= size.z) this.base.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        else if (size.x <= size.y && size.x <= size.z) this.base.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
        this.matrix = new THREE.Matrix4();
        this.spin = new THREE.Quaternion();
        this.rotation = new THREE.Quaternion();
        this.scale = new THREE.Vector3(1, 1, 1);
        this.hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
        this.position = new THREE.Vector3();
        this.axis = new THREE.Vector3(0, 1, 0);
        // Disc is 1.04 m across; make it a clearly readable 1.9 m coin.
        this.coinScale = 1.9;
        this.update(0, 0);
    }

    // Collects every coin within reach of `position`; returns how many were taken.
    collect(position, time, radius = 3.0) {
        const taken = [];
        for (const coin of this.coins) {
            if (coin.availableAt > time) continue;
            const dx = position.x - coin.x;
            const dz = position.z - coin.z;
            const dy = position.y + 0.5 - coin.y;
            if (dx * dx + dz * dz < radius * radius && Math.abs(dy) < 2.6) {
                coin.availableAt = time + 40;
                coin.hidden = true;
                taken.push(coin);
            }
        }
        return taken;
    }

    update(dt, time) {
        for (let i = 0; i < this.coins.length; i += 1) {
            const coin = this.coins[i];
            if (coin.hidden && coin.availableAt <= time) coin.hidden = false;
            if (coin.hidden) {
                for (const mesh of this.meshes) mesh.setMatrixAt(i, this.hiddenMatrix);
                continue;
            }
            this.spin.setFromAxisAngle(this.axis, time * 2.6 + coin.phase);
            this.rotation.copy(this.spin).multiply(this.base);
            this.position.set(coin.x, coin.y + Math.sin(time * 3 + coin.phase) * 0.12, coin.z);
            this.scale.setScalar(this.coinScale);
            this.matrix.compose(this.position, this.rotation, this.scale);
            for (const mesh of this.meshes) mesh.setMatrixAt(i, this.matrix);
        }
        for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
    }

    dispose() {
        for (const mesh of this.meshes) { mesh.removeFromParent(); mesh.dispose(); }
    }
}
