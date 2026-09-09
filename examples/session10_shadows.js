import * as THREE from 'three';
import { ShaderChunk } from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { CSM } from 'jsm/csm/CSM.js';
import { GUI } from 'https://unpkg.com/lil-gui@0.20.0/dist/lil-gui.esm.min.js';

// ============================================================
//  SESSION 10 — Shadow Mapping en Three.js
//
//  Démo interactive des concepts du cours :
//   - Partie 2 : les deux passes (shadow map preview en coin)
//   - Partie 3 : le shader d'ombre (géré par Three.js, visible
//                via la shadow map preview)
//   - Partie 4 : shadow acne / peter panning (réglage du bias)
//   - Partie 5 : PCF (filtre du bord de l'ombre)
//   - Partie 6 : VSM (variante d'ombre douce, flou de la shadow map)
//   - Partie 7 : CSM (cascades pour grandes scènes)
//   - Partie 8 : cube shadow maps (PointLight) vs 2D (SpotLight)
//   - Partie 11 : coût comparé des types de lumières (FPS)
// ============================================================

// ------------------------------------------------------------
//  Paramètres GUI
// ------------------------------------------------------------
const params = {
    lightType: 'directional',     // 'directional' | 'spot' | 'point'
    shadowEnabled: true,
    shadowMapSize: 2048,          // 512 | 1024 | 2048 | 4096
    bias: 0.0005,                 // depth bias (acne / peter panning)
    normalBias: 0.02,             // normal offset bias
    pcf: 'PCFSoft',               // 'Basic' | 'PCF' | 'PCFSoft' | 'VSM'
    useCSM: false,                // cascaded shadow maps (directional only)
    cascadeCount: 4,              // nombre de cascades
    sunAzimuth: 45,               // angle horizontal du soleil (degrés)
    sunElevation: 50,             // angle vertical du soleil (degrés)
    animatePlayer: true,          // anime la capsule pour prouver le temps réel
    groundSize: 'small',          // 'small' | 'large' (pour démo CSM)
    showShadowMap: true,          // affiche la shadow map en coin
    showAcne: false,              // helper : met bias à 0 + shadowMap 512
    showPeterPan: false,          // helper : met bias à 0.05
};

// ------------------------------------------------------------
//  Three.js — Scène, caméra, rendu
// ------------------------------------------------------------
let renderer, scene, camera, controls;
let sun, spot, point;             // les trois lumières (une active à la fois)
let ground, cube, capsule, crate, farCubes;
let activeLight = null;
let csm = null;                   // Cascaded Shadow Maps
let clock = new THREE.Clock();
let playerAngle = 0;

// Shadow map preview (rend la depth texture dans un coin)
let smPreviewMesh, smPreviewScene, smPreviewCamera, smPreviewRT;

// FPS
let fpsEl = document.getElementById('fps');
let frameCount = 0;
let fpsTimer = 0;

init();
buildGUI();
animate();

