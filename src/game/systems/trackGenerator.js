// ========================================
// TURBO KART RACING - Track Generator
// ========================================

import * as THREE from 'three';

export class TrackGenerator {
    constructor(scene) {
        this.scene = scene;
        this.obstacles = [];
    }
    
    generate(trackData) {
        this.obstacles = [];
        const track = {
            mesh: null,
            path: null,
            startPositions: [],
            itemBoxes: [],
            coins: [],
            hazards: [],
            checkpoints: [],
            rails: [],
            width: 28,
            obstacles: [],
            checkpointCount: 10 // Number of checkpoints around track
        };
        
        // Generate track path
        track.path = this.createTrackPath(trackData);
        this.lastGeneratedPath = track.path; // Store for tree placement
        
        // Generate track mesh
        track.mesh = this.createTrackMesh(track.path, trackData);
        this.scene.add(track.mesh);
        
        // Add track borders for visibility
        track.rails = this.createTrackBorders(track.path, 28);
        
        // Generate start positions
        track.startPositions = this.createStartPositions(track.path, 12);
        
        // Generate checkpoints spanning full track width
        track.checkpoints = this.createCheckpoints(track.path, track.width, track.checkpointCount);
        
        // Items disabled
        track.itemBoxes = [];
        
        // Generate coins
        track.coins = this.createCoins(track.path, trackData);
        
        // Create ground plane
        this.createGround(trackData);
        
        // Create decorations based on theme
        this.createDecorations(trackData);
        track.obstacles = this.obstacles;
        
        return track;
    }
    
    /**
     * Create checkpoint trigger volumes spanning the full track width
     * Checkpoints are evenly distributed around the track
     */
    createCheckpoints(path, trackWidth, count = 10) {
        const checkpoints = [];
        
        for (let i = 0; i < count; i++) {
            // Evenly space checkpoints around track (0/10 = finish line)
            const t = i / count;
            const point = path.getPointAt(t);
            const tangent = path.getTangentAt(t);
            
            // Calculate perpendicular direction (track normal)
            tangent.y = 0;
            tangent.normalize();
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
            
            // Calculate left and right edges of checkpoint volume
            const halfWidth = (trackWidth / 2) + 2; // Slightly wider than track to ensure detection
            const leftEdge = point.clone().add(normal.clone().multiplyScalar(-halfWidth));
            const rightEdge = point.clone().add(normal.clone().multiplyScalar(halfWidth));
            
            checkpoints.push({
                index: i,
                t: t,
                center: point.clone(),
                leftEdge: leftEdge,
                rightEdge: rightEdge,
                tangent: tangent.clone(),
                normal: normal.clone(),
                width: trackWidth + 4,
                depth: 3 // Trigger volume depth along track direction
            });
        }
        
        console.log(`Created ${checkpoints.length} checkpoints`);
        return checkpoints;
    }
    
    createTrackPath(trackData) {
        const length = trackData.length === 'short' ? 400 : 
                       trackData.length === 'medium' ? 600 : 
                       trackData.length === 'long' ? 800 : 1000;
        
        const points = [];
        const segments = 50;
        
        // Create an oval/circuit-like track
        for (let i = 0; i < segments; i++) {
            const t = i / segments;
            const angle = t * Math.PI * 2;
            
            // Base oval shape
            const radiusX = length / 4;
            const radiusZ = length / 6;
            
            // Add some variation
            const variation = Math.sin(angle * 3) * 20 + Math.cos(angle * 5) * 10;
            
            const x = Math.cos(angle) * (radiusX + variation);
            const z = Math.sin(angle) * (radiusZ + variation * 0.5);
            const y = 0;
            
            points.push(new THREE.Vector3(x, y, z));
        }
        
        // Create smooth curve
        const curve = new THREE.CatmullRomCurve3(points, true);
        return curve;
    }
    
