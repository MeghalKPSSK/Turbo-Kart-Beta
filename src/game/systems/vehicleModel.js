import * as THREE from 'three';

// Builds a renderable vehicle from a Blender GLB.
//
// The exported cars carry a non-uniform scale (1, 1, 0.93) on their root node and the
// wheel pivots are children of it. Spinning or steering a wheel under a non-uniformly
// scaled parent shears it into an egg, which is what made the wheels wobble. Here the
// body keeps the scale, while every wheel is lifted out into its own unscaled
// mount -> steer -> spin chain at the same world position.

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

function paintMaterial(source, color) {
    const material = source.clone();
    if ((material.name || '').toLowerCase().includes('vehiclepaint')) {
        material.color.copy(color);
        material.roughness = 0.31;
        material.metalness = 0.16;
        if ('clearcoat' in material) {
            material.clearcoat = 0.34;
            material.clearcoatRoughness = 0.24;
        }
        if (material.emissive) material.emissive.set(0x000000);
    }
    return material;
}

export function createVehicleVisual(sourceScene, { paint = 0xe83e2d, spec = null, castShadow = true } = {}) {
    const color = new THREE.Color(paint);
    const clone = sourceScene.clone(true);
    clone.updateMatrixWorld(true);
    const modelRoot = clone.children.length === 1 ? clone.children[0] : clone;
    const rootScale = modelRoot.scale.clone();

    const materials = [];
    modelRoot.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = castShadow;
        child.receiveShadow = true;
        child.material = Array.isArray(child.material)
            ? child.material.map((m) => paintMaterial(m, color))
            : paintMaterial(child.material, color);
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((m) => materials.push(m));
    });

    const pivots = [];
    modelRoot.traverse((child) => {
        if (child.name.startsWith('WheelPivot_')) pivots.push(child);
    });

    // Everything that is not a wheel stays together under the (scaled) body group.
    const bodyGroup = new THREE.Group();
    bodyGroup.name = 'VehicleBody';
    bodyGroup.scale.copy(rootScale);
    for (const child of [...modelRoot.children]) {
        if (!pivots.includes(child)) bodyGroup.add(child);
    }
    // Wheel pivots nested deeper than the root (not expected) are detached the same way.
    for (const pivot of pivots) if (pivot.parent && pivot.parent !== modelRoot) pivot.parent.remove(pivot);

    const root = new THREE.Group();
    root.name = 'VehicleVisual';
    const lean = new THREE.Group();
    lean.name = 'VehicleLean';
    root.add(lean);
    lean.add(bodyGroup);

    const wheels = [];
    for (const pivot of pivots) {
        const position = pivot.position.clone().multiply(rootScale);
        const isFront = pivot.name.includes('Front');
        const mount = new THREE.Group();
        mount.position.copy(position);
        const steer = new THREE.Group();
        const spin = pivot;
        spin.position.set(0, 0, 0);
        spin.scale.set(1, 1, 1);
        spin.rotation.set(0, 0, 0);
        spin.quaternion.identity();
        mount.add(steer);
        steer.add(spin);
        lean.add(mount);
        _box.setFromObject(spin);
        _box.getSize(_size);
        const radius = Math.max(_size.y, _size.z) / 2 || 0.5;
        wheels.push({ mount, steer, spin, isFront, side: Math.sign(position.x), baseY: position.y, baseX: position.x, radius });
    }
    const isBike = wheels.every((w) => Math.abs(w.baseX) < 0.01);

    // Physics wheels -> visual wheels: cars map one to one by corner, bikes average the pair.
    if (spec) {
        for (const wheel of wheels) {
            const matches = spec.wheels
                .map((w, index) => ({ w, index }))
                .filter(({ w }) => w.front === wheel.isFront && (isBike || Math.sign(w.x) === wheel.side));
            wheel.physics = matches.map((m) => m.index);
        }
    }

    const dispose = () => materials.forEach((m) => m.dispose());
    return { root, lean, bodyGroup, wheels, isBike, materials, dispose };
}


// Applies the live physics state to the visual: wheel spin, steering, suspension travel,
// body roll/pitch (cars) and lean (bikes).
export function updateVehicleVisual(visual, vehicle, dt) {
    const spec = vehicle.spec;
    const sus = spec.suspension;
    for (const wheel of visual.wheels) {
        const list = wheel.physics || [];
        let spin = 0;
        let springLength = 0;
        let count = 0;
        for (const index of list) {
            const w = vehicle.wheels[index];
            spin += w.spin;
            springLength += w.springLength;
            count += 1;
        }
        if (!count) continue;
        spin /= count;
        springLength /= count;
        // Wheel centre relative to the chassis: a shorter spring lifts the wheel into the body.
        wheel.mount.position.y = wheel.baseY + (sus.springLengthAtRest - springLength);
        wheel.steer.rotation.y = wheel.isFront ? vehicle.steerAngle : 0;
        wheel.spin.rotation.x = spin;
    }
    const g = spec.gravity;
    if (visual.isBike) {
        const target = THREE.MathUtils.clamp(Math.atan2(vehicle.lateralAccel, g) * 0.95, -0.62, 0.62);
        visual.lean.rotation.z += (-target - visual.lean.rotation.z) * Math.min(1, dt * 8);
        visual.lean.rotation.x += (THREE.MathUtils.clamp(-vehicle.longAccel * 0.004, -0.06, 0.06) - visual.lean.rotation.x) * Math.min(1, dt * 6);
    } else {
        const roll = THREE.MathUtils.clamp(-vehicle.lateralAccel * 0.0036, -0.08, 0.08);
        const pitch = THREE.MathUtils.clamp(vehicle.longAccel * 0.0028, -0.06, 0.06);
        visual.lean.rotation.z += (roll - visual.lean.rotation.z) * Math.min(1, dt * 7);
        visual.lean.rotation.x += (pitch - visual.lean.rotation.x) * Math.min(1, dt * 7);
    }
}
