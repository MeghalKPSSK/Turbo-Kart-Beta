import * as THREE from 'three';

// The soft dark patch directly under a vehicle. The sun's shadow says where the light comes
// from; this says the car is sitting on the road. Without it a vehicle looks as if it is
// floating, most of all at dusk or with shadows turned off.

let shared = null;

function resources() {
    if (shared) return shared;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext('2d');
    const fill = c.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
    fill.addColorStop(0, 'rgba(0,0,0,1)');
    fill.addColorStop(0.55, 'rgba(0,0,0,0.75)');
    fill.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = fill;
    c.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
        color: 0x000000, alphaMap: texture, transparent: true, opacity: 0.62, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false
    });
    shared = { geometry, material };
    return shared;
}

// `width` and `length` are the vehicle's footprint in metres. Add the result to the vehicle's
// root (not to a part that leans or bounces) at road level.
export function contactShadow(width, length) {
    const { geometry, material } = resources();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(width * 1.45, 1, length * 1.25);
    mesh.position.y = 0.045;
    mesh.renderOrder = 1;
    mesh.name = 'ContactShadow';
    return mesh;
}