    createTrackMesh(path, trackData) {
        const trackWidth = 28;
        const trackPoints = path.getPoints(200);
        
        // Create vertices for the track surface
        const vertices = [];
        const indices = [];
        const uvs = [];
        
        for (let i = 0; i < trackPoints.length; i++) {
            const point = trackPoints[i];
            const nextPoint = trackPoints[(i + 1) % trackPoints.length];
            
            // Calculate direction and perpendicular
            const direction = new THREE.Vector3().subVectors(nextPoint, point).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const right = new THREE.Vector3().crossVectors(direction, up).normalize();
            
            // Left and right edge of track
            const halfWidth = trackWidth / 2;
            const leftPoint = point.clone().add(right.clone().multiplyScalar(-halfWidth));
            const rightPoint = point.clone().add(right.clone().multiplyScalar(halfWidth));
            
            // Ensure track is above ground
            leftPoint.y = Math.max(0.2, leftPoint.y);
            rightPoint.y = Math.max(0.2, rightPoint.y);
            
            // Add vertices (left, right)
            vertices.push(leftPoint.x, leftPoint.y, leftPoint.z);
            vertices.push(rightPoint.x, rightPoint.y, rightPoint.z);
            
            // UVs for texturing
            const t = i / trackPoints.length;
            uvs.push(0, t * 10);
            uvs.push(1, t * 10);
        }
        
        // Create faces (triangles)
        for (let i = 0; i < trackPoints.length - 1; i++) {
            const bl = i * 2;
            const br = i * 2 + 1;
            const tl = (i + 1) * 2;
            const tr = (i + 1) * 2 + 1;
            
            // Two triangles per segment
            indices.push(bl, tl, br);
            indices.push(br, tl, tr);
        }
        
        // Close the loop
        const lastIdx = (trackPoints.length - 1) * 2;
        indices.push(lastIdx, 0, lastIdx + 1);
        indices.push(lastIdx + 1, 0, 1);
        
        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        // Track material - dark gray asphalt with slight emissive for visibility
        const trackColor = this.getTrackColor(trackData.theme);
        const material = new THREE.MeshStandardMaterial({
            color: trackColor,
            roughness: 0.8,
            metalness: 0.1,
            emissive: trackColor,
            emissiveIntensity: 0.15,
            side: THREE.DoubleSide
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.position.y = 0.05; // Ensure it's above ground
        
        // Add track markings
        this.addTrackMarkings(mesh, path, trackData);
        
        return mesh;
    }
    
    getTrackColor(theme) {
        const colors = {
            grass: 0x555555,
            farm: 0x666655,
            canyon: 0x886644,
            industrial: 0x444444,
            classic: 0x555555,
            mall: 0x777777,
            snow: 0x888899,
            mine: 0x554433,
            coastal: 0x556666,
            tropical: 0x557755,
            forest: 0x556644,
            volcano: 0x443333,
            desert: 0x998866,
            highway: 0x333333,
            castle: 0x444455,
            space: 0x333355,
            beach: 0x998877,
            jungle: 0x445544,
            haunted: 0x333344,
            ice: 0x667788
        };
        
        return colors[theme] || 0x555555;
    }
    
    addTrackMarkings(trackMesh, path, _trackData) {
        // Start/finish line - same width as track
        const trackWidth = 28;
        const startLineGeo = new THREE.PlaneGeometry(trackWidth, 2);
        const startLineMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide
        });
        
        const startLine = new THREE.Mesh(startLineGeo, startLineMat);
        const startPoint = path.getPointAt(0);
        const startTangent = path.getTangentAt(0);
        
        startLine.position.copy(startPoint);
        startLine.position.y = 0.25;
        startLine.rotation.x = -Math.PI / 2;
        startLine.rotation.z = Math.atan2(startTangent.x, startTangent.z);
        
        trackMesh.add(startLine);
        
        // Checkered pattern - scale to match track width
        const checkerCols = 14; // More columns for wider track
        const checkerWidth = trackWidth / checkerCols;
        for (let i = 0; i < checkerCols; i++) {
            for (let j = 0; j < 2; j++) {
                const checkerGeo = new THREE.PlaneGeometry(checkerWidth * 0.95, 0.9);
                const checkerMat = new THREE.MeshBasicMaterial({
                    color: (i + j) % 2 === 0 ? 0x000000 : 0xffffff,
                    side: THREE.DoubleSide
                });
                const checker = new THREE.Mesh(checkerGeo, checkerMat);
                checker.position.set((i - (checkerCols - 1) / 2) * checkerWidth, 0.01, (j - 0.5) * 0.95);
                startLine.add(checker);
            }
        }
    }
    
