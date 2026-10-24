import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createVehicleVisual } from '../game/systems/vehicleModel';

const loader = new GLTFLoader();
const baseUrl = `${import.meta.env.BASE_URL || '/'}models/blender/`;

export default function RoadVehiclePreview({ vehicle, paint, className = '' }) {
    const hostRef = useRef(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host || !vehicle) return undefined;
        let active = true;
        let model = null;
        let animationFrame = 0;
        let visual = null;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.98;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const room = new RoomEnvironment();
        const environmentGenerator = new THREE.PMREMGenerator(renderer);
        const environment = environmentGenerator.fromScene(room, 0.04).texture;
        room.dispose();
        environmentGenerator.dispose();
        scene.environment = environment;
        scene.environmentIntensity = 0.22;
        const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
        camera.position.set(5.2, vehicle.type === 'BIKE' ? 3.4 : 3.1, 5.9);
        camera.lookAt(0, 0.9, 0);
        scene.add(new THREE.HemisphereLight(0xe2f0ff, 0x18222c, 1.55));
        const key = new THREE.DirectionalLight(0xffead7, 2.5);
        key.position.set(-4, 9, 6);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.radius = 5;
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far = 28;
        key.shadow.camera.left = -7;
        key.shadow.camera.right = 7;
        key.shadow.camera.top = 7;
        key.shadow.camera.bottom = -7;
        key.shadow.bias = -0.00025;
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x74b8ff, 1.25);
        rim.position.set(6, 5, -5);
        scene.add(rim);
        const shadowFloor = new THREE.Mesh(
            new THREE.PlaneGeometry(1000, 1000),
            new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.28 })
        );
        shadowFloor.rotation.x = -Math.PI / 2;
        shadowFloor.position.y = -0.025;
        shadowFloor.receiveShadow = true;
        scene.add(shadowFloor);

        const resize = () => {
            const width = Math.max(1, host.clientWidth);
            const height = Math.max(1, host.clientHeight);
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();

        loader.loadAsync(`${baseUrl}${vehicle.model}`).then((gltf) => {
            if (!active) return;
            // Same builder as the race: wheels sit outside the scaled body so they stay round.
            visual = createVehicleVisual(gltf.scene, { paint });
            model = visual.root;
            // Blender exports already point down the game's +Z race direction.
            model.rotation.y = 0.18;
            model.scale.setScalar(vehicle.type === 'CAR' ? 1.05 : 1.18);
            const bounds = new THREE.Box3().setFromObject(model);
            const center = bounds.getCenter(new THREE.Vector3());
            const size = bounds.getSize(new THREE.Vector3());
            model.position.set(-center.x, -bounds.min.y, -center.z);
            const focusHeight = Math.max(0.75, size.y * 0.42);
            const span = Math.max(size.x, size.z, 2.2);
            const distance = span * 1.16;
            // Show the full silhouette from a front three-quarter angle so
            // the rider, wheelbase and vehicle proportions read at a glance.
            camera.position.set(distance * 1.02, Math.max(1.65, size.y * 0.76), distance * 0.76);
            camera.lookAt(0, focusHeight, 0);
            scene.add(model);
        }).catch((error) => {
            console.error(`Vehicle preview failed for ${vehicle.name}.`, error);
        });

        let previous = performance.now();
        const render = (now) => {
            if (!active) return;
            const delta = Math.min(0.05, (now - previous) / 1000);
            previous = now;
            if (model) {
                model.rotation.y += delta * 0.18;
                if (visual) for (const wheel of visual.wheels) wheel.spin.rotation.x += delta * 2.0 / wheel.radius;
            }
            renderer.render(scene, camera);
            animationFrame = requestAnimationFrame(render);
        };
        animationFrame = requestAnimationFrame(render);

        return () => {
            active = false;
            cancelAnimationFrame(animationFrame);
            observer.disconnect();
            visual?.dispose();
            shadowFloor.geometry.dispose();
            shadowFloor.material.dispose();
            renderer.dispose();
            environment.dispose();
            renderer.forceContextLoss();
            renderer.domElement.remove();
        };
    }, [vehicle, paint]);

    return <div ref={hostRef} className={`road-vehicle-preview ${className}`} aria-label={`3D vehicle preview: ${vehicle?.name || 'vehicle'}`} />;
}