// ============================================================
//  INIT
// ============================================================
function init() {
    // Renderer — active les shadow maps globalement
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;  // défaut doux
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.body.appendChild(renderer.domElement);

    // Scène
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88aacc);
    scene.fog = new THREE.Fog(0x88aacc, 30, 120);

    // Caméra
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.set(8, 6, 10);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.update();

    // Ambient (pour ne pas avoir du noir absolu dans les ombres)
    const ambient = new THREE.AmbientLight(0x404060, 0.4);
    scene.add(ambient);

    // Hemisphere (ciel/sol) — adoucit l'ensemble
    const hemi = new THREE.HemisphereLight(0xb0d0ff, 0x4a3520, 0.3);
    scene.add(hemi);

    // ============================================================
    //  Lumières — les trois types, on n'active que celle choisie
    // ============================================================
    // DirectionalLight (le soleil) — ombres orthographiques
    sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
    sun.position.set(10, 15, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(params.shadowMapSize, params.shadowMapSize);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 15;
    sun.shadow.camera.bottom = -15;
    sun.shadow.bias = params.bias;
    sun.shadow.normalBias = params.normalBias;
    scene.add(sun);
    scene.add(sun.target);

    // SpotLight — ombres en perspective (une seule direction)
    spot = new THREE.SpotLight(0xfff0d0, 80, 30, Math.PI / 4, 0.4, 1.5);
    spot.position.set(0, 12, 0);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(params.shadowMapSize, params.shadowMapSize);
    spot.shadow.camera.near = 1;
    spot.shadow.camera.far = 40;
    spot.shadow.bias = params.bias;
    spot.shadow.normalBias = params.normalBias;
    scene.add(spot);
    scene.add(spot.target);
    spot.visible = false;

    // PointLight — ombres omnidirectionnelles (cube shadow map, 6 faces)
    point = new THREE.PointLight(0xffd0a0, 60, 30, 1.5);
    point.position.set(0, 8, 0);
    point.castShadow = true;
    point.shadow.mapSize.set(params.shadowMapSize, params.shadowMapSize);
    point.shadow.camera.near = 1;
    point.shadow.camera.far = 40;
    point.shadow.bias = params.bias;
    point.shadow.normalBias = params.normalBias;
    scene.add(point);
    point.visible = false;

    activeLight = sun;

    // ============================================================
    //  Géométrie — sol, cube, capsule, caisse, cubes lointains
    // ============================================================
    const groundGeo = new THREE.PlaneGeometry(20, 20, 1, 1);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x9a9a8a,
        roughness: 0.95,
        metalness: 0.0,
    });
    ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Cube rouge
    const cubeGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const cubeMat = new THREE.MeshStandardMaterial({
        color: 0xc0392b,
        roughness: 0.6,
        metalness: 0.1,
    });
    cube = new THREE.Mesh(cubeGeo, cubeMat);
    cube.position.set(0, 0.75, 0);
    cube.castShadow = true;
    cube.receiveShadow = true;
    scene.add(cube);

    // Capsule (le "joueur") — animée pour prouver le temps réel
    const capsuleGeo = new THREE.CapsuleGeometry(0.5, 1.2, 8, 16);
    const capsuleMat = new THREE.MeshStandardMaterial({
        color: 0x2c6fb0,
        roughness: 0.5,
        metalness: 0.2,
    });
    capsule = new THREE.Mesh(capsuleGeo, capsuleMat);
    capsule.position.set(-3, 0.85, -1);
    capsule.castShadow = true;
    capsule.receiveShadow = true;
    scene.add(capsule);

    // Caisse orange
    const crateGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const crateMat = new THREE.MeshStandardMaterial({
        color: 0xe0921a,
        roughness: 0.7,
        metalness: 0.0,
    });
    crate = new THREE.Mesh(crateGeo, crateMat);
    crate.position.set(3, 0.6, 1.5);
    crate.rotation.y = 0.3;
    crate.castShadow = true;
    crate.receiveShadow = true;
    scene.add(crate);

    // Cubes lointains (pour démo CSM / shadow distance)
    farCubes = new THREE.Group();
    const farMat = new THREE.MeshStandardMaterial({
        color: 0x556677,
        roughness: 0.8,
        metalness: 0.0,
    });
    const positions = [
        [15, 1, 12], [22, 1.5, -8], [-18, 1, 14], [-25, 2, -10],
        [30, 1, 5], [-30, 1.5, 20], [12, 1, -25], [-15, 1, -22],
    ];
    positions.forEach(([x, h, z]) => {
        const g = new THREE.BoxGeometry(h * 1.5, h * 2, h * 1.5);
        const m = new THREE.Mesh(g, farMat);
        m.position.set(x, h, z);
        m.castShadow = true;
        m.receiveShadow = true;
        farCubes.add(m);
    });
    farCubes.visible = false;  // visible seulement en mode "large"
    scene.add(farCubes);

    // ============================================================
    //  Shadow map preview — affiche la depth texture en coin
    //  (illustre Partie 2 : ce que "voit" la lumière)
    // ============================================================
    smPreviewScene = new THREE.Scene();
    smPreviewCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const smPreviewMat = new THREE.MeshBasicMaterial({
        map: null,
        depthTest: false,
        depthWrite: false,
    });
    smPreviewMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        smPreviewMat
    );
    smPreviewMesh.frustumCulled = false;
    smPreviewScene.add(smPreviewMesh);

    // Resize
    window.addEventListener('resize', onResize);

    // Positionner le soleil selon les angles initiaux
    updateSunDirection();
}

