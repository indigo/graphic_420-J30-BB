import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';

// ============================================================
//  Session 2 — Pipeline de Transformation Vertex
//
//  Étapes 1-3 (Local, World, View) :
//    Scène 3D complète : cube + caméra + frustum
//    Ces espaces sont intuitifs → visualisation 3D
//
//  Étapes 4-6 (Clip, NDC, Screen) :
//    Diagrammes simplifiés : juste le frustum/box + les 3 dots
//    Pas de mesh — ces espaces sont mathématiques
// ============================================================

// ------------------------------------------------------------
//  Configuration
// ------------------------------------------------------------
const SCREEN_W = 1280;
const SCREEN_H = 720;
const CAM_FOV = 50;
const CAM_NEAR = 0.5;
const CAM_FAR = 50;
const CAM_POS = new THREE.Vector3(3, 2.5, 4.5);
const CAM_TARGET = new THREE.Vector3(0.5, 0.3, 0);  // vise le cube

const MODEL_POS = new THREE.Vector3(0.5, 0.3, 0);
const MODEL_ROT_Y = THREE.MathUtils.degToRad(30);

// Matrices
const M = new THREE.Matrix4();
const V = new THREE.Matrix4();
const P = new THREE.Matrix4();
const VM = new THREE.Matrix4();
const PVM = new THREE.Matrix4();

function computeMatrices() {
    M.makeRotationY(MODEL_ROT_Y);
    M.setPosition(MODEL_POS);

    // Caméra de pipeline — source des matrices V et P
    const pipeCam = new THREE.PerspectiveCamera(CAM_FOV, SCREEN_W / SCREEN_H, CAM_NEAR, CAM_FAR);
    pipeCam.position.copy(CAM_POS);
    pipeCam.lookAt(CAM_TARGET);
    pipeCam.updateMatrixWorld();
    pipeCam.updateProjectionMatrix();

    // V = view matrix (monde → vue caméra)
    V.copy(pipeCam.matrixWorldInverse);

    // P = projection matrix (extraite de la caméra)
    // NB : Matrix4.makePerspective() attend (left, right, top, bottom, near, far),
    // PAS (fov, aspect, near, far). On utilise donc la projectionMatrix de la caméra.
    P.copy(pipeCam.projectionMatrix);

    VM.multiplyMatrices(V, M);
    PVM.multiplyMatrices(P, VM);
}
computeMatrices();

// ------------------------------------------------------------
//  Les 3 sommets suivis (verts du cube)
// ------------------------------------------------------------
const TRACKED_VERTICES = [
    { local: new THREE.Vector4( 0.5,  0.5,  0.5, 1), color: 0xe05050, name: 'A (coin +++)' },
    { local: new THREE.Vector4( 0.5, -0.5, -0.5, 1), color: 0x50e050, name: 'B (coin +--)' },
    { local: new THREE.Vector4(-0.5, -0.5,  0.5, 1), color: 0x5080f0, name: 'C (coin -+)' },
];

// ------------------------------------------------------------
//  Transformation
// ------------------------------------------------------------
function transformVertex(v, space) {
    const out = v.clone();
    if (space === 'local') return out;
    if (space === 'world') return out.applyMatrix4(M);
    if (space === 'view') return out.applyMatrix4(VM);
    if (space === 'clip') return out.applyMatrix4(PVM);
    if (space === 'ndc') {
        const clip = out.applyMatrix4(PVM);
        return new THREE.Vector4(clip.x / clip.w, clip.y / clip.w, clip.z / clip.w, 1);
    }
    if (space === 'screen') {
        const clip = out.applyMatrix4(PVM);
        const ndc = new THREE.Vector4(clip.x / clip.w, clip.y / clip.w, clip.z / clip.w, 1);
        return new THREE.Vector4(
            (ndc.x + 1) / 2 * SCREEN_W,
            (ndc.y + 1) / 2 * SCREEN_H,
            (ndc.z + 1) / 2, 1
        );
    }
    return out;
}