    createTrackBorders(path, trackWidth) {
        const points = path.getPoints(200); // More points for smoother rails
        const borderHeight = 0.9;
        const borderWidth = 0.6;
        const railHeight = 1.8; // Taller rails
        const railWidth = 0.5;  // Thicker rails
        const rails = [];
        // NO GAP - complete rail around entire track
        
        const leftBorderMaterial = new THREE.MeshStandardMaterial({
            color: 0xff4444,
            emissive: 0x661111,
            emissiveIntensity: 0.4
        });
        
        const rightBorderMaterial = new THREE.MeshStandardMaterial({
            color: 0x4444ff,
            emissive: 0x111166,
            emissiveIntensity: 0.4
        });
        
        // Add barrier posts at regular intervals (purely visual)
        for (let i = 0; i < points.length; i += 10) {
            const point = points[i];
            const nextPoint = points[(i + 1) % points.length];
            
            const direction = new THREE.Vector3().subVectors(nextPoint, point).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const right = new THREE.Vector3().crossVectors(direction, up).normalize();
            
            const isEven = Math.floor(i / 10) % 2 === 0;
            const borderGeometry = new THREE.BoxGeometry(borderWidth, borderHeight, 2);
            
            // Left border post
            const leftBorder = new THREE.Mesh(borderGeometry, isEven ? leftBorderMaterial : rightBorderMaterial);
            const leftPos = point.clone().add(right.clone().multiplyScalar(-trackWidth / 2 - borderWidth / 2));
            leftPos.y = borderHeight / 2 + 0.1;
            leftBorder.position.copy(leftPos);
            leftBorder.lookAt(leftPos.clone().add(direction));
            leftBorder.castShadow = true;
            this.scene.add(leftBorder);
            
            // Right border post
            const rightBorder = new THREE.Mesh(borderGeometry, isEven ? rightBorderMaterial : leftBorderMaterial);
            const rightPos = point.clone().add(right.clone().multiplyScalar(trackWidth / 2 + borderWidth / 2));
            rightPos.y = borderHeight / 2 + 0.1;
            rightBorder.position.copy(rightPos);
            rightBorder.lookAt(rightPos.clone().add(direction));
            rightBorder.castShadow = true;
            this.scene.add(rightBorder);
        }

        // COMPLETE continuous rails - NO GAPS
        const railRadius = railWidth * 0.5;
        const railSegments = 300;
        
        const buildCompleteRail = (offset) => {
            const offsetPoints = [];
            // Use exactly points.length iterations - the CatmullRomCurve3 with closed=true will handle closing
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                const nextPoint = points[(i + 1) % points.length];
                const prevPoint = points[(i - 1 + points.length) % points.length];
                
                // Use average of prev->current and current->next for smoother direction
                const dir1 = new THREE.Vector3().subVectors(p, prevPoint);
                const dir2 = new THREE.Vector3().subVectors(nextPoint, p);
                const direction = dir1.add(dir2).normalize();
                
                const up = new THREE.Vector3(0, 1, 0);
                const right = new THREE.Vector3().crossVectors(direction, up).normalize();
                const offsetPoint = p.clone().add(right.clone().multiplyScalar(offset));
                offsetPoint.y = railHeight * 0.5 + 0.2;
                offsetPoints.push(offsetPoint);
            }
            return offsetPoints;
        };

        const leftOffset = -trackWidth / 2 - railWidth * 0.7;
        const rightOffset = trackWidth / 2 + railWidth * 0.7;

        // Build complete left rail (closed loop)
        const leftPoints = buildCompleteRail(leftOffset);
        if (leftPoints.length > 3) {
            const leftCurve = new THREE.CatmullRomCurve3(leftPoints, true); // closed = true
            const leftRailGeo = new THREE.TubeGeometry(leftCurve, railSegments, railRadius, 8, true);
            const leftRailMesh = new THREE.Mesh(leftRailGeo, leftBorderMaterial);
            leftRailMesh.castShadow = true;
            leftRailMesh.userData = { type: 'rail' };
            this.scene.add(leftRailMesh);
            rails.push(leftRailMesh);
        }

        // Build complete right rail (closed loop)
        const rightPoints = buildCompleteRail(rightOffset);
        if (rightPoints.length > 3) {
            const rightCurve = new THREE.CatmullRomCurve3(rightPoints, true); // closed = true
            const rightRailGeo = new THREE.TubeGeometry(rightCurve, railSegments, railRadius, 8, true);
            const rightRailMesh = new THREE.Mesh(rightRailGeo, rightBorderMaterial);
            rightRailMesh.castShadow = true;
            rightRailMesh.userData = { type: 'rail' };
            this.scene.add(rightRailMesh);
            rails.push(rightRailMesh);
        }