// ============================================================
//  Position du soleil — azimuth (horizontal) + elevation (vertical)
//
//  L'angle de la lumière est crucial pour voir l'acne :
//  - une lumière rasante (basse elevation) maximise l'acne
//    car la profondeur varie vite sur la surface
//  - une lumière au zénith (haute elevation) minimise l'acne
// ============================================================
function updateSunDirection() {
    const az = THREE.MathUtils.degToRad(params.sunAzimuth);
    const el = THREE.MathUtils.degToRad(params.sunElevation);
    const dist = 30;
    // Position du soleil sur une sphère autour de la scène
    const x = dist * Math.cos(el) * Math.cos(az);
    const y = dist * Math.sin(el);
    const z = dist * Math.cos(el) * Math.sin(az);
    sun.position.set(x, y, z);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();

    // Mettre à jour le CSM si actif
    if (csm) {
        csm.lightDirection = new THREE.Vector3(-x, -y, -z).normalize();
        setupCSM();
    }
}

// ============================================================
//  CSM — Cascaded Shadow Maps (Partie 7)
//
//  ATTENTION : CSM._injectInclude() remplace GLOBALEMENT les
//  ShaderChunk.lights_fragment_begin et lights_pars_begin de Three.js.
//  Ni remove() ni dispose() ne les restaurent. Il faut sauvegarder
//  les originaux avant création et les restaurer après suppression,
//  sinon tous les matériaux rendent du noir/bleu (shader cassé).
// ============================================================
let _originalLightsFragmentBegin = null;
let _originalLightsParsBegin = null;

function setupCSM() {
    // --- Nettoyage de l'ancien CSM
    if (csm) {
        csm.dispose();   // nettoie les uniforms/materials
        csm.remove();    // retire les lumières de la scène
        csm = null;

        // Restaurer les shader chunks globaux de Three.js
        // (CSM les a remplacés et ne les restaure jamais)
        if (_originalLightsFragmentBegin) {
            ShaderChunk.lights_fragment_begin = _originalLightsFragmentBegin;
            _originalLightsFragmentBegin = null;
        }
        if (_originalLightsParsBegin) {
            ShaderChunk.lights_pars_begin = _originalLightsParsBegin;
            _originalLightsParsBegin = null;
        }

        // Forcer la recompilation de tous les matériaux avec les chunks d'origine
        scene.traverse(obj => {
            if (obj.material) {
                obj.material.needsUpdate = true;
            }
        });
    }

    if (params.useCSM && params.lightType === 'directional') {
        // Sauvegarder les shader chunks originaux AVANT que CSM ne les remplace
        _originalLightsFragmentBegin = ShaderChunk.lights_fragment_begin;
        _originalLightsParsBegin = ShaderChunk.lights_pars_begin;

        // CSM crée ses propres DirectionalLight — cacher le sun pour éviter
        // un double éclairage (sun + lumières CSM = sur-exposition)
        sun.visible = false;
        sun.castShadow = false;

        csm = new CSM({
            maxFar: params.groundSize === 'large' ? 200 : 60,
            shadowMapSize: params.shadowMapSize,
            shadowBias: params.bias,
            // NB : CSM ne supporte pas shadowNormalBias dans le constructeur ;
            // on le règle sur chaque lumière interne après création.
            lightDirection: new THREE.Vector3(-10, -15, -8).normalize(),
            lightColor: new THREE.Color(0xfff4e0),
            lightIntensity: 2.0,
            lightMargin: 50,           // marge autour du frustum (défaut 200 = trop grand)
            camera: camera,
            parent: scene,
            cascades: params.cascadeCount,
        });

        // Appliquer le normalBias sur chaque lumière interne de CSM
        csm.lights.forEach(light => {
            light.shadow.normalBias = params.normalBias;
        });

        // Les matériaux doivent être patchés pour supporter les cascades
        scene.traverse(obj => {
            if (obj.material) {
                csm.setupMaterial(obj.material);
                obj.material.needsUpdate = true;
            }
        });
    } else {
        // Restaurer le sun standard
        sun.visible = true;
        sun.castShadow = params.shadowEnabled;
    }
}