// ------------------------------------------------------------
//  Étapes
// ------------------------------------------------------------
const STEPS = [
    {
        title: '1. Espace Local',
        short: 'Local',
        desc: "Les sommets sont dans les coordonnées de l'objet. L'origine (0,0,0) est au centre du cube. L'artiste modélise ici — indépendant de la scène.",
        matrixLabel: '',
        space: 'local',
    },
    {
        title: '2. Espace Monde',
        short: 'World',
        desc: "La matrice M (rotation + translation) place le cube dans la scène. La caméra apparaît avec son frustum — ce qu'elle peut voir.",
        matrixLabel: 'M',
        space: 'world',
    },
    {
        title: '3. Espace Caméra',
        short: 'View',
        desc: "La matrice V recentre le monde sur la caméra : elle devient l'origine, regardant vers -Z. Le cube a bougé parce que le MONDE a tourné autour d'elle.",
        matrixLabel: 'V',
        space: 'view',
    },
    {
        title: '4. Espace Clip',
        short: 'Clip',
        desc: "La matrice P projette en 4D (x, y, z, w). La pyramide (frustum) est transformée en cube. Les coordonnées sont 4D — w stocke la profondeur (distance à la caméra). C'est l'espace où le GPU 'clip' (supprime) ce qui est hors du cube. La pyramide fanée montre l'ancien espace ; le cube montre le nouveau.",
        matrixLabel: 'P',
        space: 'clip',
    },
    {
        title: '5. NDC (après ÷w)',
        short: 'NDC',
        desc: "La pyramide a disparu. On divise x, y, z par w → tout rentre dans le cube [-1, 1]³. Les points lointains (grand w) se rapprochent du centre : c'est l'effet de perspective. Comparez avec l'étape précédente : les dots étaient dans la pyramide, ils sont maintenant dans le cube.",
        matrixLabel: '÷w',
        space: 'ndc',
    },
    {
        title: '6. Espace Écran',
        short: 'Screen',
        desc: "NDC [-1,1] remappé en pixels [0, 1280] × [0, 720]. Le sommet devient un pixel — prêt pour la rasterisation.",
        matrixLabel: 'remap',
        space: 'screen',
    },
];

let currentStep = 0;

// ------------------------------------------------------------
//  Three.js
// ------------------------------------------------------------
let renderer, scene, camera, controls;

// Scène 3D (étapes 1-3)
let cubeGroup;         // cube + bounding box + dots
let frustumGroup;      // caméra + frustum + screen (toujours ensemble)
let gridHelper, axesHelper;

// Diagramme simplifié (étapes 4-6)
let diagGroup;         // contient le box/frustum simplifié + les 3 dots
let diagBox;           // cube [-1,1]
let diagDots = [];     // les 3 dots pour le diagramme

// Screen 2D (étape 6)
let screenGroup;
let screenDots = [];

