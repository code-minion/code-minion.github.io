import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Billboard } from './billboard.js';
import cvData from './cv-data.json';

// =============================================
// THE_WEBSITE_CORE — src/3d.js
// =============================================

let scene, camera, renderer, controls, loader;
let perspectiveCamera, orthographicCamera, isOrthographic = true;
let model, mixer, selectedObject = null;
let canvas, terminalContent, loadPct, loaderDiv, loadBar;
let originalMaterials = new Map();
let mainLight, ambientLight;

// Effects & Billboards
let codeMesh;
let codePresets = [], currentPreset = 0, lastPresetTime = 0;
let activeBillboards = [];

// ---- INITIALIZATION ----
function init() {
    // DOM initialization
    canvas = document.getElementById('three-canvas');
    terminalContent = document.getElementById('mesh-data');
    loadPct = document.getElementById('load-pct');
    loadBar = document.getElementById('load-pct-bar');
    loaderDiv = document.getElementById('loader');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050c14);
    scene.fog = new THREE.Fog(0x050c14, 200, 1000);

    // Camera
    // Perspective Camera
    perspectiveCamera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 1, 20000);
    perspectiveCamera.position.set(-3, 4.6, 27.4);

    // Orthographic Camera (for technical inspection)
    const aspect = window.innerWidth / window.innerHeight;
    const d = 10; // Adjusted frustum scale for standard viewing (×20 from original 0.5)
    orthographicCamera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 20000);
    orthographicCamera.position.set(-3, 4.6, 27.4);

    // Initial rotation (converted to radians)
    orthographicCamera.rotation.set(
        THREE.MathUtils.degToRad(-35),
        THREE.MathUtils.degToRad(-43),
        THREE.MathUtils.degToRad(-25)
    );

    camera = orthographicCamera;

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // For stylized models, ACES often desaturates. Disabling or using Linear keeps vibrancy.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2;
    
    // Desktop vs Mobile target verticality
    if (window.innerWidth <= 768) {
        controls.target.set(3.8, 0.2, 21.2); // Shifted down to match desktop Y but stayed right on X
    } else {
        controls.target.set(4.2, 0.2, 21.2);
    }
    controls.update();

    // Clamp User Controls
    controls.enablePan = false; // Disable right-hold-to-pan
    
    // Restrict zoom levels strictly to ±20% (distance for perspective, zoom for orthographic)
    const dist = camera.position.distanceTo(controls.target);
    controls.minDistance = dist * 0.8;
    controls.maxDistance = dist * 1.2;
    controls.minZoom = 0.8;
    controls.maxZoom = 1.2;

    // Severely restrict orbit rotation to a small cone (±15 degrees azimuth, ±10 degrees polar)
    const az = controls.getAzimuthalAngle();
    controls.minAzimuthAngle = az - 0.26;
    controls.maxAzimuthAngle = az + 0.26;
    
    const pol = controls.getPolarAngle();
    controls.minPolarAngle = Math.max(0, pol - 0.18);
    controls.maxPolarAngle = Math.min(Math.PI, pol + 0.18);

    // Lighting - Updated bounds via user test tuning
    ambientLight = new THREE.AmbientLight(0xffffff, 2.355);
    scene.add(ambientLight);

    mainLight = new THREE.DirectionalLight(0xffffff, 4.02);
    mainLight.position.set(-696, 288, -672);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.bias = 0;
    mainLight.shadow.normalBias = 0;
    mainLight.shadow.radius = 19.68;
    mainLight.shadow.blurSamples = 1;

    mainLight.shadow.camera.left = -20;
    mainLight.shadow.camera.right = 20;
    mainLight.shadow.camera.top = 20;
    mainLight.shadow.camera.bottom = -20;
    mainLight.shadow.camera.near = 1000;
    mainLight.shadow.camera.far = 1250;
    scene.add(mainLight);

    // Ground Plane
    const groundGeo = new THREE.CircleGeometry(400, 32);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x050c14, roughness: 0.8 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    // Load Model
    loadModel();

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('pointermove', onPointerMove);
    document.getElementById('clear-selection')?.addEventListener('click', clearSelection);
    document.getElementById('toggle-camera')?.addEventListener('click', toggleCamera);

    // Nav Interactivity
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            handleNavAction(item.getAttribute('data-action'));
        });
    });

    const mobNavItems = document.querySelectorAll('.mobile-nav-btn');
    mobNavItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            mobNavItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            handleNavAction(item.getAttribute('data-action'));
        });
    });

    document.getElementById('mobile-overlay-close')?.addEventListener('click', () => {
        document.getElementById('mobile-overlay-panel')?.classList.add('hidden');
    });

    if (isOrthographic) updateOrthographicFrustum();
    animate();
}