// ============================================================
//  GUI
// ============================================================
function buildGUI() {
    const gui = new GUI({ title: 'Shadow Mapping' });

    // ----- Type de lumière
    const lightFolder = gui.addFolder('Lumière');
    lightFolder.add(params, 'lightType', {
        'Directionnelle (soleil)': 'directional',
        'Spot (projecteur)': 'spot',
        'Point (ampoule)': 'point',
    }).name('Type').onChange(switchLight);
    lightFolder.add(params, 'shadowEnabled').name('Ombres activées').onChange(toggleShadows);

    // ----- Direction du soleil (angle de la lumière)
    // Crutial pour la démo d'acne : une lumière rasante = acne maximal
    const sunFolder = gui.addFolder('Direction du soleil');
    sunFolder.add(params, 'sunAzimuth', 0, 360, 1).name('Azimuth (°)')
        .onChange(updateSunDirection);
    sunFolder.add(params, 'sunElevation', 5, 90, 1).name('Élévation (°)')
        .onChange(updateSunDirection);

    // ----- Shadow map
    const mapFolder = gui.addFolder('Shadow Map');
    mapFolder.add(params, 'shadowMapSize', [512, 1024, 2048, 4096])
        .name('Résolution').onChange(updateShadowMapSize);
    mapFolder.add(params, 'pcf', {
        'Dure (Basic)': 'Basic',
        'PCF': 'PCF',
        'PCF Soft': 'PCFSoft',
        'VSM (flou)': 'VSM',
    }).name('Filtre').onChange(updatePCF);
    mapFolder.add(params, 'bias', 0, 0.05, 0.0001).name('Depth bias')
        .onChange(updateBias);
    mapFolder.add(params, 'normalBias', 0, 0.2, 0.001).name('Normal bias')
        .onChange(updateBias);

    // ----- CSM (Partie 7)
    const csmFolder = gui.addFolder('Cascaded Shadow Maps');
    csmFolder.add(params, 'useCSM').name('Activer CSM').onChange(() => {
        setupCSM();
    });
    csmFolder.add(params, 'cascadeCount', [2, 3, 4, 5]).name('Nb cascades').onChange(() => {
        if (params.useCSM) setupCSM();
    });

    // ----- Helpers pédagogiques
    const demoFolder = gui.addFolder('Démos rapides');
    demoFolder.add(params, 'showAcne').name('→ Montrer l\'acne').onChange(showAcne);
    demoFolder.add(params, 'showPeterPan').name('→ Montrer peter panning').onChange(showPeterPan);
    demoFolder.add(params, 'groundSize', {
        'Petite (20×20)': 'small',
        'Grande (200×200)': 'large',
    }).name('Taille du sol').onChange(updateGroundSize);
    demoFolder.add(params, 'showShadowMap').name('Preview shadow map');

    // ----- Animation
    const animFolder = gui.addFolder('Animation');
    animFolder.add(params, 'animatePlayer').name('Animer la capsule');
}

// ============================================================
//  CALLBACKS GUI
// ============================================================
function switchLight() {
    // Désactive le CSM proprement (restaure les matériaux) avant de changer
    if (csm) {
        params.useCSM = false;
        setupCSM();   // nettoie et restaure le sun
    }

    // Désactive toutes les lumières
    sun.visible = false;
    spot.visible = false;
    point.visible = false;

    switch (params.lightType) {
        case 'directional':
            sun.visible = true;
            activeLight = sun;
            break;
        case 'spot':
            spot.visible = true;
            activeLight = spot;
            break;
        case 'point':
            point.visible = true;
            activeLight = point;
            break;
    }
    applyShadowSettings();
}

function toggleShadows() {
    if (params.useCSM && params.lightType === 'directional') return; // CSM gère
    sun.castShadow = params.shadowEnabled;
    spot.castShadow = params.shadowEnabled;
    point.castShadow = params.shadowEnabled;
}

function updateShadowMapSize() {
    [sun, spot, point].forEach(light => {
        light.shadow.mapSize.set(params.shadowMapSize, params.shadowMapSize);
        // Force la recréation de la shadow map
        if (light.shadow.map) {
            light.shadow.map.dispose();
            light.shadow.map = null;
        }
    });
    // CSM a besoin d'être recréé pour changer la résolution de ses shadow maps
    // (pas d'API pour updater en place)
    if (params.useCSM) setupCSM();
}

function updatePCF() {
    switch (params.pcf) {
        case 'Basic':    renderer.shadowMap.type = THREE.BasicShadowMap;  break;
        case 'PCF':      renderer.shadowMap.type = THREE.PCFShadowMap;    break;
        case 'PCFSoft':  renderer.shadowMap.type = THREE.PCFSoftShadowMap; break;
        case 'VSM':      renderer.shadowMap.type = THREE.VSMShadowMap;    break;
    }
    // VSM nécessite des réglages différents sur chaque lumière
    [sun, spot, point].forEach(light => {
        if (params.pcf === 'VSM') {
            light.shadow.radius = 8;       // force du flou VSM
        } else {
            light.shadow.radius = 1;
        }
    });
    // Il faut recréer les shadow maps pour appliquer le type
    updateShadowMapSize();
}