function initThree() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    const vp = document.getElementById('viewport');
    renderer.setSize(vp.clientWidth, vp.clientHeight);
    renderer.setClearColor(0x0d0d1a);
    vp.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(50, vp.clientWidth / vp.clientHeight, 0.1, 200);
    camera.position.set(5, 4, 7);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    // Lumières
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    // ===== GROUPE 3D (étapes 1-3) =====

    // Grille (visible seulement en local/world)
    gridHelper = new THREE.GridHelper(10, 10, 0x2a2a4a, 0x1a1a2e);
    gridHelper.position.y = -1;
    scene.add(gridHelper);

    // Axes
    axesHelper = new THREE.AxesHelper(2);
    scene.add(axesHelper);

    // Cube + bbox + dots (groupe, transformé par matrix)
    cubeGroup = new THREE.Group();

    // Cube solide
    const cube = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x607080, flatShading: true })
    );
    cubeGroup.add(cube);

    // Bounding box wireframe
    const bbEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1.1, 1.1, 1.1)),
        new THREE.LineBasicMaterial({ color: 0x60a060 })
    );
    cubeGroup.add(bbEdges);

    // Dots (enfants du groupe → suivent le cube)
    TRACKED_VERTICES.forEach((tv) => {
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 16, 16),
            new THREE.MeshBasicMaterial({ color: tv.color })
        );
        dot.position.set(tv.local.x, tv.local.y, tv.local.z);
        cubeGroup.add(dot);
    });

    scene.add(cubeGroup);

    // ===== GROUPE CAMÉRA + FRUSTUM + ÉCRAN (étapes 1-3) =====
    frustumGroup = new THREE.Group();

    // Icône caméra : corps + lentille
    const camBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.25, 0.25),
        new THREE.MeshBasicMaterial({ color: 0x40c0ff })
    );
    const camLens = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 0.4, 16),
        new THREE.MeshBasicMaterial({ color: 0x60d0ff })
    );
    camLens.rotation.x = Math.PI / 2;
    camLens.position.z = -0.35;
    const camIcon = new THREE.Group();
    camIcon.add(camBody);
    camIcon.add(camLens);

    // Frustum : lignes du frustum (8 coins, 12 arêtes + 4 lignes caméra)
    const frustumLines = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x40c0ff, transparent: true, opacity: 0.7 })
    );

    // Screen : quad au near plane
    const nearHalfH = Math.tan(THREE.MathUtils.degToRad(CAM_FOV) / 2) * CAM_NEAR;
    const nearHalfW = nearHalfH * (SCREEN_W / SCREEN_H);
    const screenQuad = new THREE.Mesh(
        new THREE.PlaneGeometry(nearHalfW * 2, nearHalfH * 2),
        new THREE.MeshBasicMaterial({ color: 0x152030, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
    );
    screenQuad.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(nearHalfW * 2, nearHalfH * 2)),
        new THREE.LineBasicMaterial({ color: 0x60d0ff })
    ));

    frustumGroup.add(camIcon);
    frustumGroup.add(frustumLines);
    frustumGroup.add(screenQuad);
    frustumGroup.userData = { camIcon, frustumLines, screenQuad };
    scene.add(frustumGroup);

    // ===== GROUPE DIAGRAMME (étapes 4-6) =====
    diagGroup = new THREE.Group();

    // Box [-1,1] (le frustum devient un cube en clip/NDC)
    diagBox = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)),
        new THREE.LineBasicMaterial({ color: 0x40c0ff, transparent: true, opacity: 0.5 })
    );
    diagGroup.add(diagBox);

    // Dots pour le diagramme
    TRACKED_VERTICES.forEach((tv) => {
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 16, 16),
            new THREE.MeshBasicMaterial({ color: tv.color })
        );
        // Les diagDots sont ajoutés à la scène directement (pas à diagGroup)
        // pour pouvoir être visibles indépendamment du box
        dot.visible = false;
        scene.add(dot);
        diagDots.push(dot);
    });

    diagGroup.visible = false;
    scene.add(diagGroup);

    // ===== GROUPE ÉCRAN 2D (étape 6) =====
    screenGroup = new THREE.Group();
    const screenBg = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 4.5),
        new THREE.MeshBasicMaterial({ color: 0x101020, side: THREE.DoubleSide })
    );
    screenBg.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(8, 4.5)),
        new THREE.LineBasicMaterial({ color: 0x60d0ff, linewidth: 2 })
    ));
    screenGroup.add(screenBg);

    TRACKED_VERTICES.forEach((tv) => {
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 16, 16),
            new THREE.MeshBasicMaterial({ color: tv.color })
        );
        screenGroup.add(dot);
        screenDots.push(dot);
    });

    screenGroup.visible = false;
    scene.add(screenGroup);

    window.addEventListener('resize', onResize);
    onResize();
}