        return rails;
    }
    
    createStartPositions(path, count) {
        const positions = [];
        const trackWidth = 12;
        
        console.log('Creating start positions for', count, 'racers');
        
        for (let i = 0; i < count; i++) {
            const row = Math.floor(i / 2);
            const col = i % 2;
            
            // Get point on track path (slightly behind start line)
            const t = 0.99 - row * 0.015;
            const point = path.getPointAt(t);
            const tangent = path.getTangentAt(t);
            
            if (!point || !tangent) {
                console.error('Invalid start position at t=', t, 'point=', point, 'tangent=', tangent);
                continue;
            }
            
            // Calculate perpendicular
            const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            
            // Offset left/right
            const offset = (col === 0 ? -1 : 1) * trackWidth * 0.25;
            
            const startPos = {
                position: new THREE.Vector3(
                    point.x + perp.x * offset,
                    0.5,
                    point.z + perp.z * offset
                ),
                rotation: Math.atan2(tangent.x, tangent.z)
            };
            
            console.log('Start position', i, ':', startPos.position.x.toFixed(1), startPos.position.z.toFixed(1), 'rot:', startPos.rotation.toFixed(2));
            positions.push(startPos);
        }
        
        return positions;
    }
    
    createItemBoxes(path, _trackData) {
        const itemBoxes = [];
        const boxGeometry = new THREE.BoxGeometry(2, 2, 2);
        const boxMaterial = new THREE.MeshStandardMaterial({
            color: 0xff8800,
            emissive: 0xff4400,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.8
        });
        
        // Place item boxes along track
        const boxPositions = [0.2, 0.4, 0.6, 0.8];
        
        boxPositions.forEach(t => {
            const point = path.getPointAt(t);
            const tangent = path.getTangentAt(t);
            const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            
            // Create row of item boxes
            for (let i = -2; i <= 2; i++) {
                const box = new THREE.Mesh(boxGeometry, boxMaterial);
                box.position.copy(point);
                box.position.x += perp.x * i * 3;
                box.position.z += perp.z * i * 3;
                box.position.y = 2;
                
                box.userData = { type: 'itemBox', active: true };
                this.scene.add(box);
                
                itemBoxes.push({
                    mesh: box,
                    position: box.position.clone(),
                    active: true,
                    respawnTime: 5
                });
            }
        });
        
        return itemBoxes;
    }
    
    createCoins(path, _trackData) {
        const coins = [];
        const coinGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16);
        const coinMaterial = new THREE.MeshStandardMaterial({
            color: 0xffd700,
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0xffaa00,
            emissiveIntensity: 0.2
        });
        
        // Place coins along track
        for (let i = 0; i < 50; i++) {
            const t = (i / 50 + Math.random() * 0.02) % 1;
            const point = path.getPointAt(t);
            const tangent = path.getTangentAt(t);
            const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            
            const offset = (Math.random() - 0.5) * 8;
            
            const coin = new THREE.Mesh(coinGeometry, coinMaterial);
            coin.position.copy(point);
            coin.position.x += perp.x * offset;
            coin.position.z += perp.z * offset;
            coin.position.y = 1;
            coin.rotation.x = Math.PI / 2;
            
            coin.userData = { type: 'coin', active: true };
            this.scene.add(coin);
            
            coins.push({
                mesh: coin,
                position: coin.position.clone(),
                active: true
            });
        }
        
        return coins;
    }
    
    createGround(trackData) {
        const groundColor = this.getGroundColor(trackData.theme);
        const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: groundColor,
            roughness: 1
        });
        
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.1;
        ground.receiveShadow = true;
        
        this.scene.add(ground);
    }
    
    getGroundColor(theme) {
        const colors = {
            grass: 0x3a7d3a,
            farm: 0x4a7d4a,
            canyon: 0xaa7755,
            industrial: 0x555555,
            classic: 0x3a7d3a,
            mall: 0x666666,
            snow: 0xddddee,
            mine: 0x443322,
            coastal: 0x6688aa,
            tropical: 0x448844,
            forest: 0x335522,
            volcano: 0x332222,
            desert: 0xddbb88,
            highway: 0x333333,
            castle: 0x444444,
            space: 0x111133,
            beach: 0xeeddaa,
            jungle: 0x225522,
            haunted: 0x222233,
            ice: 0xaabbdd
        };
        
        return colors[theme] || 0x3a7d3a;
    }
    
    createDecorations(trackData) {
        // Add theme-specific decorations
        switch (trackData.theme) {
            case 'grass':
            case 'farm':
            case 'classic':
                this.addTrees();
                break;
            case 'snow':
            case 'ice':
                this.addSnowTrees();
                break;
            case 'desert':
                this.addCacti();
                break;
            case 'forest':
            case 'jungle':
                this.addDenseTrees();
                break;
        }
    }
    
    addTrees() {
        const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.7, 4, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const leavesGeometry = new THREE.SphereGeometry(2, 8, 8);
        const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
        const trackWidth = 18;
        // STRICT minimum distance - tree center must be at least this far from track center
        const minDistanceFromTrackCenter = trackWidth * 0.5 + 25; // 9 + 25 = 34 units minimum
        
        if (!this.lastGeneratedPath) return; // Safety check
        
        // Pre-calculate track points for distance checking
        const trackCheckPoints = this.lastGeneratedPath.getPoints(100);
        
        // Helper: check if position is safe (far from ALL track points)
        const isSafePosition = (pos) => {
            for (const pt of trackCheckPoints) {
                const dx = pos.x - pt.x;
                const dz = pos.z - pt.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < minDistanceFromTrackCenter) {
                    return false;
                }
            }
            return true;
        };
        
        // Place trees along the outside of the track
        for (let i = 0; i < 60; i++) {
            const t = i / 60; // Position along track (0-1)
            const trackPoint = this.lastGeneratedPath.getPointAt(t);
            const tangent = this.lastGeneratedPath.getTangentAt(t);
            
            // Calculate perpendicular (left/right of track)
            const perpendicular = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            
            // Place trees on both sides of track, VERY far outside racing area
            const side = i % 2 === 0 ? 1 : -1;
            const distanceFromTrack = 50 + Math.random() * 60; // 50-110 units from track center
            
            const treePosition = trackPoint.clone().add(
                perpendicular.clone().multiplyScalar(side * distanceFromTrack)
            );
            
            // STRICT check: verify this position is safe from ALL track points
            if (!isSafePosition(treePosition)) {
                // Push tree further out until it's safe
                for (let push = 10; push <= 60; push += 10) {
                    const testPos = trackPoint.clone().add(
                        perpendicular.clone().multiplyScalar(side * (distanceFromTrack + push))
                    );
                    if (isSafePosition(testPos)) {
                        treePosition.copy(testPos);
                        break;
                    }
                }
                // Final safety check - skip if still unsafe
                if (!isSafePosition(treePosition)) {
                    continue;
                }
            }
            
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.copy(treePosition);
            trunk.position.y = 2;
            trunk.castShadow = true;
            this.scene.add(trunk);
            
            const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
            leaves.position.copy(treePosition);
            leaves.position.y = 5;
            leaves.castShadow = true;
            this.scene.add(leaves);

            this.obstacles.push({ position: treePosition.clone(), radius: 2.2, type: 'tree' });
        }
    }
    
    addSnowTrees() {
        const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 3, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const leavesGeometry = new THREE.ConeGeometry(1.5, 4, 8);
        const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x1a4d1a });
        
        for (let i = 0; i < 40; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 150 + Math.random() * 200;
            
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.set(
                Math.cos(angle) * radius,
                1.5,
                Math.sin(angle) * radius
            );
            this.scene.add(trunk);
            
            const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
            leaves.position.copy(trunk.position);
            leaves.position.y = 5;
            this.scene.add(leaves);

            this.obstacles.push({ position: trunk.position.clone(), radius: 1.8, type: 'snow_tree' });
        }
    }
    
    addCacti() {
        const cactusGeometry = new THREE.CylinderGeometry(0.5, 0.6, 3, 8);
        const cactusMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5a27 });
        
        for (let i = 0; i < 30; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 150 + Math.random() * 200;
            
            const cactus = new THREE.Mesh(cactusGeometry, cactusMaterial);
            cactus.position.set(
                Math.cos(angle) * radius,
                1.5,
                Math.sin(angle) * radius
            );
            cactus.castShadow = true;
            this.scene.add(cactus);

            this.obstacles.push({ position: cactus.position.clone(), radius: 1.5, type: 'cactus' });
        }
    }
    
    addDenseTrees() {
        this.addTrees();
        // Add more trees for dense forest
        this.addTrees();
    }
}