// ---- MODEL LOADING ----
function loadModel() {
    loader = new GLTFLoader();

    loader.load(
        './KIT_CHAN.glb',
        (gltf) => {
            model = gltf.scene;
            model.scale.setScalar(20); // Upscale: 1 unit → 20 units (≈ real-world metre scale)
            scene.add(model);

            // Centering and setup
            model.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center);
            model.position.y += size.y / 2;

            // Phase 1: Material Overrides
            model.traverse((node) => {
                // Hide Plane
                if (node.name === 'Plane') {
                    node.visible = false;
                    console.log('SYSTEM: Plane object hidden.');
                }

                // Code preset texturing
                if (node.isMesh && node.name.toLowerCase() === 'code_edit_here') {
                    codeMesh = node;
                    if (codePresets.length === 0) generateAllPresets();
                    node.material = new THREE.MeshBasicMaterial({
                        map: codePresets[0],
                        transparent: true,
                        opacity: 1.0
                    });
                }

                // MASH5 transparency tweak
                if (node.name.toLowerCase() === 'mash5_instancer_objects') {
                    node.traverse((child) => {
                        if (child.isMesh) {
                            child.material = new THREE.MeshBasicMaterial({
                                color: 0x888888,
                                transparent: true,
                                opacity: 0.3
                            });
                        }
                    });
                }
            });

            // Phase 2: Diagnostics & State Caching
            console.log('--- SCENE GRAPH DIAGNOSTICS ---');
            model.traverse((node) => {
                console.log(`[NODE] Name: '${node.name}' | Type: ${node.type}`);

                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                    // Cache the materials (now capturing our overrides instead of default placeholders)
                    originalMaterials.set(node.uuid, node.material.clone());
                }
            });

            // Animations
            const animList = document.getElementById('anim-list');
            if (gltf.animations && gltf.animations.length > 0) {
                console.log('--- ANIMATION DIAGNOSTICS ---');
                mixer = new THREE.AnimationMixer(model);
                
                // /* Disabled per user request - manual playback UI
                // if (animList) animList.innerHTML = ''; // clear empty message
                // */

                gltf.animations.forEach((clip) => {
                    console.log(`[ANIM] Clip: '${clip.name}' | Duration: ${clip.duration.toFixed(2)}s`);
                    
                    // Auto-play all animations (User requested to revert to this behavior)
                    mixer.clipAction(clip).play();

                    /* Disabled per user request - manual playback UI
                    if (!animList) return;
                    const btn = document.createElement('button');
                    btn.className = 'neon-btn';
                    btn.style.marginBottom = '5px';
                    btn.textContent = `PLAY: ${clip.name} (${clip.duration.toFixed(1)}s)`;
                    
                    btn.addEventListener('click', () => {
                        mixer.stopAllAction();
                        const action = mixer.clipAction(clip);
                        action.reset();
                        action.setLoop(THREE.LoopOnce, 1);
                        action.clampWhenFinished = true;
                        action.play();
                        console.log(`SYSTEM: Playing animation '${clip.name}' (Once)`);
                    });
                    
                    animList.appendChild(btn);
                    */
                });
            } else {
                if(animList) animList.innerHTML = '<p class="empty-msg">NO_ANIMATIONS_FOUND.</p>';
            }

            // Hide Loader
            loaderDiv.style.opacity = '0';
            setTimeout(() => loaderDiv.style.display = 'none', 500);
            console.log('SYSTEM: Model loaded and ready.');

            // Auto-spawn the home billboard so it's visible immediately on load
            handleNavAction('home');
        },
        (xhr) => {
            if (xhr.total > 0) {
                const pct = Math.min(100, Math.round((xhr.loaded / xhr.total) * 100));
                loadPct.textContent = `${pct}%`;
                loadBar.style.width = `${pct}%`;
            } else {
                // Handling case where total size is unknown
                loadPct.textContent = 'LOADING...';
                loadBar.style.width = '100%';
            }
        },
        (error) => {
            console.error('SYSTEM_ERROR:', error);
            if (terminalContent) terminalContent.innerHTML = `<p class="neon-pink">ERROR: ${error.message}</p>`;
        }
    );
}