function updateBias() {
    [sun, spot, point].forEach(light => {
        light.shadow.bias = params.bias;
        light.shadow.normalBias = params.normalBias;
    });
    // Met à jour les lumières CSM en place (sans tout recréer)
    if (csm) {
        csm.lights.forEach(light => {
            light.shadow.bias = params.bias;
            light.shadow.normalBias = params.normalBias;
        });
    }
}

function applyShadowSettings() {
    updateShadowMapSize();
    updateBias();
}

function showAcne(value) {
    if (!value) return;
    params.bias = 0;
    params.normalBias = 0;
    params.shadowMapSize = 512;
    params.pcf = 'Basic';
    guiUpdateFromParams();
    updateBias();
    updateShadowMapSize();
    updatePCF();
}

function showPeterPan(value) {
    if (!value) return;
    params.bias = 0.02;
    params.normalBias = 0;
    params.shadowMapSize = 2048;
    params.pcf = 'PCFSoft';
    guiUpdateFromParams();
    updateBias();
    updateShadowMapSize();
    updatePCF();
}

function updateGroundSize() {
    if (params.groundSize === 'large') {
        ground.scale.set(10, 10, 1);   // 20×10 = 200
        farCubes.visible = true;
        // Élargir le frustum d'ombre du soleil pour couvrir la grande scène
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        sun.shadow.camera.updateProjectionMatrix();
        controls.target.set(0, 1, 0);
        camera.position.set(30, 20, 40);
    } else {
        ground.scale.set(1, 1, 1);
        farCubes.visible = false;
        sun.shadow.camera.left = -15;
        sun.shadow.camera.right = 15;
        sun.shadow.camera.top = 15;
        sun.shadow.camera.bottom = -15;
        sun.shadow.camera.updateProjectionMatrix();
        camera.position.set(8, 6, 10);
    }
    if (params.useCSM) setupCSM();
    controls.update();
}

// Helper : met à jour l'affichage de la GUI après un changement programmatique
function guiUpdateFromParams() {
    document.querySelectorAll('.lil-gui').forEach(root => {
        root.querySelectorAll('input, select').forEach(el => {
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });
}

// ============================================================
//  ANIMATION
// ============================================================
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // Anime la capsule (prouve que les ombres sont temps réel)
    if (params.animatePlayer) {
        playerAngle += delta * 0.8;
        capsule.position.x = Math.cos(playerAngle) * 3.5;
        capsule.position.z = Math.sin(playerAngle) * 3.5;
        capsule.rotation.y = -playerAngle + Math.PI / 2;
    }

    // Met à jour le CSM (suit la caméra)
    if (csm) {
        csm.update();
    }

    // FPS
    frameCount++;
    fpsTimer += delta;
    if (fpsTimer >= 0.5) {
        const fps = Math.round(frameCount / fpsTimer);
        fpsEl.textContent = `${fps} FPS`;
        frameCount = 0;
        fpsTimer = 0;
    }

    controls.update();
    renderer.render(scene, camera);

    // ============================================================
    //  Shadow map preview — affiche la depth texture en coin
    //  (illustre Partie 2 : "ce que voit la lumière")
    // ============================================================
    const smLabel = document.getElementById('sm-label');
    if (params.showShadowMap && activeLight && activeLight.shadow && activeLight.shadow.map) {
        smLabel.style.display = 'block';
        const sm = activeLight.shadow.map;
        const smMat = smPreviewMesh.material;
        smMat.map = sm.texture;
        smMat.needsUpdate = true;

        // Rend la preview en scissor (coin bas-gauche)
        const pw = 256, ph = 256;
        const px = 10, py = 10;
        renderer.clearDepth();
        renderer.setScissorTest(true);
        renderer.setScissor(px, py, pw, ph);
        renderer.setViewport(px, py, pw, ph);
        renderer.render(smPreviewScene, smPreviewCamera);
        renderer.setScissorTest(false);
        // Restore full viewport
        renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    } else {
        smLabel.style.display = 'none';
    }
}

// ============================================================
//  RESIZE
// ============================================================
function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