// Battle Arena Generator
export class BattleArenaGenerator {
    constructor(scene) {
        this.scene = scene;
    }
    
    generate(arenaData) {
        const arena = {
            mesh: null,
            spawnPoints: [],
            itemBoxes: [],
            obstacles: []
        };
        
        // Create arena floor
        arena.mesh = this.createArenaFloor(arenaData);
        this.scene.add(arena.mesh);
        
        // Create walls
        this.createWalls(arenaData);
        
        // Create spawn points
        arena.spawnPoints = this.createSpawnPoints(arenaData);
        
        // Create item boxes
        arena.itemBoxes = this.createItemBoxes(arenaData);
        
        // Create obstacles
        arena.obstacles = this.createObstacles(arenaData);
        
        return arena;
    }
    
    createArenaFloor(_arenaData) {
        const size = 100;
        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshStandardMaterial({
            color: 0x555555,
            roughness: 0.8
        });
        
        const floor = new THREE.Mesh(geometry, material);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        
        return floor;
    }
    
    createWalls(_arenaData) {
        const wallGeometry = new THREE.BoxGeometry(100, 5, 2);
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
        
        const positions = [
            { x: 0, z: 51, rotation: 0 },
            { x: 0, z: -51, rotation: 0 },
            { x: 51, z: 0, rotation: Math.PI / 2 },
            { x: -51, z: 0, rotation: Math.PI / 2 }
        ];
        
        positions.forEach(pos => {
            const wall = new THREE.Mesh(wallGeometry, wallMaterial);
            wall.position.set(pos.x, 2.5, pos.z);
            wall.rotation.y = pos.rotation;
            wall.castShadow = true;
            wall.receiveShadow = true;
            this.scene.add(wall);
        });
    }
    