// ---- INTERACTION / SELECTION ----
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isHoveringInteractive = false;

function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    if (!camera) return;
    raycaster.setFromCamera(mouse, camera);
    let hovered = false;

    // Clear previous hover states
    activeBillboards.forEach(b => { if (b.setHover) b.setHover(null); });

    // Check billboards first
    const billboardMeshes = activeBillboards.map(b => b.mesh);
    if (billboardMeshes.length > 0) {
        const billboardIntersects = raycaster.intersectObjects(billboardMeshes, false);
        if (billboardIntersects.length > 0) {
            const hit = billboardIntersects[0];
            const bb = hit.object.userData.billboard;
            if (bb) {
                if (bb.hitTest && hit.uv) {
                    const rowHit = bb.hitTest(hit.uv);
                    if (rowHit) {
                        hovered = true;
                        bb.setHover(rowHit.id);
                    }
                } else if (bb.onClick) {
                    hovered = true;
                }
            }
        }
    }

    // Check 3D model meshes
    if (!hovered && model) {
        const intersects = raycaster.intersectObjects(model.children, true);
        if (intersects.length > 0) {
            const obj = intersects[0].object;
            let curr = obj;
            while (curr) {
                if (curr.name && (curr.name.includes('Kit001') || curr.name.includes('Rig'))) {
                    hovered = true;
                    break;
                }
                curr = curr.parent;
            }
        }
    }

    if (hovered !== isHoveringInteractive) {
        isHoveringInteractive = hovered;
        document.body.style.cursor = hovered ? 'pointer' : 'default';
    }
}

function onCanvasClick(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Check billboards first
    const billboardMeshes = activeBillboards.map(b => b.mesh);
    const billboardIntersects = raycaster.intersectObjects(billboardMeshes, false);

    if (billboardIntersects.length > 0) {
        const hit    = billboardIntersects[0];
        const bb     = hit.object.userData.billboard;
        if (bb) {
            // Per-row hit test for TABLE billboards
            if (bb.hitTest && hit.uv) {
                const rowHit = bb.hitTest(hit.uv);
                if (rowHit) { window.open(`./project.html?id=${rowHit.id}`, '_blank'); return; }
            }
            if (bb.onClick) bb.onClick(bb.onClickData);
            return;
        }
    }

    const intersects = raycaster.intersectObjects(model.children, true);

    if (intersects.length > 0) {
        const object = intersects[0].object;
        selectObject(object);
    } else {
        clearSelection();
    }
}

