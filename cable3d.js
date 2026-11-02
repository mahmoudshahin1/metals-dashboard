// ===== 3D Cable Visualizer & Industrial Aggregates Engine =====
// Antigravity Metals Department Dashboard © 2026
// Powered by Three.js WebGL with PBR Materials & Dynamic Data Link

(function () {
    'use strict';

    // State Variables
    let scene, camera, renderer, controls;
    let containerEl, canvasEl, tooltipEl;
    let cableGroup = null;
    let animFrameId = null;
    let isAutoRotating = true;
    let currentExplode = 0;
    let raycaster, mouse;
    let hoveredMesh = null;
    let originalEmissive = null;
    let currentSpec = null;
    let activeData = [];
    let cableCatalog = [];
    let isInitialized = false;

    // Presets for Quick Switch
    const STANDARD_PRESETS = [
        {
            id: 'aggregate',
            name: '🌟 Combined Aggregate Cable (All Specs)',
            desc: 'Representative model combining all production orders in selected period',
            cores: 4,
            mat: 'AL',
            insulation: 'XLPE',
            armour: 'STA',
            voltage: '0.6/1 KV',
            size: '4x70 mm²',
            isBare: false
        },
        {
            id: 'cu_1c_pvc',
            name: '⚡ Single-Core Copper Cable (1x4 mm² CU)',
            desc: 'Stranded copper building wire insulated with PVC',
            cores: 1,
            mat: 'CU',
            insulation: 'PVC',
            armour: 'NONE',
            voltage: '450/750 V',
            size: '1x4 mm²',
            isBare: false
        },
        {
            id: 'al_4c_sta',
            name: '⚡ 4-Core Armoured Aluminum Power Cable (4x25 mm²)',
            desc: 'Low-voltage aluminum cable insulated with XLPE, STA steel tape armour',
            cores: 4,
            mat: 'AL',
            insulation: 'XLPE',
            armour: 'STA',
            voltage: '0.6/1 KV',
            size: '4x25 mm²',
            isBare: false
        },
        {
            id: 'al_3c_mv',
            name: '⚡ Medium-Voltage 3-Core Cable (12/20 KV)',
            desc: '3-Core medium-voltage power cable with XLPE insulation and metallic armour',
            cores: 3,
            mat: 'AL',
            insulation: 'XLPE',
            armour: 'STA',
            voltage: '12/20 KV',
            size: '3x300 mm²',
            isBare: false
        },
        {
            id: 'acsr_bare',
            name: '⚡ Overhead Stranded Conductor (ACSR 150/25)',
            desc: 'Bare aluminum conductor steel-reinforced (ACSR) without insulation',
            cores: 1,
            mat: 'AL',
            insulation: 'NONE',
            armour: 'NONE',
            voltage: 'Overhead Line',
            size: '150/25 mm²',
            isBare: true
        },
        {
            id: 'cu_12c_ctrl',
            name: '⚡ Multi-Core Control Cable (12x1.5 mm² CU)',
            desc: '12-core copper signal and control cable with screening and PVC sheath',
            cores: 12,
            mat: 'CU',
            insulation: 'PVC',
            armour: 'NONE',
            voltage: '0.6/1 KV',
            size: '12x1.5 mm²',
            isBare: false
        }
    ];

    // ===== 1. Initialize 3D Engine =====
    function initCable3D(data) {
        if (typeof window.THREE === 'undefined') {
            console.warn('[Cable3D] Three.js not loaded. Retrying in 200ms...');
            setTimeout(() => initCable3D(data), 200);
            return;
        }

        const sec = document.getElementById('cable3dSection');
        if (sec && (sec.style.display === 'none' || sec.classList.contains('hidden'))) {
            return; // 3D visualizer is isolated/hidden for now
        }

        containerEl = document.getElementById('cable3dCanvasContainer');
        if (!containerEl) {
            return;
        }

        // Prevent multiple initializations
        if (isInitialized) {
            updateCable3D(data);
            return;
        }

        isInitialized = true;
        activeData = Array.isArray(data) ? data : [];

        // Dimensions
        const width = containerEl.clientWidth || 600;
        const height = containerEl.clientHeight || 450;

        // Scene
        scene = new THREE.Scene();
        scene.background = null; // Transparent to blend with modern card background

        // Camera
        camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
        camera.position.set(13, 9, 15);

        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;

        canvasEl = renderer.domElement;
        canvasEl.style.width = '100%';
        canvasEl.style.height = '100%';
        canvasEl.style.display = 'block';
        canvasEl.style.outline = 'none';
        canvasEl.setAttribute('aria-label', '3D Cable Visualizer');
        containerEl.innerHTML = '';
        containerEl.appendChild(canvasEl);

        // OrbitControls
        if (typeof window.OrbitControls === 'function') {
            controls = new window.OrbitControls(camera, canvasEl);
            controls.enableDamping = true;
            controls.dampingFactor = 0.06;
            controls.rotateSpeed = 0.85;
            controls.zoomSpeed = 1.0;
            controls.panSpeed = 0.8;
            controls.minDistance = 6;
            controls.maxDistance = 35;
            controls.target.set(0, 0, 0);
        }

        // Lighting
        setupLighting();

        // Raycaster & Mouse for Layer Hover
        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2(-999, -999);
        setupInteraction();

        // Responsive Resizing
        const resizeObserver = new ResizeObserver(() => handleResize());
        resizeObserver.observe(containerEl);
        window.addEventListener('resize', handleResize);

        // Start Animation Loop
        startAnimation();

        // Initial Build with Data
        updateCable3D(activeData);
    }

    // ===== 2. Lighting Setup =====
    function setupLighting() {
        // Soft ambient base
        const ambient = new THREE.AmbientLight(0xffffff, 0.75);
        scene.add(ambient);

        // Key light (warm industrial studio)
        const keyLight = new THREE.DirectionalLight(0xfff6ea, 1.25);
        keyLight.position.set(16, 20, 18);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 1024;
        keyLight.shadow.mapSize.height = 1024;
        scene.add(keyLight);

        // Fill light (cool sky tone from opposite side)
        const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.8);
        fillLight.position.set(-16, -10, -14);
        scene.add(fillLight);

        // Front accent light for metallic reflection on strands
        const accentLight = new THREE.PointLight(0xffffff, 1.1, 40);
        accentLight.position.set(2, 6, 12);
        scene.add(accentLight);

        // Subtle soft shadow ground ring
        const shadowPlaneGeo = new THREE.PlaneGeometry(28, 28);
        const shadowMat = new THREE.ShadowMaterial({ opacity: 0.15 });
        const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowMat);
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = -4.5;
        shadowPlane.receiveShadow = true;
        scene.add(shadowPlane);
    }

    // ===== 3. Build Procedural 3D Cable Model =====
    function buildCableModel(spec) {
        if (!scene) return;

        // Clean previous model and memory
        if (cableGroup) {
            scene.remove(cableGroup);
            disposeHierarchy(cableGroup);
            cableGroup = null;
        }

        currentSpec = spec || STANDARD_PRESETS[0];

        cableGroup = new THREE.Group();
        cableGroup.name = 'CableRoot';

        const isBare = !!currentSpec.isBare;
        const coresCount = Math.max(1, parseInt(currentSpec.cores, 10) || 1);
        const matType = (currentSpec.mat || 'AL').toUpperCase();
        const insType = (currentSpec.insulation || 'XLPE').toUpperCase();
        const armourType = (currentSpec.armour || 'STA').toUpperCase();
        const voltage = currentSpec.voltage || '0.6/1 KV';
        const isMV = voltage.includes('12/20') || voltage.includes('18/30') || voltage.includes('KV');

        // Material Definitions
        const copperMat = new THREE.MeshStandardMaterial({
            color: 0xc87438,
            metalness: 0.95,
            roughness: 0.22,
            name: 'CopperMaterial'
        });

        const aluminumMat = new THREE.MeshStandardMaterial({
            color: 0xd8dee6,
            metalness: 0.88,
            roughness: 0.28,
            name: 'AluminumMaterial'
        });

        const conductorMat = (matType === 'CU') ? copperMat : aluminumMat;

        // Base Geometry Constants
        const cableLength = 16.0; // from Z = -8 to Z = +8
        const zBack = -8.0;

        // Cutaway step positions along Z axis (telescoping reveal)
        const zSheathEnd = isBare ? zBack : -2.0;
        const zArmourEnd = isBare ? zBack : (armourType === 'NONE' ? -2.0 : 0.8);
        const zBeddingEnd = isBare ? zBack : 2.8;
        const zInsulationEnd = isBare ? zBack : 5.4;
        const zConductorEnd = 8.0;

        // Core colors for multi-core insulation
        const coreColors = [
            0xdc2626, // Core 1: Red
            0xeab308, // Core 2: Yellow
            0x2563eb, // Core 3: Blue
            0x1e293b, // Core 4: Black (Neutral)
            0x16a34a, // Core 5 / Earth: Green
            0x9333ea, 0x06b6d4, 0xf97316, 0x64748b, 0x84cc16, 0xec4899, 0xa855f7
        ];

        // 1. CONDUCTORS & CORES
        const conductorsGroup = new THREE.Group();
        conductorsGroup.name = 'ConductorLayerGroup';
        conductorsGroup.userData = {
            layerId: 'conductor',
            layerNameAr: 'Conductor Strands',
            layerNameEn: `${matType === 'CU' ? 'Copper' : 'Aluminum'} Stranded Conductors`,
            desc: `قلب الكابل الناقل للتيار مصنوع من أسلاك ${matType === 'CU' ? 'نحاس إلكتروليتي نقي' : 'ألومنيوم مقسى مجدول'} لنقل الطاقة بأعلى كفاءة.`
        };

        const insulationsGroup = new THREE.Group();
        insulationsGroup.name = 'InsulationLayerGroup';
        insulationsGroup.userData = {
            layerId: 'insulation',
            layerNameAr: `Primary Insulation Layer (${insType})`,
            layerNameEn: `${insType} Primary Insulation`,
            desc: `عزل متين من مادة ${insType === 'XLPE' ? 'البولي إيثيلين المشبك (XLPE) المقاوم للحرارة حتى 90°C' : 'بولي فينيل كلوريد (PVC)'} بألوان قياسية للتمييز.`
        };

        // Determine core placement radii
        let coreRadius, orbitRadius;
        if (coresCount === 1) {
            coreRadius = isBare ? 1.6 : 1.25;
            orbitRadius = 0;
        } else if (coresCount === 2) {
            coreRadius = 0.95;
            orbitRadius = 1.15;
        } else if (coresCount === 3) {
            coreRadius = 0.85;
            orbitRadius = 1.35;
        } else if (coresCount === 4) {
            coreRadius = 0.78;
            orbitRadius = 1.45;
        } else {
            // Multi-core (e.g. 12)
            coreRadius = 0.45;
            orbitRadius = 1.7;
        }

        const strandCount = isBare ? 19 : 7; // 19 strands for realistic industrial cable
        const strandRadius = coreRadius / (isBare ? 5.2 : 3.2);

        // Build each core
        for (let c = 0; c < coresCount; c++) {
            let cx = 0;
            let cy = 0;
            if (coresCount > 1) {
                const angle = (c * (2 * Math.PI / coresCount)) + (Math.PI / 4);
                cx = Math.cos(angle) * orbitRadius;
                cy = Math.sin(angle) * orbitRadius;
            }

            // Conductors Group for this Core
            const singleCoreCondGroup = new THREE.Group();
            singleCoreCondGroup.position.set(cx, cy, 0);

            // Strands: Center strand
            const condLength = zConductorEnd - zBack;
            const centerGeo = new THREE.CylinderGeometry(strandRadius, strandRadius, condLength, 16);
            centerGeo.rotateX(Math.PI / 2);
            const centerMesh = new THREE.Mesh(centerGeo, conductorMat);
            centerMesh.position.set(0, 0, zBack + condLength / 2);
            centerMesh.castShadow = true;
            centerMesh.userData = conductorsGroup.userData;
            singleCoreCondGroup.add(centerMesh);

            // Ring 1 of strands (6 strands)
            const ring1Radius = strandRadius * 2.0;
            for (let s = 0; s < 6; s++) {
                const sAngle = s * (Math.PI / 3);
                const sx = Math.cos(sAngle) * ring1Radius;
                const sy = Math.sin(sAngle) * ring1Radius;
                const strandMesh = new THREE.Mesh(centerGeo, conductorMat);
                strandMesh.position.set(sx, sy, zBack + condLength / 2);
                strandMesh.castShadow = true;
                strandMesh.userData = conductorsGroup.userData;
                singleCoreCondGroup.add(strandMesh);
            }

            // If 19 strands, add outer ring (12 strands)
            if (strandCount === 19) {
                const ring2Radius = strandRadius * 4.0;
                for (let s = 0; s < 12; s++) {
                    const sAngle = s * (Math.PI / 6);
                    const sx = Math.cos(sAngle) * ring2Radius;
                    const sy = Math.sin(sAngle) * ring2Radius;
                    const strandMesh = new THREE.Mesh(centerGeo, conductorMat);
                    strandMesh.position.set(sx, sy, zBack + condLength / 2);
                    strandMesh.castShadow = true;
                    strandMesh.userData = conductorsGroup.userData;
                    singleCoreCondGroup.add(strandMesh);
                }
            }

            conductorsGroup.add(singleCoreCondGroup);

            // Insulation sleeve (if not bare conductor)
            if (!isBare) {
                const insColor = insType === 'XLPE'
                    ? (coresCount === 1 ? 0xf1f5f9 : coreColors[c % coreColors.length])
                    : coreColors[c % coreColors.length];

                const insMat = new THREE.MeshStandardMaterial({
                    color: insColor,
                    roughness: insType === 'XLPE' ? 0.35 : 0.45,
                    metalness: 0.05,
                    name: `InsulationMat_${c}`
                });

                const insOuterR = coreRadius * 1.35;
                const insLen = zInsulationEnd - zBack;

                const insGeo = createHollowCylinderGeometry(coreRadius, insOuterR, insLen, 24);
                const insMesh = new THREE.Mesh(insGeo, insMat);
                insMesh.position.set(cx, cy, zBack + insLen / 2);
                insMesh.castShadow = true;
                insMesh.receiveShadow = true;
                insMesh.userData = insulationsGroup.userData;
                insMesh.userData.coreIndex = c + 1;
                insulationsGroup.add(insMesh);
            }
        }

        cableGroup.add(conductorsGroup);
        if (!isBare) cableGroup.add(insulationsGroup);

        // If bare conductor, we stop here (no bedding, armour, or jacket)
        if (isBare) {
            finalizeCableGroup();
            return;
        }

        // 2. BEDDING & FILLERS (الغلاف الداخلي والحشوة)
        const beddingGroup = new THREE.Group();
        beddingGroup.name = 'BeddingLayerGroup';
        beddingGroup.userData = {
            layerId: 'bedding',
            layerNameAr: 'Bedding & Filler Layer',
            layerNameEn: 'Extruded Inner Covering & PP Fillers',
            desc: 'Inner bedding and extruded filler to maintain circular geometry and cushion under armour.'
        };

        const beddingInnerR = orbitRadius + coreRadius * 1.36;
        const beddingOuterR = beddingInnerR + 0.35;
        const beddingLen = zBeddingEnd - zBack;

        const beddingMat = new THREE.MeshStandardMaterial({
            color: 0x1f242d,
            roughness: 0.85,
            metalness: 0.05,
            name: 'BeddingMaterial'
        });

        const beddingGeo = createHollowCylinderGeometry(beddingInnerR, beddingOuterR, beddingLen, 32);
        const beddingMesh = new THREE.Mesh(beddingGeo, beddingMat);
        beddingMesh.position.set(0, 0, zBack + beddingLen / 2);
        beddingMesh.castShadow = true;
        beddingMesh.receiveShadow = true;
        beddingMesh.userData = beddingGroup.userData;
        beddingGroup.add(beddingMesh);
        cableGroup.add(beddingGroup);

        // 3. ARMOURING (التسليح)
        const armourGroup = new THREE.Group();
        armourGroup.name = 'ArmourLayerGroup';
        armourGroup.userData = {
            layerId: 'armour',
            layerNameAr: armourType === 'STA'
                ? 'التسليح بشريط صلب مجلفن (Steel Tape Armour - STA)'
                : (armourType === 'SWA' ? 'التسليح بأسلاك صلب مجلفنة (Steel Wire Armour - SWA)' : 'بدون تسليح (Unarmoured)'),
            layerNameEn: armourType === 'STA' ? 'Galvanized Double Steel Tape (STA)' : (armourType === 'SWA' ? 'Galvanized Steel Wire (SWA)' : 'Unarmoured'),
            desc: armourType === 'STA'
                ? 'شريط مزدوج من الصلب المجلفن يلف حلزونياً لحماية الكابل ميكانيكياً ضد الصدمات والضغط والردم الأرضي.'
                : (armourType === 'SWA' ? 'حلقة كاملة من أسلاك الصلب المجلفنة المتراصة لتوفير قوة شد ومقاومة ضغط فائقة.' : 'كابل بدون تسليح مخصص للتركيبات الداخلية والممرات الهوائية.')
        };

        let armourOuterR = beddingOuterR;
        if (armourType !== 'NONE') {
            const armourInnerR = beddingOuterR + 0.05;
            armourOuterR = armourInnerR + 0.3;
            const armourLen = zArmourEnd - zBack;

            const steelMat = new THREE.MeshStandardMaterial({
                color: 0x8a94a0,
                metalness: 0.9,
                roughness: 0.32,
                name: 'SteelArmourMat'
            });

            if (armourType === 'SWA') {
                // SWA: Ring of round steel wires
                const wireRadius = 0.14;
                const wireCount = Math.floor((2 * Math.PI * armourInnerR) / (wireRadius * 2.1));
                const wireGeo = new THREE.CylinderGeometry(wireRadius, wireRadius, armourLen, 12);
                wireGeo.rotateX(Math.PI / 2);

                for (let w = 0; w < wireCount; w++) {
                    const wAngle = w * (2 * Math.PI / wireCount);
                    const wx = Math.cos(wAngle) * armourInnerR;
                    const wy = Math.sin(wAngle) * armourInnerR;
                    const wireMesh = new THREE.Mesh(wireGeo, steelMat);
                    wireMesh.position.set(wx, wy, zBack + armourLen / 2);
                    wireMesh.castShadow = true;
                    wireMesh.userData = armourGroup.userData;
                    armourGroup.add(wireMesh);
                }
            } else {
                // STA: Steel Tape bands
                const staGeo = createHollowCylinderGeometry(armourInnerR, armourOuterR, armourLen, 32);
                const staMesh = new THREE.Mesh(staGeo, steelMat);
                staMesh.position.set(0, 0, zBack + armourLen / 2);
                staMesh.castShadow = true;
                staMesh.receiveShadow = true;
                staMesh.userData = armourGroup.userData;
                armourGroup.add(staMesh);
            }
            cableGroup.add(armourGroup);
        }

        // 4. OUTER SHEATH / JACKET (الغلاف الخارجي)
        const sheathGroup = new THREE.Group();
        sheathGroup.name = 'OuterSheathLayerGroup';
        sheathGroup.userData = {
            layerId: 'sheath',
            layerNameAr: `Outer Sheath (${isMV ? 'Red HDPE (Medium Voltage)' : 'Black UV-resistant PVC'})`,
            layerNameEn: `Outer Protective Jacket (${isMV ? 'Red HDPE' : 'Black PVC'})`,
            desc: 'Tough outer jacket providing moisture barrier, UV resistance, and environmental protection.'
        };

        const sheathInnerR = armourOuterR + 0.05;
        const sheathOuterR = sheathInnerR + 0.55;
        const sheathLen = zSheathEnd - zBack;

        // Dynamic Embossed Cable Text on Jacket
        const labelText = `${currentSpec.size || 'CABLE'} • ${matType}/${insType}${armourType !== 'NONE' ? '/' + armourType : ''}/PVC • ${voltage} • METALS DEPT 2026`;
        const labelTexture = createProceduralLabelTexture(labelText, isMV);

        const sheathMat = new THREE.MeshStandardMaterial({
            color: isMV ? 0x991b1b : 0x14171e,
            roughness: 0.45,
            metalness: 0.1,
            map: labelTexture,
            name: 'OuterSheathMaterial'
        });

        const sheathGeo = createHollowCylinderGeometry(sheathInnerR, sheathOuterR, sheathLen, 36);
        const sheathMesh = new THREE.Mesh(sheathGeo, sheathMat);
        sheathMesh.position.set(0, 0, zBack + sheathLen / 2);
        sheathMesh.castShadow = true;
        sheathMesh.receiveShadow = true;
        sheathMesh.userData = sheathGroup.userData;
        sheathGroup.add(sheathMesh);
        cableGroup.add(sheathGroup);

        finalizeCableGroup();
    }

    function finalizeCableGroup() {
        // Slightly tilt cable for dynamic 3D presentation
        cableGroup.rotation.y = THREE.MathUtils.degToRad(-25);
        cableGroup.rotation.x = THREE.MathUtils.degToRad(8);
        cableGroup.position.set(0, 0, 0);
        scene.add(cableGroup);

        // Apply current explode slider state
        applyExplodeState(currentExplode);

        // Update UI Specs Card
        renderActiveSpecCard();
    }

    // Geometry Helper: Hollow Cylinder (Telescoping Pipe Layer)
    function createHollowCylinderGeometry(innerR, outerR, length, segments) {
        const shape = new THREE.Shape();
        shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
        const holePath = new THREE.Path();
        holePath.absarc(0, 0, innerR, 0, Math.PI * 2, true);
        shape.holes.push(holePath);

        const extrudeSettings = {
            steps: 1,
            depth: length,
            bevelEnabled: true,
            bevelSegments: 2,
            steps: 1,
            bevelSize: 0.04,
            bevelThickness: 0.04
        };

        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // Center the extrusion on Z
        geo.translate(0, 0, -length / 2);
        return geo;
    }

    // Procedural Printed Texture for Outer Cable Jacket
    function createProceduralLabelTexture(text, isRedJacket) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = isRedJacket ? '#881337' : '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Embossed technical text
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 24px "Inter", "Cairo", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const printStr = `⚡ ${text} ⚡`;
        ctx.fillText(printStr, canvas.width / 2, canvas.height * 0.4);
        ctx.fillText(printStr, canvas.width / 2, canvas.height * 0.75);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 2);
        return texture;
    }

    // ===== 4. Interactive Exploded / Peel-Back State =====
    function setExplodeProgress(val) {
        currentExplode = Math.max(0, Math.min(1, parseFloat(val) || 0));
        applyExplodeState(currentExplode);
        const label = document.getElementById('explodeValueLabel');
        if (label) label.textContent = `${Math.round(currentExplode * 100)}%`;
    }

    function applyExplodeState(val) {
        if (!cableGroup) return;

        const sheath = cableGroup.getObjectByName('OuterSheathLayerGroup');
        const armour = cableGroup.getObjectByName('ArmourLayerGroup');
        const bedding = cableGroup.getObjectByName('BeddingLayerGroup');
        const insulation = cableGroup.getObjectByName('InsulationLayerGroup');
        const conductors = cableGroup.getObjectByName('ConductorLayerGroup');

        if (sheath) {
            sheath.position.z = -val * 4.2;
            const s = 1 + val * 0.18;
            sheath.scale.set(s, s, 1);
        }
        if (armour) {
            armour.position.z = -val * 2.8;
            const s = 1 + val * 0.12;
            armour.scale.set(s, s, 1);
        }
        if (bedding) {
            bedding.position.z = -val * 1.5;
            const s = 1 + val * 0.08;
            bedding.scale.set(s, s, 1);
        }
        if (insulation) {
            // Fan out insulation cores radially
            insulation.children.forEach((child, idx) => {
                const angle = (idx * (2 * Math.PI / Math.max(1, insulation.children.length))) + (Math.PI / 4);
                child.position.x = (child.userData.origX || child.position.x) + Math.cos(angle) * (val * 0.85);
                child.position.y = (child.userData.origY || child.position.y) + Math.sin(angle) * (val * 0.85);
            });
        }
    }

    // ===== 5. Animation & Render Loop =====
    function startAnimation() {
        if (animFrameId) cancelAnimationFrame(animFrameId);

        function animate() {
            animFrameId = requestAnimationFrame(animate);

            if (controls) controls.update();

            // Auto-rotation around Y axis
            if (isAutoRotating && cableGroup) {
                cableGroup.rotation.y += 0.004;
            }

            renderer.render(scene, camera);
        }

        animate();
    }

    function toggleAutoRotate() {
        isAutoRotating = !isAutoRotating;
        const btn = document.getElementById('btnToggleAutoRotate');
        if (btn) {
            btn.classList.toggle('active', isAutoRotating);
            btn.title = isAutoRotating ? 'Stop Auto Rotation' : 'Start Auto Rotation';
            const icon = btn.querySelector('.icon');
            if (icon) icon.textContent = isAutoRotating ? '⏸️' : '▶️';
        }
    }

    // Camera Presets
    function setCameraView(preset) {
        if (!controls || !camera) return;
        isAutoRotating = false;
        const btn = document.getElementById('btnToggleAutoRotate');
        if (btn) btn.classList.remove('active');

        switch (preset) {
            case 'cross': // Direct Front Cross-Section View
                camera.position.set(0, 0, 18);
                if (cableGroup) {
                    cableGroup.rotation.set(0, 0, 0);
                }
                controls.target.set(0, 0, 0);
                break;
            case 'side': // Cutaway Side View
                camera.position.set(19, 0, 0);
                if (cableGroup) {
                    cableGroup.rotation.set(0, THREE.MathUtils.degToRad(-90), 0);
                }
                controls.target.set(0, 0, 0);
                break;
            case 'iso': // Isometric 3D
            default:
                camera.position.set(13, 9, 15);
                if (cableGroup) {
                    cableGroup.rotation.set(THREE.MathUtils.degToRad(8), THREE.MathUtils.degToRad(-25), 0);
                }
                controls.target.set(0, 0, 0);
                break;
        }
        controls.update();
    }

    function resetCamera() {
        setCameraView('iso');
        setExplodeProgress(0);
        const slider = document.getElementById('explodeSlider');
        if (slider) slider.value = 0;
    }

    // ===== 6. Raycaster & Layer Hover Interaction =====
    function setupInteraction() {
        tooltipEl = document.getElementById('cable3dTooltip');

        canvasEl.addEventListener('pointermove', onPointerMove);
        canvasEl.addEventListener('pointerleave', onPointerLeave);
        canvasEl.addEventListener('click', onCanvasClick);
    }

    function onPointerMove(e) {
        const rect = canvasEl.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        if (!cableGroup) return;

        const intersects = raycaster.intersectObjects(cableGroup.children, true);
        if (intersects.length > 0) {
            // Find first mesh with valid layerId
            let target = null;
            for (let hit of intersects) {
                if (hit.object && hit.object.userData && hit.object.userData.layerId) {
                    target = hit.object;
                    break;
                }
            }

            if (target) {
                highlightLayer(target);
                showTooltip(e.clientX, e.clientY, target.userData);
                return;
            }
        }

        clearHighlight();
        hideTooltip();
    }

    function onPointerLeave() {
        clearHighlight();
        hideTooltip();
    }

    function onCanvasClick(e) {
        if (!hoveredMesh || !hoveredMesh.userData) return;
        const layerId = hoveredMesh.userData.layerId;
        highlightLayerCard(layerId);
    }

    function highlightLayer(mesh) {
        if (hoveredMesh === mesh) return;
        clearHighlight();

        hoveredMesh = mesh;
        if (mesh.material && mesh.material.emissive) {
            originalEmissive = mesh.material.emissive.getHex();
            mesh.material.emissive.setHex(0x38bdf8); // Glowing cyan highlight
        }
        canvasEl.style.cursor = 'pointer';
    }

    function clearHighlight() {
        if (hoveredMesh && hoveredMesh.material && hoveredMesh.material.emissive) {
            if (originalEmissive !== null) {
                hoveredMesh.material.emissive.setHex(originalEmissive);
            }
        }
        hoveredMesh = null;
        originalEmissive = null;
        if (canvasEl) canvasEl.style.cursor = 'grab';
    }

    function showTooltip(x, y, data) {
        if (!tooltipEl) return;
        tooltipEl.innerHTML = `
            <div class="tip-layer-badge">${data.layerNameAr || 'Cable Layer'}</div>
            <div class="tip-layer-en">${data.layerNameEn || ''}</div>
            <div class="tip-layer-desc">${data.desc || ''}</div>
            <div class="tip-data-stat">${getLayerAggregatedMetric(data.layerId)}</div>
        `;
        tooltipEl.style.left = `${x + 15}px`;
        tooltipEl.style.top = `${y - 15}px`;
        tooltipEl.classList.add('visible');
    }

    function hideTooltip() {
        if (tooltipEl) tooltipEl.classList.remove('visible');
    }

    function getLayerAggregatedMetric(layerId) {
        const stats = computeAggregates(activeData);
        switch (layerId) {
            case 'conductor':
                return `📊 Conductor Total: <strong>${stats.totalLength.toLocaleString()} m</strong> (CU: ${stats.cuMeters.toLocaleString()} m | AL: ${stats.alMeters.toLocaleString()} m)`;
            case 'insulation':
                return `📊 Total Insulated: <strong>${stats.totalLength.toLocaleString()} m</strong> (LV: ${stats.lvMeters.toLocaleString()} m | MV: ${stats.mvMeters.toLocaleString()} m)`;
            case 'armour':
                return `📊 Steel Armour: <strong>${stats.staMeters.toLocaleString()} m</strong> galvanized steel tape`;
            case 'sheath':
                return `📊 إجمالي إنتاج الكابلات التام: <strong>${stats.totalLength.toLocaleString()} م</strong> | الوزن: <strong>${stats.totalWeightTons} طن</strong>`;
            case 'bedding':
            default:
                return `📊 Inner Bedding for <strong>${stats.totalOrders.toLocaleString()} Work Orders</strong>`;
        }
    }

    function highlightLayerCard(layerId) {
        const pills = document.querySelectorAll('.cable-3d-layers-legend .layer-pill');
        pills.forEach(p => p.classList.toggle('active', p.getAttribute('data-layer') === layerId));
    }

    function handleResize() {
        if (!containerEl || !renderer || !camera) return;
        const width = containerEl.clientWidth || 600;
        const height = containerEl.clientHeight || 450;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }

    function disposeHierarchy(obj) {
        obj.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }

    // ===== 7. Aggregates Calculator & Data Sync =====
    function computeAggregates(data) {
        const rows = Array.isArray(data) ? data : [];
        let totalLength = 0;
        let totalWeightKg = 0;
        let cuMeters = 0;
        let alMeters = 0;
        let cuWeight = 0;
        let alWeight = 0;
        let cuOrders = 0;
        let alOrders = 0;

        let lvMeters = 0;
        let mvMeters = 0;
        let bcMeters = 0;
        let ccMeters = 0;
        let hvMeters = 0;
        let staMeters = 0;

        const sizeMap = {};
        const cableMap = {};

        rows.forEach(r => {
            const len = parseFloat(r.length) || 0;
            const wt = parseFloat(r.weight) || 0;
            totalLength += len;
            totalWeightKg += wt;

            const mat = String(r.material || '').toUpperCase();
            if (mat === 'CU') {
                cuMeters += len;
                cuWeight += wt;
                cuOrders++;
            } else {
                alMeters += len;
                alWeight += wt;
                alOrders++;
            }

            const fam = String(r.familyid || '').toUpperCase();
            if (fam === 'LV') lvMeters += len;
            else if (fam === 'MV') mvMeters += len;
            else if (fam === 'BC') bcMeters += len;
            else if (fam === 'CC' || fam === 'IC') ccMeters += len;
            else if (fam === 'HV') hvMeters += len;

            const cableStr = String(r.cable || '').toUpperCase();
            if (cableStr.includes('STEEL TAPE') || cableStr.includes('STA')) {
                staMeters += len;
            }

            // Group by size
            const sz = r.size || '-';
            if (!sizeMap[sz]) sizeMap[sz] = { size: sz, length: 0, weight: 0, orders: 0, mat };
            sizeMap[sz].length += len;
            sizeMap[sz].weight += wt;
            sizeMap[sz].orders++;

            // Group by full cable spec
            const rawCable = (r.cable || '').trim();
            if (rawCable) {
                if (!cableMap[rawCable]) {
                    cableMap[rawCable] = {
                        cable: rawCable,
                        size: r.size,
                        mat: r.material,
                        familyid: r.familyid,
                        length: 0,
                        weight: 0,
                        orders: 0
                    };
                }
                cableMap[rawCable].length += len;
                cableMap[rawCable].weight += wt;
                cableMap[rawCable].orders++;
            }
        });

        const totalOrders = rows.length;
        const totalWeightTons = (totalWeightKg / 1000).toFixed(1);
        const drumAvgLength = totalOrders > 0 ? Math.round(totalLength / totalOrders) : 0;

        const cuPct = totalLength > 0 ? ((cuMeters / totalLength) * 100).toFixed(1) : 0;
        const alPct = totalLength > 0 ? ((alMeters / totalLength) * 100).toFixed(1) : 0;

        const topCables = Object.values(cableMap).sort((a, b) => b.length - a.length);
        const topSizes = Object.values(sizeMap).sort((a, b) => b.length - a.length);

        return {
            totalLength,
            totalWeightKg,
            totalWeightTons,
            totalOrders,
            drumAvgLength,
            cuMeters,
            alMeters,
            cuWeight,
            alWeight,
            cuOrders,
            alOrders,
            cuPct,
            alPct,
            lvMeters,
            mvMeters,
            bcMeters,
            ccMeters,
            hvMeters,
            staMeters,
            topCables,
            topSizes
        };
    }

    // Parse cable string into 3D generator specs
    function parseCableToSpec(cableStr, sizeStr, matStr, famStr) {
        const c = String(cableStr || '').toUpperCase();
        const s = String(sizeStr || '').toLowerCase();
        const fam = String(famStr || 'LV').toUpperCase();
        const mat = (matStr || (c.includes('COPPER') || c.includes('CU') ? 'CU' : 'AL')).toUpperCase();

        let cores = 1;
        const coreMatch = (s + ' ' + c).match(/\b(\d+)\s*[\*x]/);
        if (coreMatch) {
            cores = parseInt(coreMatch[1], 10);
        }

        let insulation = 'PVC';
        if (c.includes('XLPE')) insulation = 'XLPE';

        let armour = 'NONE';
        if (c.includes('STEEL TAPE') || c.includes('STA')) armour = 'STA';
        else if (c.includes('STEEL WIRE') || c.includes('SWA')) armour = 'SWA';

        const isBare = fam === 'BC' || c.includes('ACSR') || c.includes('BARE');

        let voltage = '0.6/1 KV';
        if (c.includes('18/30')) voltage = '18/30 KV';
        else if (c.includes('12/20')) voltage = '12/20 KV';
        else if (c.includes('450/750')) voltage = '450/750 V';
        else if (c.includes('300/500')) voltage = '300/500 V';
        else if (c.includes('HV')) voltage = 'High Voltage (HV)';

        return {
            id: 'custom_' + Date.now(),
            name: `${cores}C x ${sizeStr || 'Size'} ${mat} (${insulation}/${armour})`,
            desc: cableStr || 'Metals Department Standard Cable',
            cores,
            mat,
            insulation,
            armour,
            voltage,
            size: sizeStr || `${cores}xCore`,
            isBare,
            rawCable: cableStr
        };
    }

    // Public API: Update 3D Visualizer & Analytics
    function updateCable3D(data) {
        const sec = document.getElementById('cable3dSection');
        if (sec && (sec.style.display === 'none' || sec.classList.contains('hidden'))) {
            return; // 3D visualizer is isolated/hidden for now
        }
        activeData = Array.isArray(data) ? data : [];
        const stats = computeAggregates(activeData);

        // 1. Render Aggregated Analytics Panel
        renderAggregatedStats(stats);

        // 2. Populate Dropdown with Unique Cables from Current Filter
        populateCableSelector(stats.topCables);

        // 3. Render Top 5 Produced Cables Chips
        renderTopCablesList(stats.topCables.slice(0, 5));

        // 4. Update or Maintain Active 3D Model
        if (!currentSpec || currentSpec.id === 'aggregate') {
            // Build aggregate dominant model based on current filter data
            const dominantMat = stats.cuMeters > stats.alMeters ? 'CU' : 'AL';
            const topCable = stats.topCables[0];
            const dominantSpec = topCable
                ? parseCableToSpec(topCable.cable, topCable.size, topCable.mat, topCable.familyid)
                : { ...STANDARD_PRESETS[0], mat: dominantMat };

            dominantSpec.name = `🌟 Combined Aggregate Model (${stats.totalLength.toLocaleString()} m)`;
            buildCableModel(dominantSpec);
        } else {
            // Keep current selected model updated with fresh stats
            buildCableModel(currentSpec);
        }
    }

    // Render Stats Panel HTML
    function renderAggregatedStats(stats) {
        const elLength = document.getElementById('cable3dTotalLength');
        const elWeight = document.getElementById('cable3dTotalWeight');
        const elOrders = document.getElementById('cable3dTotalOrders');
        const elDrumAvg = document.getElementById('cable3dDrumAvg');

        if (elLength) elLength.textContent = `${stats.totalLength.toLocaleString()} m`;
        if (elWeight) elWeight.textContent = `${stats.totalWeightTons} tons (${stats.totalWeightKg.toLocaleString()} kg)`;
        if (elOrders) elOrders.textContent = `${stats.totalOrders.toLocaleString()} Orders`;
        if (elDrumAvg) elDrumAvg.textContent = `${stats.drumAvgLength.toLocaleString()} m`;

        // Conductor Split Bar
        const barCu = document.getElementById('cable3dBarCU');
        const barAl = document.getElementById('cable3dBarAL');
        const textCu = document.getElementById('cable3dTextCU');
        const textAl = document.getElementById('cable3dTextAL');

        if (barCu) barCu.style.width = `${stats.cuPct}%`;
        if (barAl) barAl.style.width = `${stats.alPct}%`;
        if (textCu) textCu.textContent = `نحاس (CU): ${stats.cuMeters.toLocaleString()} م (${stats.cuPct}%) | ${(stats.cuWeight / 1000).toFixed(1)} طن`;
        if (textAl) textAl.textContent = `ألومنيوم (AL): ${stats.alMeters.toLocaleString()} م (${stats.alPct}%) | ${(stats.alWeight / 1000).toFixed(1)} طن`;

        // Families Breakdown
        renderFamilyPill('cableFamLV', 'Low Voltage (LV)', stats.lvMeters, stats.totalLength);
        renderFamilyPill('cableFamMV', 'Medium Voltage (MV)', stats.mvMeters, stats.totalLength);
        renderFamilyPill('cableFamBC', 'Bare Conductor (BC)', stats.bcMeters, stats.totalLength);
        renderFamilyPill('cableFamCC', 'Control Cable (CC)', stats.ccMeters, stats.totalLength);
        renderFamilyPill('cableFamHV', 'High Voltage (HV)', stats.hvMeters, stats.totalLength);
    }

    function renderFamilyPill(elId, label, meters, total) {
        const el = document.getElementById(elId);
        if (!el) return;
        const pct = total > 0 ? ((meters / total) * 100).toFixed(1) : 0;
        el.innerHTML = `<strong>${label}</strong><span>${meters.toLocaleString()} m (${pct}%)</span>`;
        el.style.display = meters > 0 ? 'inline-flex' : 'none';
    }

    function populateCableSelector(topCables) {
        const sel = document.getElementById('cable3dSelectProduct');
        if (!sel) return;

        sel.innerHTML = '<option value="aggregate">🌟 Combined Aggregate Cable (All Specs)</option>';

        const optGroupPresets = document.createElement('optgroup');
        optGroupPresets.label = 'Standard Engineering Models';
        STANDARD_PRESETS.slice(1).forEach(p => {
            const opt = document.createElement('option');
            opt.value = 'preset_' + p.id;
            opt.textContent = p.name;
            optGroupPresets.appendChild(opt);
        });
        sel.appendChild(optGroupPresets);

        if (topCables && topCables.length > 0) {
            const optGroupData = document.createElement('optgroup');
            optGroupData.label = `Actual Work Order Cables (${topCables.length} Cables)`;
            topCables.slice(0, 40).forEach((c, idx) => {
                const opt = document.createElement('option');
                opt.value = 'data_' + idx;
                opt.textContent = `#${idx + 1} [${c.length.toLocaleString()} m] - ${c.cable}`;
                optGroupData.appendChild(opt);
            });
            sel.appendChild(optGroupData);
        }
    }

    function handleCableSelectChange() {
        const sel = document.getElementById('cable3dSelectProduct');
        if (!sel) return;
        const val = sel.value;

        if (val === 'aggregate') {
            const stats = computeAggregates(activeData);
            const topCable = stats.topCables[0];
            const dominantSpec = topCable
                ? parseCableToSpec(topCable.cable, topCable.size, topCable.mat, topCable.familyid)
                : STANDARD_PRESETS[0];
            dominantSpec.id = 'aggregate';
            dominantSpec.name = `🌟 Aggregate Cable (${stats.totalLength.toLocaleString()} m)`;
            buildCableModel(dominantSpec);
        } else if (val.startsWith('preset_')) {
            const pid = val.replace('preset_', '');
            const preset = STANDARD_PRESETS.find(p => p.id === pid);
            if (preset) buildCableModel(preset);
        } else if (val.startsWith('data_')) {
            const idx = parseInt(val.replace('data_', ''), 10);
            const stats = computeAggregates(activeData);
            const c = stats.topCables[idx];
            if (c) {
                const spec = parseCableToSpec(c.cable, c.size, c.mat, c.familyid);
                spec.metersProduced = c.length;
                spec.weightProduced = c.weight;
                spec.ordersProduced = c.orders;
                buildCableModel(spec);
            }
        }
    }

    function renderTopCablesList(topList) {
        const container = document.getElementById('cable3dTopCablesList');
        if (!container) return;

        if (!topList || topList.length === 0) {
            container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">لا توجد كابلات مسجلة في هذا النطاق.</div>';
            return;
        }

        container.innerHTML = '';
        topList.forEach((c, i) => {
            const card = document.createElement('div');
            card.className = 'top-cable-item';
            card.onclick = () => {
                const spec = parseCableToSpec(c.cable, c.size, c.mat, c.familyid);
                spec.metersProduced = c.length;
                spec.weightProduced = c.weight;
                spec.ordersProduced = c.orders;
                buildCableModel(spec);
                // Sync select dropdown
                const sel = document.getElementById('cable3dSelectProduct');
                if (sel) sel.value = 'data_' + i;
            };

            const matBadgeClass = (c.mat === 'CU') ? 'cu-badge' : 'al-badge';
            card.innerHTML = `
                <div class="top-cable-rank">#${i + 1}</div>
                <div class="top-cable-info">
                    <div class="top-cable-name" title="${c.cable}">${c.cable}</div>
                    <div class="top-cable-meta">
                        <span class="cable-mat-pill ${matBadgeClass}">${c.mat || 'AL'}</span>
                        <span class="cable-meta-len">⚡ <strong>${c.length.toLocaleString()}</strong> m</span>
                        <span class="cable-meta-wt">⚖️ <strong>${Math.round(c.weight / 1000)}</strong> tons</span>
                        <span class="cable-meta-ord">📦 ${c.orders} Orders</span>
                    </div>
                </div>
                <button class="btn-inspect-3d" title="Inspect this cable in 3D">
                    👁️ 3D
                </button>
            `;
            container.appendChild(card);
        });
    }

    function renderActiveSpecCard() {
        const spec = currentSpec || STANDARD_PRESETS[0];

        const elTitle = document.getElementById('activeSpecTitle');
        const elVolt = document.getElementById('activeSpecVoltage');
        const elCond = document.getElementById('activeSpecConductor');
        const elIns = document.getElementById('activeSpecInsulation');
        const elArm = document.getElementById('activeSpecArmour');
        const elSheath = document.getElementById('activeSpecSheath');
        const elProduced = document.getElementById('activeSpecProduced');

        if (elTitle) elTitle.textContent = spec.name || 'Cable Specification';
        if (elVolt) elVolt.textContent = spec.voltage || '0.6/1 KV';
        if (elCond) elCond.textContent = `${spec.cores || 1} قلب × ${spec.size || '-'} (${spec.mat === 'CU' ? 'نحاس مجدول CU' : 'ألومنيوم مجدول AL'})`;
        if (elIns) elIns.textContent = spec.isBare ? 'بدون عزل (موصل هوائي)' : `${spec.insulation || 'XLPE'} عالي المتانة`;
        if (elArm) {
            elArm.textContent = spec.armour === 'STA'
                ? 'شريط صلب مجلفن مزدوج (STA)'
                : (spec.armour === 'SWA' ? 'أسلاك صلب مجلفنة دائرية (SWA)' : 'بدون تسليح (Unarmoured)');
        }
        if (elSheath) {
            elSheath.textContent = spec.isBare ? 'بدون غلاف خارجي' : `${spec.voltage && spec.voltage.includes('KV') && !spec.voltage.includes('0.6') ? 'HDPE أحمر' : 'PVC أسود'} مقاوم للأشعة فوق البنفسجية`;
        }

        if (elProduced) {
            if (spec.metersProduced) {
                elProduced.innerHTML = `إنتاج هذا الكابل في الفترة: <strong>${spec.metersProduced.toLocaleString()} متر</strong> (${(spec.weightProduced / 1000).toFixed(1)} طن / ${spec.ordersProduced} أمر)`;
            } else {
                const stats = computeAggregates(activeData);
                elProduced.innerHTML = `إجمالي إنتاج الكابلات في الفترة الحالية: <strong>${stats.totalLength.toLocaleString()} متر</strong>`;
            }
        }
    }

    // Toggle Fullscreen modal view of 3D Canvas
    function toggleFullscreen() {
        const sec = document.getElementById('cable3dSection');
        if (!sec) return;
        sec.classList.toggle('is-fullscreen');
        const isFull = sec.classList.contains('is-fullscreen');
        document.body.style.overflow = isFull ? 'hidden' : '';

        const btn = document.getElementById('btnToggleFullscreen');
        if (btn) {
            btn.innerHTML = isFull
                ? '<span class="icon">✖</span> تصغير'
                : '<span class="icon">⛶</span> ملء الشاشة';
        }
        setTimeout(handleResize, 100);
    }

    // Expose Global Functions for UI Hooks
    window.initCable3D = initCable3D;
    window.updateCable3D = updateCable3D;
    window.setExplodeProgress = setExplodeProgress;
    window.toggleAutoRotate = toggleAutoRotate;
    window.setCameraView = setCameraView;
    window.resetCamera = resetCamera;
    window.toggleFullscreen = toggleFullscreen;
    window.handleCableSelectChange = handleCableSelectChange;

})();