// ------------------------------------------------------------
//  Construit le frustum dans un espace donné
// ------------------------------------------------------------
function buildFrustumGeometry(space) {
    const ndcCorners = [
        [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
        [-1,-1, 1],[1,-1, 1],[1,1, 1],[-1,1, 1],
    ];

    // Caméra de pipeline
    const pipeCam = new THREE.PerspectiveCamera(CAM_FOV, SCREEN_W / SCREEN_H, CAM_NEAR, CAM_FAR);
    pipeCam.position.copy(CAM_POS);
    pipeCam.lookAt(CAM_TARGET);
    pipeCam.updateMatrixWorld();
    pipeCam.updateProjectionMatrix();

    // NDC → world
    const invVP = new THREE.Matrix4();
    invVP.multiplyMatrices(pipeCam.matrixWorld, pipeCam.projectionMatrixInverse);
    const worldCorners = ndcCorners.map(([x,y,z]) =>
        new THREE.Vector3(x,y,z).applyMatrix4(invVP)
    );

    let corners, camPos;
    if (space === 'local' || space === 'world') {
        corners = worldCorners;
        camPos = CAM_POS.clone();
    } else if (space === 'view') {
        corners = worldCorners.map(c => {
            const v = new THREE.Vector4(c.x, c.y, c.z, 1).applyMatrix4(V);
            return new THREE.Vector3(v.x, v.y, v.z);
        });
        camPos = new THREE.Vector3(0, 0, 0);
    }

    const positions = [];
    const edges = [
        [0,1],[1,2],[2,3],[3,0],  // near
        [4,5],[5,6],[6,7],[7,4],  // far
        [0,4],[1,5],[2,6],[3,7],  // sides
    ];
    edges.forEach(([a,b]) => {
        positions.push(corners[a].x, corners[a].y, corners[a].z);
        positions.push(corners[b].x, corners[b].y, corners[b].z);
    });
    [0,1,2,3].forEach(i => {
        positions.push(camPos.x, camPos.y, camPos.z);
        positions.push(corners[i].x, corners[i].y, corners[i].z);
    });

    return { positions, camPos, corners };
}

// ------------------------------------------------------------
//  Mise à jour de la scène
// ------------------------------------------------------------
function updateScene() {
    const step = STEPS[currentStep];
    const space = step.space;

    // --- Cacher tout ---
    gridHelper.visible = false;
    axesHelper.visible = false;
    cubeGroup.visible = false;
    frustumGroup.visible = false;
    diagGroup.visible = false;
    screenGroup.visible = false;
    diagDots.forEach(d => d.visible = false);

    if (space === 'local') {
        // ===== ÉTAPE 1 : LOCAL =====
        // Juste le cube à l'origine. Rien d'autre. Clean.
        cubeGroup.visible = true;
        cubeGroup.matrixAutoUpdate = false;
        cubeGroup.matrix.identity();
        cubeGroup.matrixWorldNeedsUpdate = true;

        axesHelper.visible = true;

        camera.position.set(3, 2.5, 4);
        controls.target.set(0, 0, 0);

    } else if (space === 'world') {
        // ===== ÉTAPE 2 : WORLD =====
        // Cube transformé par M + caméra avec frustum
        cubeGroup.visible = true;
        cubeGroup.matrixAutoUpdate = false;
        cubeGroup.matrix.copy(M);
        cubeGroup.matrixWorldNeedsUpdate = true;

        frustumGroup.visible = true;
        frustumGroup.userData.frustumLines.material.opacity = 0.7;
        axesHelper.visible = true;
        gridHelper.visible = true;

        // Placer le frustum en world space
        setupFrustumWorld();

        camera.position.set(7, 5, 9);
        controls.target.set(0, 0, 0);

    } else if (space === 'view') {
        // ===== ÉTAPE 3 : VIEW =====
        // Caméra à l'origine. Cube transformé par VM.
        cubeGroup.visible = true;
        cubeGroup.matrixAutoUpdate = false;
        cubeGroup.matrix.copy(VM);
        cubeGroup.matrixWorldNeedsUpdate = true;

        frustumGroup.visible = true;
        axesHelper.visible = true;

        // Frustum opaque (plein état)
        frustumGroup.userData.frustumLines.material.opacity = 0.7;

        // Frustum en view space : caméra à l'origine
        setupFrustumView();

        camera.position.set(4, 3, 5);
        controls.target.set(0, 0, -2);

    } else if (space === 'clip') {
        // ===== ÉTAPE 4 : CLIP =====
        // Montrer la TRANSITION : le frustum (pyramide) devient un cube.
        // On montre BOTH : le frustum fané + le cube [-1,1] superposé.
        // Les dots sont à leurs positions view (dans la pyramide).
        // Le panneau montre les coords clip 4D (x,y,z,w).
        frustumGroup.visible = true;
        axesHelper.visible = true;
        setupFrustumView();

        // Rendre le frustum semi-transparent (c'est l'ancien espace)
        frustumGroup.userData.frustumLines.material.opacity = 0.25;

        // Montrer aussi le cube [-1,1] (le nouvel espace, après projection)
        diagGroup.visible = true;
        const scale = 1.5;
        diagBox.scale.setScalar(scale);
        diagBox.material.opacity = 0.8;

        // Dots à leurs positions VIEW (dans la pyramide, avant projection)
        TRACKED_VERTICES.forEach((tv, i) => {
            const viewPos = transformVertex(tv.local, 'view');
            diagDots[i].visible = true;
            diagDots[i].position.set(viewPos.x, viewPos.y, viewPos.z);
            diagDots[i].scale.setScalar(1);
        });

        camera.position.set(3, 2, 4);
        controls.target.set(0, 0, -2);

    } else if (space === 'ndc') {
        // ===== ÉTAPE 5 : NDC =====
        // La pyramide est GONE. Seul le cube [-1,1] reste.
        // Les dots sont maintenant DANS le cube (après ÷w).
        // Contraste avec clip : la pyramide a disparu, les dots ont bougé.
        diagGroup.visible = true;
        axesHelper.visible = true;

        const scale = 1.5;
        diagBox.scale.setScalar(scale);
        diagBox.material.opacity = 0.5;  // cube plus transparent

        TRACKED_VERTICES.forEach((tv, i) => {
            const ndc = transformVertex(tv.local, 'ndc');
            diagDots[i].visible = true;
            diagDots[i].position.set(
                ndc.x * scale,
                ndc.y * scale,
                ndc.z * scale
            );
            diagDots[i].scale.setScalar(1);
        });

        camera.position.set(4, 3, 4);
        controls.target.set(0, 0, 0);

    } else if (space === 'screen') {
        // ===== ÉTAPE 6 : SCREEN =====
        // 2D : rectangle + les 3 dots aux positions pixels
        screenGroup.visible = true;

        TRACKED_VERTICES.forEach((tv, i) => {
            const result = transformVertex(tv.local, 'screen');
            // Convertir pixels → coordonnées sur le quad (8×4.5)
            const u = result.x / SCREEN_W;   // [0,1]
            const v = result.y / SCREEN_H;   // [0,1]
            screenDots[i].position.set(
                (u - 0.5) * 8,
                -(v - 0.5) * 4.5,  // Y inversé (écran Y vers le bas)
                0.1
            );
        });

        camera.position.set(0, 0, 8);
        controls.target.set(0, 0, 0);
    }

    controls.update();
}

// Positionne le frustumGroup en world space (étape 2)
function setupFrustumWorld() {
    const { camIcon, frustumLines, screenQuad } = frustumGroup.userData;

    // Positionner la caméra
    camIcon.position.copy(CAM_POS);
    camIcon.lookAt(CAM_TARGET);

    // Construire les lignes du frustum en world space
    const { positions } = buildFrustumGeometry('world');
    frustumLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    frustumLines.geometry.computeBoundingSphere();

    // Positionner l'écran au near plane
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
        new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(CAM_POS, CAM_TARGET, new THREE.Vector3(0,1,0))
        )
    );
    const nearCenter = CAM_POS.clone().add(forward.clone().multiplyScalar(CAM_NEAR));
    screenQuad.position.copy(nearCenter);
    screenQuad.lookAt(CAM_POS);  // face la caméra
}