function selectObject(obj) {
    if (!obj || selectedObject === obj) return;

    // Check if the object belongs to the main character
    let isCharacter = false;
    let curr = obj;
    while (curr) {
        if (curr.name && (curr.name.includes('Kit001') || curr.name.includes('Rig'))) {
            isCharacter = true;
            break;
        }
        curr = curr.parent;
    }

    if (isCharacter) {
        console.log(`INTERACTION: Triggered chat via [${obj.name || 'ANONYMOUS'}]`);
        const chatPanel = document.getElementById('chat-panel');
        if (chatPanel) {
            chatPanel.classList.add('open');
            document.getElementById('chat-input')?.focus();
        }
        // Deselect or do something else? We can just return or continue to wireframe it.
        // Let's clear selection so the inspector doesn't pop up for the character.
        clearSelection();
        return;
    }

    // Reset previous selection
    clearSelection();
    selectedObject = obj;

    console.log(`INTERACTION: Selected [${obj.name || 'ANONYMOUS'}]`);

    // WIREFRAME HIGHLIGHTING
    obj.traverse((node) => {
        if (node.isMesh && node.geometry) {
            // Apply a neon outline using EdgesGeometry
            const edges = new THREE.EdgesGeometry(node.geometry, 15);
            const line = new THREE.LineSegments(
                edges,
                new THREE.LineBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.8 })
            );
            line.isSelectionHelper = true;
            node.add(line);

            // Optionally dim the main material (visual polish)
            if (node.material) {
                node.material.transparent = true;
                node.material.opacity = 0.5;
            }
        }
    });

    displayObjectData(obj);
}

function clearSelection() {
    if (selectedObject) {
        selectedObject.traverse(node => {
            // Remove selection helpers
            const toRemove = [];
            node.children.forEach(child => {
                if (child.isSelectionHelper) toRemove.push(child);
            });
            toRemove.forEach(child => node.remove(child));

            // Restore materials
            if (node.isMesh && originalMaterials.has(node.uuid)) {
                const original = originalMaterials.get(node.uuid);
                node.material.copy(original);
            }
        });
    }
    selectedObject = null;
    if (terminalContent) terminalContent.innerHTML = `<p class="empty-msg">AWAITING_SELECTION... CLICK MODEL TO INSPECT MESH UNITS.</p>`;
}

function displayObjectData(obj) {
    if (!terminalContent) return;
    terminalContent.innerHTML = `
        <div class="attr-block">
            <span class="attr-label">UNIT_NAME:</span>
            <span class="attr-value">${obj.name || 'ANONYMOUS'}</span>
        </div>
        <div class="attr-block">
            <span class="attr-label">UNIT_TYPE:</span>
            <span class="attr-value">${obj.type}</span>
        </div>
        <div class="attr-block">
            <span class="attr-label">POS_X:</span>
            <span class="attr-value">${obj.position.x.toFixed(2)}</span>
        </div>
        <div class="attr-block">
            <span class="attr-label">POS_Y:</span>
            <span class="attr-value">${obj.position.y.toFixed(2)}</span>
        </div>
    `;
}

function clearBillboards() {
    activeBillboards.forEach(b => b.dispose());
    activeBillboards = [];
}

function spawnBillboard(content, position, options = {}) {
    const b = new Billboard({ content, position, ...options });
    scene.add(b.mesh);
    activeBillboards.push(b);
    return b;
}

// ---- NAVIGATION ACTIONS ----
function showMobileOverlay(title, action) {
    const panel = document.getElementById('mobile-overlay-panel');
    const contentBox = document.getElementById('mobile-overlay-content');
    const titleBox = document.getElementById('mobile-overlay-title');
    if (!panel || !contentBox) return;

    titleBox.textContent = title;
    let html = '';

    if (action === 'home') {
        html = `<h2>${cvData.contact.name}</h2><p>${cvData.summary}</p>`;
    } else if (action === 'projects') {
        html = cvData.projects.map(p => `
            <div class="mob-proj-row" onclick="window.open('./project.html?id=${p.id}', '_blank')">
                <span class="mob-proj-year">${p.year}</span>
                <span class="mob-proj-title">${p.title}</span>
                <span class="mob-proj-tags">${p.tags.join(', ')}</span>
            </div>
        `).join('');
    } else if (action === 'skills') {
        html = `<h2>Skills Matrix</h2><ul>` + cvData.skills.map(s => `<li><strong>${s.name}</strong>: ${s.proficiency}</li>`).join('') + `</ul>`;
    } else if (action === 'experience') {
        html = `<h2>Experience</h2><hr>` + cvData.experience.map(e => `
            <p><strong>${e.title} @ ${e.company}</strong><br>
            <span style="color:rgba(255,255,255,0.5)">${e.period}</span></p>
        `).join('<br>');
    } else if (action === 'contact') {
        const langs = cvData.languages.map(l => `<li><strong>${l.language}</strong>: ${l.level}</li>`).join('');
        html = `<h2>Establish Connection</h2>
                <p><strong>LinkedIn:</strong> <a href="https://${cvData.contact.linkedin}" target="_blank">${cvData.contact.linkedin}</a></p>
                <p><strong>Loc:</strong> ${cvData.contact.location}</p>
                <hr>
                <h2>Languages</h2>
                <ul>${langs}</ul>
                <hr>
                <p>You can also leave a message via my <strong>AI Assistant</strong> (click the chat icon!) and I will get back to you.</p>`;
    }

    contentBox.innerHTML = html;
    panel.classList.remove('hidden');
}