    createSpawnPoints(_arenaData) {
        const points = [];
        const positions = [
            { x: -30, z: -30 },
            { x: 30, z: -30 },
            { x: -30, z: 30 },
            { x: 30, z: 30 },
            { x: 0, z: -40 },
            { x: 0, z: 40 },
            { x: -40, z: 0 },
            { x: 40, z: 0 },
            { x: -20, z: 0 },
            { x: 20, z: 0 },
            { x: 0, z: -20 },
            { x: 0, z: 20 }
        ];
        
        positions.forEach((pos) => {
            points.push({
                position: new THREE.Vector3(pos.x, 0.5, pos.z),
                rotation: Math.atan2(-pos.x, -pos.z) // Face center
            });
        });
        
        return points;
    }
    
    createItemBoxes(_arenaData) {
        const boxes = [];
        const boxGeometry = new THREE.BoxGeometry(2, 2, 2);
        const boxMaterial = new THREE.MeshStandardMaterial({
            color: 0xff8800,
            emissive: 0xff4400,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.8
        });
        
        const positions = [
            { x: 0, z: 0 },
            { x: -25, z: -25 },
            { x: 25, z: -25 },
            { x: -25, z: 25 },
            { x: 25, z: 25 }
        ];
        
        positions.forEach(pos => {
            const box = new THREE.Mesh(boxGeometry, boxMaterial);
            box.position.set(pos.x, 2, pos.z);
            this.scene.add(box);
            
            boxes.push({
                mesh: box,
                position: box.position.clone(),
                active: true
            });
        });
        
        return boxes;
    }
    
    createObstacles(_arenaData) {
        const obstacles = [];
        const obstacleGeometry = new THREE.BoxGeometry(4, 2, 4);
        const obstacleMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
        
        const positions = [
            { x: -15, z: -15 },
            { x: 15, z: -15 },
            { x: -15, z: 15 },
            { x: 15, z: 15 }
        ];
        
        positions.forEach(pos => {
            const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
            obstacle.position.set(pos.x, 1, pos.z);
            obstacle.castShadow = true;
            obstacle.receiveShadow = true;
            this.scene.add(obstacle);
            
            obstacles.push({
                mesh: obstacle,
                position: obstacle.position.clone()
            });
        });
        
        return obstacles;
    }
}

export default TrackGenerator;
