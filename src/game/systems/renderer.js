// ========================================
// TURBO KART RACING - Renderer
// ========================================

import * as THREE from 'three';

export class GameRenderer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        this.cameras = [];
        this.viewports = [];
        this.playerCount = 1;
        
        this.track = null;
        this.vehicles = [];
        this.items = [];
        this.effects = [];
        
        this.skybox = null;
        this.lights = {};
        
        this.quality = 'high';
        this.shadows = true;
        
        this.clock = new THREE.Clock();
    }
    
    init(container, options = {}) {
        this.container = container;
        this.playerCount = options.playerCount || 1;
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: this.quality !== 'low',
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = this.shadows;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1;
        
        if (this.container) {
            this.container.appendChild(this.renderer.domElement);
        }
        
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        
        // Setup cameras
        this.setupCameras();
        
        // Setup lighting
        this.setupLighting();
        
        // Handle resize
        window.addEventListener('resize', () => this.onResize());
        
        return this;
    }
    
    setupCameras() {
        this.cameras = [];
        this.viewports = [];
        
        const aspect = window.innerWidth / window.innerHeight;
        
        for (let i = 0; i < this.playerCount; i++) {
            const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
            camera.position.set(0, 5, -10);
            
            this.cameras.push({
                camera: camera,
                target: null,
                offset: new THREE.Vector3(0, 5, -12),
                lookOffset: new THREE.Vector3(0, 1, 5),
                shakeAmount: 0,
                mode: 'chase',
                initialized: false
            });
        }
        
        this.updateViewports();
    }
    
    updateViewports() {
        this.viewports = [];
        
        const w = window.innerWidth;
        const h = window.innerHeight;
        
        switch (this.playerCount) {
            case 1:
                this.viewports.push({ x: 0, y: 0, width: w, height: h });
                break;
            case 2:
                this.viewports.push({ x: 0, y: h / 2, width: w, height: h / 2 });
                this.viewports.push({ x: 0, y: 0, width: w, height: h / 2 });
                break;
            case 3:
                this.viewports.push({ x: 0, y: h / 2, width: w / 2, height: h / 2 });
                this.viewports.push({ x: w / 2, y: h / 2, width: w / 2, height: h / 2 });
                this.viewports.push({ x: w / 4, y: 0, width: w / 2, height: h / 2 });
                break;
            case 4:
                this.viewports.push({ x: 0, y: h / 2, width: w / 2, height: h / 2 });
                this.viewports.push({ x: w / 2, y: h / 2, width: w / 2, height: h / 2 });
                this.viewports.push({ x: 0, y: 0, width: w / 2, height: h / 2 });
                this.viewports.push({ x: w / 2, y: 0, width: w / 2, height: h / 2 });
                break;
        }
        
        // Update camera aspects
        this.cameras.forEach((cam, i) => {
            if (this.viewports[i]) {
                const vp = this.viewports[i];
                cam.camera.aspect = vp.width / vp.height;
                cam.camera.updateProjectionMatrix();
            }
        });
    }
    
    setupLighting() {
        // Ambient light
        this.lights.ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(this.lights.ambient);
        
        // Main directional light (sun)
        this.lights.sun = new THREE.DirectionalLight(0xffffff, 0.8);
        this.lights.sun.position.set(100, 100, 50);
        this.lights.sun.castShadow = this.shadows;
        
        if (this.shadows) {
            this.lights.sun.shadow.mapSize.width = 2048;
            this.lights.sun.shadow.mapSize.height = 2048;
            this.lights.sun.shadow.camera.near = 10;
            this.lights.sun.shadow.camera.far = 400;
            this.lights.sun.shadow.camera.left = -100;
            this.lights.sun.shadow.camera.right = 100;
            this.lights.sun.shadow.camera.top = 100;
            this.lights.sun.shadow.camera.bottom = -100;
            this.lights.sun.shadow.bias = -0.001;
        }
        
        this.scene.add(this.lights.sun);
        
        // Hemisphere light
        this.lights.hemisphere = new THREE.HemisphereLight(0x87ceeb, 0x444422, 0.3);
        this.scene.add(this.lights.hemisphere);
    }
    
    setTrackLighting(trackData) {
        if (!trackData) return;
        
        switch (trackData.theme) {
            case 'sunset':
                this.lights.sun.color.setHex(0xff8844);
                this.lights.ambient.color.setHex(0xffaa66);
                this.lights.sun.intensity = 0.6;
                break;
            case 'night':
                this.lights.sun.intensity = 0.1;
                this.lights.ambient.intensity = 0.2;
                this.lights.ambient.color.setHex(0x4444aa);
                break;
            case 'underwater':
                this.lights.ambient.color.setHex(0x4488aa);
                this.lights.sun.color.setHex(0x88ccff);
                break;
            case 'space':
                this.lights.ambient.intensity = 0.3;
                this.lights.sun.intensity = 0.5;
                break;
            default:
                this.lights.sun.color.setHex(0xffffff);
                this.lights.ambient.color.setHex(0xffffff);
                this.lights.sun.intensity = 0.8;
                this.lights.ambient.intensity = 0.4;
        }
    }
    
    createSkybox(trackData) {
        if (this.skybox) {
            this.scene.remove(this.skybox);
        }
        
        const skyColor = trackData?.skyColor || 0x87ceeb;
        const groundColor = trackData?.groundColor || 0x8b7355;
        
        const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(skyColor) },
                bottomColor: { value: new THREE.Color(groundColor) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide
        });
        
        this.skybox = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(this.skybox);
        
        if (trackData?.theme !== 'underwater' && trackData?.theme !== 'space') {
            this.addClouds();
        }
        
        if (trackData?.theme === 'night' || trackData?.theme === 'space') {
            this.addStars();
        }
    }
    
    addClouds() {
        const cloudGroup = new THREE.Group();
        cloudGroup.name = 'clouds';
        
        for (let i = 0; i < 20; i++) {
            const cloudGeometry = new THREE.SphereGeometry(Math.random() * 10 + 5, 8, 8);
            const cloudMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.8
            });
            
            const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
            cloud.position.set(
                (Math.random() - 0.5) * 400,
                50 + Math.random() * 30,
                (Math.random() - 0.5) * 400
            );
            cloud.scale.set(1 + Math.random(), 0.5, 1 + Math.random());
            
            cloudGroup.add(cloud);
        }
        
        this.scene.add(cloudGroup);
    }
    
    addStars() {
        const starGeometry = new THREE.BufferGeometry();
        const positions = [];
        
        for (let i = 0; i < 5000; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const r = 400;
            
            positions.push(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.cos(phi),
                r * Math.sin(phi) * Math.sin(theta)
            );
        }
        
        starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        
        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 1,
            sizeAttenuation: false
        });
        
        const stars = new THREE.Points(starGeometry, starMaterial);
        stars.name = 'stars';
        this.scene.add(stars);
    }
    
    updateCamera(cameraIndex, targetVehicle, deltaTime) {
        const camData = this.cameras[cameraIndex];
        if (!camData || !targetVehicle) return;
        
        const camera = camData.camera;
        
        switch (camData.mode) {
            case 'chase':
                this.updateChaseCamera(camera, camData, targetVehicle, deltaTime);
                break;
            case 'fixed':
                camera.lookAt(targetVehicle.position);
                break;
            case 'cinematic':
                this.updateCinematicCamera(camera, camData, targetVehicle, deltaTime);
                break;
        }
        
        // Apply camera shake
        if (camData.shakeAmount > 0) {
            camera.position.x += (Math.random() - 0.5) * camData.shakeAmount;
            camera.position.y += (Math.random() - 0.5) * camData.shakeAmount;
            camera.position.z += (Math.random() - 0.5) * camData.shakeAmount;
            camData.shakeAmount *= 0.9;
        }
    }
    
    updateChaseCamera(camera, camData, target, deltaTime) {
        if (!target.position || !target.quaternion) {
            console.warn('Invalid camera target - missing position or quaternion');
            return;
        }
        
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(target.quaternion);
        
        const offset = camData.offset.clone();
        const rotatedOffset = offset.clone();
        rotatedOffset.applyQuaternion(target.quaternion);
        
        const idealPosition = target.position.clone().add(rotatedOffset);
        
        const distanceToIdeal = camera.position.distanceTo(idealPosition);
        if (distanceToIdeal > 50 || !camData.initialized) {
            camera.position.copy(idealPosition);
            camData.initialized = true;
        } else {
            const smoothing = Math.min(8 * deltaTime, 1);
            camera.position.lerp(idealPosition, smoothing);
        }
        
        const lookOffset = camData.lookOffset.clone();
        lookOffset.applyQuaternion(target.quaternion);
        const lookTarget = target.position.clone().add(lookOffset);
        camera.lookAt(lookTarget);
    }
    
    updateCinematicCamera(camera, camData, target, _deltaTime) {
        const time = Date.now() * 0.001;
        const radius = 15;
        
        camera.position.x = target.position.x + Math.cos(time * 0.5) * radius;
        camera.position.y = target.position.y + 8;
        camera.position.z = target.position.z + Math.sin(time * 0.5) * radius;
        
        camera.lookAt(target.position);
    }
    
    shakeCamera(cameraIndex, amount) {
        if (this.cameras[cameraIndex]) {
            this.cameras[cameraIndex].shakeAmount = Math.max(
                this.cameras[cameraIndex].shakeAmount,
                amount
            );
        }
    }
    
    updateEffects(deltaTime) {
        this.effects = this.effects.filter(effect => {
            effect.update(deltaTime);
            return effect.active;
        });
    }
    
    render() {
        if (!this.renderer || !this.scene) return;
        
        this.cameras.forEach((camData, i) => {
            if (this.viewports[i]) {
                const vp = this.viewports[i];
                this.renderer.setViewport(vp.x, vp.y, vp.width, vp.height);
                this.renderer.setScissor(vp.x, vp.y, vp.width, vp.height);
                this.renderer.setScissorTest(true);
                this.renderer.render(this.scene, camData.camera);
            }
        });
    }
    
    onResize() {
        if (!this.renderer) return;
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.updateViewports();
    }
    
    clear() {
        // Remove all objects except lights
        const objectsToRemove = [];
        this.scene.traverse((obj) => {
            if (obj.type === 'Mesh' || obj.type === 'Group' || obj.type === 'Points') {
                if (obj.name !== 'clouds' && obj.name !== 'stars') {
                    objectsToRemove.push(obj);
                }
            }
        });
        
        objectsToRemove.forEach(obj => {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
    }
    
    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
        }
        this.clear();
    }
}

export default GameRenderer;