function handleNavAction(action) {
    console.log(`NAVIGATING_TO: ${action.toUpperCase()}`);

    if (action === 'cv') {
        window.location.href = './cv.html';
        return;
    }

    // Keep active state synchronized
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.getAttribute('data-action') === action));
    document.querySelectorAll('.mobile-nav-btn').forEach(i => i.classList.toggle('active', i.getAttribute('data-action') === action));

    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        if (action !== 'home') {
            showMobileOverlay(action.toUpperCase(), action);
        } else {
            document.getElementById('mobile-overlay-panel')?.classList.add('hidden');
        }
        clearBillboards();
        return;
    }

    clearBillboards();
    // Derive billboard world position from camera axes — guaranteed to be on-screen.
    // column 0 = camera right, column 1 = camera up, in world space.
    const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const basePos = controls.target.clone()
        .addScaledVector(camRight, 5.2)   // push right in screen space
        .addScaledVector(camUp, 1.5);

    const PW    = 4.0;   // panel width
    const PH    = 2.8;   // panel height
    const ROW_H = 1.0;   // unused for projects (now a single table)

    switch (action) {
        case 'home':
            controls.reset();
            camera.position.set(-3, 4.6, 27.4);
            controls.target.set(4.2, 0.2, 21.2);
            controls.update();
            camera.updateMatrixWorld();
            // Re-derive basePos now camera has moved to home position
            camRight.setFromMatrixColumn(camera.matrixWorld, 0);
            camUp.setFromMatrixColumn(camera.matrixWorld, 1);
            basePos.copy(controls.target).addScaledVector(camRight, 5.2).addScaledVector(camUp, 1.5);
            spawnBillboard(`# ${cvData.contact.name}\n\n${cvData.summary}\n\n---\nClick other nav options to explore.`, basePos, { width: PW, height: PH });
            break;
        case 'projects': {
            let tableContent = '## Projects (Click row for details)\nTABLE_HEADER|Year|Project|Tags\n';
            cvData.projects.forEach(proj => {
                tableContent += `TABLE_ROW|${proj.id}|${proj.year}|${proj.title}|${proj.tags.join(', ')}\n`;
            });
            spawnBillboard(tableContent, basePos, { width: PW, height: PH });
            break;
        }
        case 'skills': {
            const skillList = cvData.skills.map(s => `- **${s.name}**: ${s.proficiency}`).join('\n');
            spawnBillboard(`## Skills Matrix\n${skillList}`, basePos, { width: PW, height: PH });
            break;
        }
        case 'experience': {
            let expText = `## Experience\n---\n`;
            cvData.experience.forEach(e => {
                expText += `**${e.title} @ ${e.company}**\n${e.period}\n\n`;
            });
            spawnBillboard(expText, basePos, { width: PW, height: PH });
            break;
        }
        case 'contact': {
            const languages = cvData.languages.map(l => `- **${l.language}**: ${l.level}`).join('\n');
            spawnBillboard(`## Establish Connection\n\n**LinkedIn**: ${cvData.contact.linkedin}\n**Loc**: ${cvData.contact.location}\n\n---\n## Languages\n${languages}\n\n---\nYou can also leave a message via my **AI Assistant** (click the chat icon or the character) and I will get back to you.`, basePos, { 
                width: PW, 
                height: PH,
                onClick: () => window.open(`https://${cvData.contact.linkedin}`, '_blank')
            });
            break;
        }
        default:
            break;
    }
}