// Positionne le frustumGroup en view space (étape 3)
function setupFrustumView() {
    const { camIcon, frustumLines, screenQuad } = frustumGroup.userData;

    // Caméra à l'origine, regardant vers -Z
    camIcon.position.set(0, 0, 0);
    camIcon.lookAt(new THREE.Vector3(0, 0, -1));

    // Frustum en view space
    const { positions } = buildFrustumGeometry('view');
    frustumLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    frustumLines.geometry.computeBoundingSphere();

    // Écran au near plane : z = -near
    const nearHalfH = Math.tan(THREE.MathUtils.degToRad(CAM_FOV) / 2) * CAM_NEAR;
    const nearHalfW = nearHalfH * (SCREEN_W / SCREEN_H);
    screenQuad.position.set(0, 0, -CAM_NEAR);
    screenQuad.lookAt(new THREE.Vector3(0, 0, 0));  // face la caméra (origine)
}

// ------------------------------------------------------------
//  Panneau latéral
// ------------------------------------------------------------
function updatePanel() {
    const step = STEPS[currentStep];

    document.getElementById('step-label').textContent = step.title;
    document.getElementById('step-sublabel').textContent = step.desc.split('.')[0] + '.';

    // Pipeline overview
    const pipeDiv = document.getElementById('pipeline');
    pipeDiv.innerHTML = '';
    STEPS.forEach((s, i) => {
        const el = document.createElement('div');
        el.className = 'pipe-step';
        if (i === currentStep) el.classList.add('active');
        else if (i < currentStep) el.classList.add('done');
        el.textContent = s.short;
        el.onclick = () => { currentStep = i; updateAll(); };
        pipeDiv.appendChild(el);
        if (i < STEPS.length - 1) {
            const arrow = document.createElement('div');
            arrow.className = 'pipe-arrow';
            arrow.textContent = '→';
            pipeDiv.appendChild(arrow);
        }
    });

    // Description
    document.querySelector('#description h3').textContent = step.title;
    document.getElementById('desc-text').innerHTML = step.desc;

    // Matrix
    const matDiv = document.getElementById('matrix-display');
    matDiv.innerHTML = '';

    let matrix = null;
    if (step.matrixLabel === 'M') matrix = M;
    else if (step.matrixLabel === 'V') matrix = V;
    else if (step.matrixLabel === 'P') matrix = P;

    if (matrix) {
        const label = document.createElement('div');
        label.className = 'matrix-label';
        label.textContent = step.matrixLabel + ' =';
        matDiv.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'matrix-grid';
        const e = matrix.elements;
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const cell = document.createElement('div');
                cell.className = 'matrix-cell';
                const val = e[col * 4 + row];
                if (Math.abs(val) < 0.001) { cell.classList.add('zero'); cell.textContent = '0'; }
                else if (Math.abs(val - 1) < 0.001) { cell.classList.add('one'); cell.textContent = '1'; }
                else { cell.textContent = val.toFixed(2); }
                grid.appendChild(cell);
            }
        }
        matDiv.appendChild(grid);
    } else if (step.matrixLabel === '÷w') {
        const label = document.createElement('div');
        label.className = 'matrix-label';
        label.innerHTML = 'p<sub>NDC</sub> = (x÷w, y÷w, z÷w)';
        matDiv.appendChild(label);
    } else if (step.matrixLabel === 'remap') {
        const label = document.createElement('div');
        label.className = 'matrix-label';
        label.innerHTML = '[−1,1] → [0, 1280] × [0, 720]';
        matDiv.appendChild(label);
    } else {
        const label = document.createElement('div');
        label.className = 'matrix-label';
        label.textContent = '(identité — pas de transformation)';
        matDiv.appendChild(label);
    }

    // Vertex coordinates
    const vertDiv = document.getElementById('vertices');
    vertDiv.innerHTML = '';

    TRACKED_VERTICES.forEach((tv) => {
        const prevSpace = currentStep > 0 ? STEPS[currentStep - 1].space : 'local';
        const input = transformVertex(tv.local, prevSpace);
        const output = transformVertex(tv.local, step.space);

        const card = document.createElement('div');
        card.className = 'vertex-card';
        const hexColor = '#' + tv.color.toString(16).padStart(6, '0');
        card.style.borderLeftColor = hexColor;

        const nameDiv = document.createElement('div');
        nameDiv.className = 'vname';
        nameDiv.style.color = hexColor;
        nameDiv.textContent = tv.name;
        card.appendChild(nameDiv);

        const row = document.createElement('div');
        row.className = 'vrow';

        const inputSpan = document.createElement('span');
        inputSpan.className = 'vcoords';
        if (step.space === 'clip' || prevSpace === 'clip') {
            inputSpan.innerHTML = `(${fmt(input.x)}, ${fmt(input.y)}, ${fmt(input.z)}, <span class="vw">w=${fmt(input.w)}</span>)`;
        } else {
            inputSpan.textContent = `(${fmt(input.x)}, ${fmt(input.y)}, ${fmt(input.z)})`;
        }
        row.appendChild(inputSpan);

        const arrow = document.createElement('span');
        arrow.className = 'varrow';
        arrow.textContent = ' → ';
        row.appendChild(arrow);

        const outputSpan = document.createElement('span');
        outputSpan.className = 'vcoords';
        if (step.space === 'clip') {
            outputSpan.innerHTML = `(${fmt(output.x)}, ${fmt(output.y)}, ${fmt(output.z)}, <span class="vw">w=${fmt(output.w)}</span>)`;
        } else if (step.space === 'screen') {
            outputSpan.innerHTML = `x=${Math.round(output.x)}px, y=${Math.round(output.y)}px`;
        } else {
            outputSpan.textContent = `(${fmt(output.x)}, ${fmt(output.y)}, ${fmt(output.z)})`;
        }
        row.appendChild(outputSpan);

        card.appendChild(row);
        vertDiv.appendChild(card);
    });

    // Perspective divide note
    document.getElementById('pdivide-note').style.display =
        (step.space === 'ndc' || step.space === 'clip') ? 'block' : 'none';

    // Nav
    document.getElementById('btn-prev').disabled = currentStep === 0;
    document.getElementById('btn-next').disabled = currentStep === STEPS.length - 1;
}

function fmt(n) {
    if (Math.abs(n) < 0.001) return '0.00';
    return n.toFixed(2);
}

// ------------------------------------------------------------
//  Navigation
// ------------------------------------------------------------
window.stepNext = function() {
    if (currentStep < STEPS.length - 1) { currentStep++; updateAll(); }
};
window.stepPrev = function() {
    if (currentStep > 0) { currentStep--; updateAll(); }
};

function updateAll() {
    updateScene();
    updatePanel();
}

// ------------------------------------------------------------
//  Resize & animation
// ------------------------------------------------------------
function onResize() {
    const vp = document.getElementById('viewport');
    camera.aspect = vp.clientWidth / vp.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(vp.clientWidth, vp.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// ------------------------------------------------------------
//  Init
// ------------------------------------------------------------
initThree();
updateAll();
animate();