// ---- ENGINE LOOP ----
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function toggleCamera() {
    isOrthographic = !isOrthographic;

    // Transfer position and update target
    const oldCam = camera;
    camera = isOrthographic ? orthographicCamera : perspectiveCamera;

    camera.position.copy(oldCam.position);
    controls.object = camera;
    controls.update();

    if (isOrthographic) {
        updateOrthographicFrustum();
    }

    console.log(`SYSTEM: Camera swapped to ${isOrthographic ? 'ORTHOGRAPHIC' : 'PERSPECTIVE'}`);
}

function updateOrthographicFrustum() {
    if (!isOrthographic) return;
    const aspect = window.innerWidth / window.innerHeight;
    const distance = camera.position.distanceTo(controls.target);
    let d = distance * 0.4; // Scale frustum based on distance
    
    // If portrait mode, scale the vertical frustum to preserve horizontal subject bounds
    if (aspect < 1) {
        d = d / aspect;
        d = d * 0.8; // Zoom in by 20% specifically for mobile
    }

    camera.left = -d * aspect;
    camera.right = d * aspect;
    camera.top = d;
    camera.bottom = -d;
    camera.updateProjectionMatrix();
}

function updateCameraDebug() {
    const debug = document.getElementById('camera-debug');
    if (!debug) return;

    const pos = camera.position;
    const rot = camera.rotation;
    const tar = controls.target;

    // Euler angles converted to degrees for human readability
    const rx = THREE.MathUtils.radToDeg(rot.x).toFixed(0);
    const ry = THREE.MathUtils.radToDeg(rot.y).toFixed(0);
    const rz = THREE.MathUtils.radToDeg(rot.z).toFixed(0);

    debug.textContent = `CAM_POS: [${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}] | ROT: [${rx}°, ${ry}°, ${rz}°] | TARGET: [${tar.x.toFixed(2)}, ${tar.y.toFixed(2)}, ${tar.z.toFixed(2)}]`;
}

const timer = new THREE.Timer();

function animate(timestamp) {
    requestAnimationFrame(animate);

    // Update the timer
    timer.update(timestamp);
    const delta = timer.getDelta();

    if (mixer) mixer.update(delta);

    if (codeMesh && codePresets.length > 0) {
        if (timestamp - lastPresetTime > 3000) {
            currentPreset = (currentPreset + 1) % codePresets.length;
            codeMesh.material.map = codePresets[currentPreset];
            lastPresetTime = timestamp;
        }
    }

    activeBillboards.forEach(b => b.update(timestamp / 1000, camera));

    controls.update();

    if (isOrthographic) {
        updateOrthographicFrustum();
    }

    updateCameraDebug();
    renderer.render(scene, camera);
}

// CODE PRESET GENERATORS
function generateAllPresets() {
    codePresets = [
        createCodePreset(['#00d2ff', '#ffffff', '#00d2ff'], 0.8),
        createCodePreset(['#00ff7f', '#ffcc00', '#ffffff'], 0.8),
        createCodePreset(['#ff2d7e', '#00d2ff', '#ffffff'], 0.7)
    ];
}

function createCodePreset(palette, density) {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#02060a';
    ctx.fillRect(0, 0, size, size);

    for (let y = 25; y < size - 25; y += 12) {
        if (Math.random() > density) { y += 24; continue; }
        let x = 30 + Math.random() * 40;
        while (x < size - 50) {
            const width = 15 + Math.random() * 80;
            if (x + width > size - 50) break;
            const color = palette[Math.floor(Math.random() * palette.length)];
            ctx.fillStyle = color;
            ctx.fillRect(x, y, width, 8);
            x += width + (5 + Math.random() * 10);
            if (Math.random() > 0.85) break;
        }
    }
    return new THREE.CanvasTexture(canvas);
}

// START
init();
