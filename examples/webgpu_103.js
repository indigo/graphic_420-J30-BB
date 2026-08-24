// ===================== WEBGPU 103 =====================
// Simulation de tissu sur GPU avec le système Verlet.
//
// Inspiré de l'exemple officiel three.js : webgpu_compute_cloth.html
// Version simplifiée et pédagogique, avec commentaires détaillés en français.
//
// =========================================================================
// ARCHITECTURE GÉNÉRALE  (lisez ce schéma avant de plonger dans le code !)
// =========================================================================
//
// Le tissu est un réseau de masses (vertices) reliées par des ressorts.
// On utilise l'intégration de Verlet : la position courante + la position
// précédente suffisent à déduire la vélocité (pas besoin de stocker v).
//
//  ┌──────────────────────────────────────────────────────────────┐
//  │  CPU (init, une seule fois)                                  │
//  │   - génère la grille de vertices (31×31 = 961 points)        │
//  │   - génère les ressorts (horiz, vert, 2 diagonales ≈ 5800)   │
//  │   - remplit les storage buffers (positions, IDs, longueurs)  │
//  └──────────────────────────────────────────────────────────────┘
//                              │
//                              ▼
//  ┌──────────────────────────────────────────────────────────────┐
//  │  GPU — Compute shader #1 : FORCES DES RESSORTS               │
//  │   un thread par ressort (~5800 threads)                      │
//  │   F = k · (|d| - restLength) · d̂   (loi de Hooke)            │
//  │   → écrit dans springForceBuffer                              │
//  └──────────────────────────────────────────────────────────────┘
//                              │  (synchronisation implicite)
//                              ▼
//  ┌──────────────────────────────────────────────────────────────┐
//  │  GPU — Compute shader #2 : FORCES DES VERTICES               │
//  │   un thread par vertex (961 threads)                         │
//  │   - accumule les forces des ressorts connectés               │
//  │   - ajoute gravité + vent (bruit 3D)                         │
//  │   - collision avec sphère                                     │
//  │   - intégration Verlet : position += force                    │
//  │   → met à jour positionBuffer ET forceBuffer                  │
//  └──────────────────────────────────────────────────────────────┘
//                              │
//                              ▼
//  ┌──────────────────────────────────────────────────────────────┐
//  │  GPU — Vertex shader (rendu)                                  │
//  │   lit positionBuffer (storage buffer) pour placer chaque      │
//  │   vertex du mesh du tissu (moyenne de 4 vertices Verlet)      │
//  │   calcule la normale à partir des diagonales                  │
//  └──────────────────────────────────────────────────────────────┘
//
// =========================================================================
// POURQUOI WEBGPU ET PAS WEBGL POUR CET EXEMPLE ?
// =========================================================================
//
//  1. Compute shaders : WebGPU permet de lancer des kernels génériques
//     (pas juste vertex/fragment). On peut simuler la physique directement
//     sur le GPU sans repasser par le CPU à chaque frame.
//
//  2. Storage buffers : WebGPU a des buffers lisibles ET écrivables en
//     lecture aléatoire (par index). Le compute shader écrit les positions,
//     le vertex shader les lit — tout reste sur le GPU.
//
//  3. En WebGL, on devrait soit faire la physique sur CPU (lent pour
//     961 vertices × 240 Hz), soit utiliser des techniques détournées
//     (transform feedback, textures de données) qui sont complexes.
//
// =========================================================================
// CONCEPTS TSL ILLUSTRÉS (Three Shading Language)
// =========================================================================
//
//  - instancedArray(...)     : déclare un storage buffer GPU (tableau)
//  - .element( i )           : accès indexé à un élément du buffer (R/W)
//  - Fn( () => { ... } )()   : définit un "node" TSL (compute OU shader)
//  - .compute( N )           : transforme le node en kernel de N threads
//  - renderer.compute( node ): exécute le kernel (dispatch WebGPU)
//  - instanceIndex           : id du thread courant (0..N-1)
//  - If / Return / Loop      : contrôle de flux TSL (compilé vers WGSL)
//  - uniform( v )            : valeur globale CPU → GPU, modifiable en live
//  - select( cond, a, b )    : ternaire SANS branchement (a si cond, sinon b)
//  - triNoise3D( p, s, t )   : bruit 3D lisse (MaterialX) pour le vent
//  - transformNormalToView() : transforme une normale monde → espace vue
//  - .toVarying()            : passe une valeur du vertex au fragment shader
//  - .toVar( 'name' )        : déclare une variable locale mutable dans le shader
//  - .assign( v )            : écrit dans un élément de buffer (gauche d'affectation)

import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { EXRLoader } from 'jsm/loaders/EXRLoader.js';
import { GUI } from 'https://unpkg.com/lil-gui@0.20.0/dist/lil-gui.esm.min.js';
import {
    Fn, If, Return, Loop,
    instancedArray, instanceIndex, uniform,
    attribute, varying, vec3, vec4, float,
    select, cross, transformNormalToView,
    triNoise3D, time, hash
} from 'three/tsl';

// ============================================================
// PARAMÈTRES DE LA SIMULATION
// ============================================================
// Ces constantes définissent la résolution et la taille du tissu.
// Elles sont fixées au démarrage et ne changent pas pendant la sim.

const CLOTH_WIDTH       = 1;     // largeur du tissu (unités monde)
const CLOTH_HEIGHT      = 1;     // hauteur du tissu
const SEGMENTS_X        = 60;    // nombre de segments en X (→ 31 vertices par ligne)
const SEGMENTS_Y        = 60;    // nombre de segments en Y (→ 31 vertices par colonne)
const SPHERE_RADIUS     = 0.18;  // rayon de la sphère de collision
const STEPS_PER_SECOND  = 240;   // fréquence de simulation (Hz) — fixe, indépendante du FPS

// ============================================================
// PARAMÈTRES GUI (modifiables en live via l'interface)
// ============================================================
// Ces valeurs sont liées aux uniforms GPU. Quand on les change via la
// GUI, le GPU les utilise immédiatement à la prochaine frame.

const params = {
    stiffness: 0.25,        // raideur des ressorts (k) — plus élevé = tissu rigide
    wind: 1.0,              // intensité du vent (0 = calme, 5 = tempête)
    dampening: 0.99,        // amortissement vélocité (1 = aucun, 0.9 = beaucoup)
    showSphere: true,       // afficher la sphère de collision
    wireframe: false,       // mode wireframe (voir la structure du tissu)
    reset: resetSimulation  // fonction : remet le tissu à sa position initiale
};

// ============================================================
// VARIABLES GLOBALES
// ============================================================

let renderer, scene, camera, controls;
let clothMesh, clothMaterial, sphere;
let gui;

// --- Storage buffers (mémoire GPU partagée compute ↔ render) ---
// Ces buffers vivent sur la carte graphique. Le CPU les remplit une fois
// à l'init, puis les compute shaders les lisent/écrivent à chaque frame.
let vertexPositionBuffer;   // vec3 : position courante de chaque vertex Verlet
let vertexForceBuffer;      // vec3 : force accumulée (sert aussi de vélocité Verlet)
let vertexParamsBuffer;     // uvec3 : (isFixed, springCount, springPointer)
let springListBuffer;       // uint : liste aplatie des IDs de ressorts par vertex
let springVertexIdBuffer;   // uvec2 : les 2 IDs de vertices connectés par chaque ressort
let springRestLengthBuffer; // float : longueur au repos de chaque ressort
let springForceBuffer;      // vec3 : force calculée par ressort (sortie du compute #1)

// --- Compute nodes (les deux kernels) ---
let computeSpringForces;    // kernel #1 : un thread par ressort
let computeVertexForces;    // kernel #2 : un thread par vertex

// --- Uniforms (valeurs CPU → GPU modifiables en live) ---
// Un uniform est une petite valeur (scalaire, vec3, ...) partagée par
// TOUS les threads d'un même dispatch. Contrairement à un storage buffer,
// il est identique pour tous les threads. On change `.value` côté JS.
let dampeningUniform;       // amortissement de la vélocité
let spherePositionUniform;  // position de la sphère de collision (vec3)
let stiffnessUniform;       // raideur des ressorts (k)
let windUniform;            // intensité du vent

// --- Données Verlet côté CPU (pour construire les buffers) ---
// Ces tableaux JS sont temporaires : ils servent à construire la topologie
// du tissu (grille + ressorts) avant de l'envoyer au GPU. Après l'init,
// on n'y touche plus — toute la simulation se fait sur GPU.
const verletVertices = [];  // tous les vertices Verlet (961 au total)
const verletSprings  = [];  // tous les ressorts (~5800 au total)
const verletColumns  = [];  // grille 2D [x][y] pour accéder aux vertices

// --- Timer pour la simulation à pas fixe ---
const timer = new THREE.Timer();
let timeSinceLastStep = 0;
let timestamp = 0;

// ============================================================
// INITIALISATION
// ============================================================

init();

async function init() {
    // --- Renderer WebGPU ---
    // requiredLimits.maxStorageBuffersInVertexStage = 1 :
    // On a besoin de lire vertexPositionBuffer dans le VERTEX shader
    // (pour placer le mesh du tissu). Par défaut, certains drivers
    // WebGPU limitent le nombre de storage buffers accessibles depuis
    // le vertex stage. On demande explicitement au moins 1.
    //
    // await renderer.init() est OBLIGATOIRE avec WebGPU : le renderer
    // doit négocier avec le navigateur pour obtenir un adapter GPU.
    // En WebGL, c'était synchrone ; en WebGPU, c'est asynchrone.
    renderer = new THREE.WebGPURenderer({
        antialias: true,
        requiredLimits: { maxStorageBuffersInVertexStage: 1 }
    });
    await renderer.init();
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.body.appendChild(renderer.domElement);

    // Indiquer le backend réellement utilisé (WebGPU ou fallback WebGL2)
    const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2 (fallback)';
    document.getElementById('info').textContent =
        `WebGPU 103 — Tissu Verlet (${backend})`;

    // --- Scène & caméra ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111122);

    // Caméra perspective : fov 40°, near 0.01, far 10
    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 10);
    camera.position.set(-1.2, -0.2, -1.2);
    camera.lookAt(0, 0, 0);

    // OrbitControls : rotation/zoom avec la souris
    controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 0.8;
    controls.maxDistance = 3;
    controls.target.set(0, 0.1, 0);
    controls.enableDamping = true;  // amortissement pour un mouvement fluide
    controls.update();

    // --- Éclairage par environment map (IBL) ---
    // MeshPhysicalNodeMaterial est un matériau PBR : il a BESOIN de
    // lumière pour être visible. Au lieu d'utiliser des lumières
    // classiques (AmbientLight, DirectionalLight), on charge une HDR
    // environment map (fichier .exr depuis le dossier Blender).
    //
    // L'environment map sert à deux choses :
    //   1. scene.background : la HDR est visible derrière le tissu
    //   2. scene.environment : la HDR éclaire le tissu (IBL = Image Based
    //      Lighting). Le PBR utilise la HDR comme source de lumière pour
    //      calculer la réflexion diffuse ET spéculaire.
    //
    // EXRLoader charge le fichier .exr (format HDR open-source d'ILM,
    // utilisé par Blender). On utilise EquirectangularReflectionMapping
    // car la HDR est une image équirectangulaire (360°).
    const exrLoader = new EXRLoader();
    const envTexture = await exrLoader.loadAsync('textures/wooden-studio.exr');
    envTexture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = envTexture;
    scene.environment = envTexture;

    // --- Construction de la simulation (ordre important !) ---
    setupVerletGeometry();    // 1. générer vertices + ressorts (CPU)
    setupBuffers();           // 2. remplir les storage buffers (CPU → GPU)
    setupUniforms();          // 3. déclarer les uniforms
    setupComputeShaders();    // 4. définir les 2 compute kernels (TSL)
    setupSphere();            // 5. sphère de collision visible
    setupClothMesh();         // 6. mesh du tissu (lit le storage buffer)
    setupGUI();              // 7. interface de contrôle

    // --- Timer & resize ---
    timer.connect(document);
    window.addEventListener('resize', onWindowResize, false);

    // --- Lancement de la boucle d'animation ---
    // setAnimationLoop remplace requestAnimationFrame. Le renderer appelle
    // `animate` à chaque frame (60 Hz, 120 Hz, 144 Hz... selon l'écran).
    renderer.setAnimationLoop(animate);
}

// ============================================================
// 1. GÉOMÉTRIE VERLET  —  grille de vertices + ressorts
// ============================================================
//
// Le tissu est une grille 2D de "masses" (vertices Verlet) reliées par
// des "ressorts" (contraintes de distance). On construit cette topologie
// côté CPU, une seule fois, puis on l'envoie au GPU via des storage buffers.
//
// --- Qu'est-ce que l'intégration de Verlet ? ---
//
// Verlet est une méthode d'intégration numérique pour la physique.
// Au lieu de stocker position ET vélocité séparément, on ne stocke que
// la position courante et la position précédente. La vélocité est déduite :
//
//   vélocité ≈ position_courante - position_précédente
//
// Dans cette implémentation, on simplifie encore : le buffer `forceBuffer`
// accumule les forces d'une frame à l'autre et sert de vélocité. À chaque
// step, on fait : position += force (avec dt=1 et masse=1 implicites).
//
// --- Les 4 types de ressorts ---
//
//   ─── horizontal      (x-1, y)     : empêche l'étirement horizontal
//   │   vertical        (x, y-1)     : empêche l'étirement vertical
//   ╱   diagonale ╱     (x-1, y-1)   : empêche le cisaillement
//   ╲   diagonale ╲     (x-1, y+1)   : empêche le cisaillement (autre sens)
//
// Sans les diagonales, le tissu serait trop souple en cisaillement :
// il se déformerait en losange au lieu de rester rectangulaire.
//
//    v00 ─ v10
//    │ ╲ ╱ │
//    │  ╳  │      ← 4 ressorts par cellule (2 axes + 2 diagonales)
//    │ ╱ ╲ │
//    v01 ─ v11
//
// --- Les vertices "fixes" (points d'accroche) ---
//
// Les vertices marqués isFixed = true ne bougent JAMAIS pendant la sim.
// Ce sont les points où le tissu est "accroché". Ici, on fixe un vertex
// sur 5 sur la rangée du haut (y === 0) → le tissu pend comme un rideau.

function setupVerletGeometry() {
    // --- Fonction utilitaire : créer un vertex Verlet ---
    // Chaque vertex a :
    //   - id       : index unique (0, 1, 2, ...) utilisé dans les buffers GPU
    //   - position : position initiale (Vector3)
    //   - isFixed  : true si le vertex est immobile (point d'accroche)
    //   - springIds : liste des IDs de ressorts connectés à ce vertex
    const addVerletVertex = (x, y, z, isFixed) => {
        const id = verletVertices.length;
        const vertex = { id, position: new THREE.Vector3(x, y, z), isFixed, springIds: [] };
        verletVertices.push(vertex);
        return vertex;
    };

    // --- Fonction utilitaire : créer un ressort entre 2 vertices ---
    // Chaque ressort a :
    //   - id      : index unique
    //   - vertex0 : premier endpoint
    //   - vertex1 : second endpoint
    // On enregistre aussi le ressort dans la liste springIds de chaque
    // vertex (pour pouvoir itérer sur les ressorts d'un vertex donné).
    const addVerletSpring = (v0, v1) => {
        const id = verletSprings.length;
        const spring = { id, vertex0: v0, vertex1: v1 };
        v0.springIds.push(id);
        v1.springIds.push(id);
        verletSprings.push(spring);
        return spring;
    };

    // --- Étape 1 : créer la grille de vertices ---
    // x ∈ [-0.5, 0.5]  (largeur du tissu)
    // z ∈ [0, 1]       (hauteur du tissu, le tissu pend dans le sens -y)
    // y = 0.5          (le tissu commence en l'air, puis tombe)
    //
    // La grille fait (SEGMENTS_X+1) × (SEGMENTS_Y+1) = 31 × 31 = 961 vertices.
    for (let x = 0; x <= SEGMENTS_X; x++) {
        const column = [];
        for (let y = 0; y <= SEGMENTS_Y; y++) {
            const posX = x * (CLOTH_WIDTH / SEGMENTS_X) - CLOTH_WIDTH * 0.5;
            const posZ = y * (CLOTH_HEIGHT / SEGMENTS_Y);
            // Fixer un vertex sur 5 sur la rangée du haut (y === 0)
            // → le tissu est accroché à intervalles réguliers
            const isFixed = (y === 0) && ((x % 5) === 0);
            const vertex = addVerletVertex(posX, CLOTH_HEIGHT * 0.5, posZ, isFixed);
            column.push(vertex);
        }
        verletColumns.push(column);
    }

    // --- Étape 2 : créer les ressorts ---
    // Pour chaque vertex, on connecte vers la gauche (x-1), le bas (y-1),
    // et les deux diagonales. On évite les doublons en ne connectant que
    // vers des indices inférieurs (x-1, y-1, y+1).
    //
    // Résultat : ~5800 ressorts pour 961 vertices.
    for (let x = 0; x <= SEGMENTS_X; x++) {
        for (let y = 0; y <= SEGMENTS_Y; y++) {
            const v0 = verletColumns[x][y];
            if (x > 0) addVerletSpring(v0, verletColumns[x - 1][y]);              // horizontal ←
            if (y > 0) addVerletSpring(v0, verletColumns[x][y - 1]);              // vertical ↓
            if (x > 0 && y > 0) addVerletSpring(v0, verletColumns[x - 1][y - 1]); // diagonale ╱
            if (x > 0 && y < SEGMENTS_Y) addVerletSpring(v0, verletColumns[x - 1][y + 1]); // diagonale ╲
        }
    }
}

// ============================================================
// 2. STORAGE BUFFERS  —  transfert CPU → GPU
// ============================================================
//
// On remplit des TypedArrays (Float32Array, Uint32Array) côté CPU, puis
// on les passe à instancedArray(...) qui crée le storage buffer GPU
// correspondant. Une fois le buffer créé, le CPU n'y touche plus (sauf
// pour un reset) — les compute shaders gèrent tout.
//
// --- Layout mémoire des 7 buffers ---
//
//  vertexPositionBuffer   : [px0,py0,pz0, px1,py1,pz1, ...]   (vec3 × 961)
//  vertexForceBuffer      : [fx0,fy0,fz0, fx1,fy1,fz1, ...]   (vec3 × 961)
//  vertexParamsBuffer     : [isFixed0, count0, ptr0, ...]     (uvec3 × 961)
//  springListBuffer       : [sid, sid, sid, ...]              (uint, aplati)
//  springVertexIdBuffer   : [v0a,v1a, v0b,v1b, ...]           (uvec2 × ~5800)
//  springRestLengthBuffer : [len0, len1, ...]                 (float × ~5800)
//  springForceBuffer      : [fx0,fy0,fz0, ...]                (vec3 × ~5800)
//
// --- La structure CSR (Compressed Sparse Row) ---
//
// Le "springListBuffer" + "vertexParamsBuffer.z" (springPointer) forment
// une structure CSR, classique en algèbre linéaire creuse :
//
//   Pour le vertex i, ses ressorts sont à :
//     springListBuffer[ ptr_i .. ptr_i + count_i - 1 ]
//
//   Exemple :
//     vertex 0 : ptr=0,  count=2  → ressorts à springList[0..1]
//     vertex 1 : ptr=2,  count=4  → ressorts à springList[2..5]
//     vertex 2 : ptr=6,  count=3  → ressorts à springList[6..8]
//     ...
//
// Cela permet au compute shader #2 d'itérer efficacement sur les ressorts
// d'un vertex avec une simple boucle for. Sans CSR, il faudrait scanner
// tous les ressorts pour trouver ceux connectés à un vertex donné (O(M)
// par vertex au lieu de O(count_i)).

function setupBuffers() {
    const vertexCount = verletVertices.length;
    const springCount = verletSprings.length;

    // --- Données vertices ---
    const positionArray = new Float32Array(vertexCount * 3);
    const paramsArray   = new Uint32Array(vertexCount * 3);
    const springList    = [];

    for (let i = 0; i < vertexCount; i++) {
        const v = verletVertices[i];
        // Position initiale (sera écrasée par le compute shader)
        positionArray[i * 3]     = v.position.x;
        positionArray[i * 3 + 1] = v.position.y;
        positionArray[i * 3 + 2] = v.position.z;

        // Paramètres : (isFixed, springCount, springPointer)
        paramsArray[i * 3] = v.isFixed ? 1 : 0;
        if (!v.isFixed) {
            paramsArray[i * 3 + 1] = v.springIds.length;   // nombre de ressorts
            paramsArray[i * 3 + 2] = springList.length;     // offset dans springList
            // Ajouter les IDs de ressorts de ce vertex à la liste aplatie
            springList.push(...v.springIds);
        }
        // Les vertices fixes n'ont pas besoin de springCount/ptr
        // (le compute shader fait Return() immédiatement pour eux).
    }

    // --- Données ressorts ---
    const springVertexIdArray = new Uint32Array(springCount * 2);
    const springRestLengthArray = new Float32Array(springCount);

    for (let i = 0; i < springCount; i++) {
        const s = verletSprings[i];
        // Les 2 IDs de vertices connectés par ce ressort
        springVertexIdArray[i * 2]     = s.vertex0.id;
        springVertexIdArray[i * 2 + 1] = s.vertex1.id;
        // Longueur au repos = distance initiale entre les 2 vertices
        // (calculée une fois, ne change jamais)
        springRestLengthArray[i] = s.vertex0.position.distanceTo(s.vertex1.position);
    }

    // --- Création des storage buffers TSL ---
    // instancedArray( dataOrLength, 'type' ) crée un storage buffer.
    //  - dataOrLength : soit un TypedArray rempli, soit juste une longueur
    //  - 'type'       : type WGSL des éléments ('vec3', 'float', 'uint', ...)
    //
    // setPBO(true) : nécessaire pour le fallback WebGL2 (émulation via
    // Pixel Buffer Objects). En WebGPU natif, ce drapeau est ignoré.
    // On le met sur les buffers lus depuis le vertex shader.
    vertexPositionBuffer   = instancedArray(positionArray, 'vec3').setPBO(true);
    vertexForceBuffer      = instancedArray(vertexCount, 'vec3');
    vertexParamsBuffer     = instancedArray(paramsArray, 'uvec3');
    springListBuffer       = instancedArray(new Uint32Array(springList), 'uint').setPBO(true);
    springVertexIdBuffer   = instancedArray(springVertexIdArray, 'uvec2').setPBO(true);
    springRestLengthBuffer = instancedArray(springRestLengthArray, 'float');
    springForceBuffer      = instancedArray(springCount, 'vec3').setPBO(true);
}

// ============================================================
// 3. UNIFORMS  —  paramètres globaux modifiables en live
// ============================================================
//
// Un uniform est une valeur petite (scalaire, vec3, mat4) partagée par
// TOUS les threads d'un même dispatch. On change `.value` côté JS, et
// le GPU lit la nouvelle valeur au prochain dispatch.
//
// Contrairement à un storage buffer (qui est un tableau), un uniform est
// une seule valeur. C'est idéal pour les paramètres globaux comme la
// gravité ou la raideur.

function setupUniforms() {
    dampeningUniform      = uniform(params.dampening);              // amortissement
    spherePositionUniform = uniform(new THREE.Vector3(0, 0, 0));    // pos sphère
    stiffnessUniform      = uniform(params.stiffness);              // raideur k
    windUniform           = uniform(params.wind);                   // intensité vent
}

// ============================================================
// 4. COMPUTE SHADERS  —  les deux kernels de simulation
// ============================================================
//
// --- Pourquoi deux kernels séparés ? ---
//
//   1. computeSpringForces  : 1 thread par ressort → calcule F = k·(d-rest)·d̂
//   2. computeVertexForces  : 1 thread par vertex → accumule forces + intégration
//
// Ils doivent être SÉPARÉS car le kernel #2 lit les résultats du kernel #1
// (springForceBuffer). Un ressort est partagé entre 2 vertices : si on
// fusionnait les deux kernels, un vertex pourrait lire la force d'un ressort
// avant que l'autre vertex ait fini de la calculer → DATA RACE.
//
// En séparant en deux dispatchs, WebGPU garantit que le kernel #1 est
// totalement terminé avant que le kernel #2 commence (synchronisation
// implicite entre dispatchs consécutifs dans la même queue).
//
// --- Anatomie d'un compute kernel TSL ---
//
//   Fn( () => {
//       // ... code TSL qui ressemble à du JS mais est compilé en WGSL ...
//   })()                    // ← exécute Fn pour créer le node
//     .compute( N )         // ← transforme en kernel de N threads
//     .setName( '...' )     // ← nom pour le debug (inspector, chrome://gpu)

function setupComputeShaders() {
    const vertexCount = verletVertices.length;
    const springCount = verletSprings.length;

    // -------------------------------------------------------
    // KERNEL #1 : Forces des ressorts (loi de Hooke)
    // -------------------------------------------------------
    //
    // Rappel physique — loi de Hooke pour un ressort :
    //
    //   F = -k · (|d| - restLength) · d̂
    //
    //   k          : raideur du ressort (plus grand = plus rigide)
    //   |d|        : longueur actuelle du ressort
    //   restLength : longueur au repos (quand le ressort est détendu)
    //   d̂          : direction normalisée du ressort (v1 - v0) / |d|
    //
    // Si |d| > restLength : le ressort est étiré → F tire les endpoints
    //   l'un vers l'autre (force de rappel).
    // Si |d| < restLength : le ressort est comprimé → F pousse les
    //   endpoints l'un loin de l'autre.
    //
    // On mul par 0.5 car la force est partagée entre les 2 endpoints.
    // Chaque vertex recevra ±F dans le kernel #2 (Newton : action/réaction).
    //
    // --- Code TSL ligne par ligne ---

    computeSpringForces = Fn(() => {
        // instanceIndex = ID du thread courant (0, 1, ..., springCount-1)
        // Chaque thread traite UN ressort.

        // Lire les IDs des 2 vertices connectés par ce ressort
        const vertexIds  = springVertexIdBuffer.element(instanceIndex);
        // Lire la longueur au repos de ce ressort
        const restLength = springRestLengthBuffer.element(instanceIndex);

        // Lire les positions des 2 vertices depuis le storage buffer
        // .element( i ) = accès aléatoire au i-ème élément du buffer
        const v0 = vertexPositionBuffer.element(vertexIds.x);
        const v1 = vertexPositionBuffer.element(vertexIds.y);

        // delta = v1 - v0  (vecteur du ressort, de v0 vers v1)
        // .toVar() crée une variable locale mutable (comme `let` en JS)
        const delta = v1.sub(v0).toVar();
        // dist = |delta|  (longueur actuelle du ressort)
        // .max(0.000001) évite la division par zéro si les vertices se chevauchent
        const dist  = delta.length().max(0.000001).toVar();

        // force = k · (|d| - restLength) · d̂ · 0.5
        //   dist.sub(restLength)   = (|d| - restLength)  → étirement
        //   .mul(stiffnessUniform) = × k                  → raideur
        //   .mul(delta)            = × (v1-v0)            → direction
        //   .mul(0.5)              = partager entre 2 endpoints
        //   .mul(invDist)          = normaliser d̂         → × (1/|d|)
        //
        // NOTE GPU : on utilise mul(invDist) au lieu de div(dist).
        // La division est coûteuse sur GPU (surtout pour les entiers).
        // En précalculant l'inverse (1.0 / dist) une seule fois, on
        // transforme une division en multiplication — beaucoup plus rapide.
        // C'est une optimisation classique en programmation GPU.
        const invDist = float(1.0).div(dist).toVar();  // 1 / |d| (une seule division)
        const force = dist.sub(restLength).mul(stiffnessUniform)
                            .mul(delta).mul(0.5).mul(invDist);  // × (1/|d|) au lieu de ÷ |d|

        // Écrire la force dans springForceBuffer[instanceIndex]
        // .assign() = écriture (gauche d'affectation, comme `=` en JS)
        springForceBuffer.element(instanceIndex).assign(force);
    })().compute(springCount).setName('Spring Forces');
    //       ↑ nombre de threads = nombre de ressorts (~5800)

    // -------------------------------------------------------
    // KERNEL #2 : Forces des vertices + intégration Verlet
    // -------------------------------------------------------
    //
    // Pour chaque vertex i (961 threads) :
    //
    //   1. Lire (isFixed, springCount, springPointer) depuis paramsBuffer
    //   2. Si isFixed → Return() (ne rien faire, le vertex ne bouge pas)
    //   3. Lire position et force courantes depuis les storage buffers
    //   4. force *= dampening  (amortir la vélocité pour éviter oscillations infinies)
    //   5. Boucler sur les ressorts connectés (via CSR) :
    //        force += ±springForce  (signe +1 ou -1 selon Newton)
    //   6. force.y -= gravity  (gravité vers le bas)
    //   7. force.z -= wind * noise3D(position, time)  (vent spatialisé)
    //   8. Collision sphère : si (position + force) est dans la sphère,
    //      ajouter une force qui pousse le vertex vers l'extérieur
    //   9. Écrire force et position dans les buffers
    //      position += force  (intégration Verlet : p += v, avec dt=1, masse=1)

    computeVertexForces = Fn(() => {
        // --- 1. Lire les paramètres du vertex ---
        // paramsBuffer[i] = (isFixed, springCount, springPointer)
        const params = vertexParamsBuffer.element(instanceIndex).toVar();
        const isFixed       = params.x;   // 1 si fixe, 0 sinon
        const springCount   = params.y;   // nombre de ressorts connectés
        const springPointer = params.z;   // offset dans springListBuffer

        // --- 2. Vertex fixe : ne rien faire ---
        // If( condition, () => { ... } ) = if en TSL
        // Return() = return en TSL (sort du kernel)
        If(isFixed, () => { Return(); });

        // --- 3. Lire position et force courantes ---
        const position = vertexPositionBuffer.element(instanceIndex).toVar('pos');
        const force    = vertexForceBuffer.element(instanceIndex).toVar('force');

        // --- 4. Amortissement ---
        // En Verlet, le buffer `force` accumule les forces d'une frame à
        // l'autre et sert de vélocité. mulAssign(0.99) amortit légèrement
        // cette vélocité à chaque step → le tissu finit par se stabiliser.
        // Sans amortissement, le tissu oscillerait indéfiniment.
        force.mulAssign(dampeningUniform);

        // --- 5. Accumuler les forces des ressorts connectés ---
        // On itère sur springListBuffer[ptr .. ptr+count-1] (structure CSR).
        //
        // Loop( { start, end, type, condition }, ( { i } ) => { ... } )
        //   = boucle for en TSL, compilée vers une boucle WGSL
        //
        // Pour chaque ressort :
        //   - springForce     = force calculée par le kernel #1
        //   - springVertexIds = les 2 IDs de vertices du ressort
        //   - factor = +1 si ce vertex est l'endpoint 0, -1 sinon
        //     (Newton : si le ressort tire v0 vers v1, il tire v1 vers v0
        //      avec la même force mais dans la direction opposée)
        //
        // select( cond, a, b ) = cond ? a : b  (SANS branchement GPU)
        // Sur GPU, les branches (if/else) sont coûteuses car tous les
        // threads d'un warp exécutent les deux branches. select() est
        // compilé vers une instruction sans branchement (mix/cmov).
        //
        // NOTE GPU (avertissement du compilateur) :
        // L'accès .element(springId) avec un index dynamique (non-constant)
        // inside une boucle génère un avertissement du compilo WGSL :
        // "division by a non-constant inside a loop". C'est parce que
        // calculer l'offset mémoire (springId × stride) nécessite une
        // multiplication d'entiers, et certaines architectures GPU
        // émettent une division pour les strides non-puissance-de-2.
        // C'est INÉVITABLE dans la structure CSR : on doit indexer
        // dynamiquement les buffers. L'avertissement est bénin ici —
        // le nombre d'itérations par vertex est petit (4-8 ressorts).
        const ptrStart = springPointer.toVar('ptrStart');
        const ptrEnd   = ptrStart.add(springCount).toVar('ptrEnd');

        Loop({ start: ptrStart, end: ptrEnd, type: 'uint', condition: '<' }, ({ i }) => {
            const springId        = springListBuffer.element(i).toVar('springId');
            const springForce     = springForceBuffer.element(springId);
            const springVertexIds = springVertexIdBuffer.element(springId);
            // +1 si ce vertex est l'endpoint 0 du ressort, -1 sinon
            const factor = select(springVertexIds.x.equal(instanceIndex), 1.0, -1.0);
            force.addAssign(springForce.mul(factor));
        });

        // --- 6. Gravité ---
        // Petite force vers le bas. La valeur 0.00005 est faible car on
        // fait 240 steps/seconde : la gravité s'accumule sur beaucoup de
        // steps. Une valeur trop grande ferait exploser la simulation.
        force.y.subAssign(0.00005);

        // --- 7. Vent (bruit 3D spatialisé) ---
        // triNoise3D( position, scale, time ) renvoie une valeur lisse
        // dans [0, 1] qui varie dans l'espace ET le temps.
        //   - position : le bruit est différent à chaque point du tissu
        //   - time      : le bruit évolue dans le temps (vent qui souffle)
        // .sub(0.2) : décaler pour que le vent puisse être négatif (souffler
        //   dans les deux sens, pas seulement pousser dans une direction)
        // .mul(0.0001) : amplitude très faible (même raison que la gravité)
        const noise = triNoise3D(position, 1, time).sub(0.2).mul(0.0001);
        force.z.subAssign(noise.mul(windUniform));

        // --- 8. Collision avec la sphère ---
        // Position prédite au prochain step = position + force.
        // Si cette position est à l'intérieur de la sphère (dist < radius),
        // on ajoute une force qui pousse le vertex radialement vers l'extérieur.
        //
        //   deltaSphere = (position + force) - spherePosition
        //   dist = |deltaSphere|
        //   sphereForce = max(0, radius - dist) · deltaSphere / dist
        //
        // max(0, radius - dist) :
        //   - si dist >= radius (vertex hors sphère) → 0 (pas de force)
        //   - si dist < radius (vertex dans sphère) → positive (pousser)
        // .mul(deltaSphere).mul(invDist) : direction radiale normalisée
        // Même astuce que kernel #1 : on précalcule 1/dist pour éviter
        // une division coûteuse sur GPU.
        const deltaSphere = position.add(force).sub(spherePositionUniform);
        const dist = deltaSphere.length().max(0.000001).toVar();  // évite div par 0
        const invDist = float(1.0).div(dist).toVar();
        const sphereForce = float(SPHERE_RADIUS).sub(dist).max(0)
                                .mul(deltaSphere).mul(invDist);
        force.addAssign(sphereForce);

        // --- 9. Écrire les résultats ---
        // Sauvegarder la force (pour le prochain step) et intégrer :
        // position += force  (Verlet avec dt=1, masse=1)
        vertexForceBuffer.element(instanceIndex).assign(force);
        vertexPositionBuffer.element(instanceIndex).addAssign(force);
    })().compute(vertexCount).setName('Vertex Forces');
    //       ↑ nombre de threads = nombre de vertices (961)
}

// ============================================================
// 5. SPHÈRE DE COLLISION  —  objet visible qui pousse le tissu
// ============================================================
//
// La sphère est un mesh classique (pas de compute shader). Elle se
// déplace selon une oscillation sinusoïdale (voir updateSphere()).
// Sa position est copiée dans spherePositionUniform pour que le
// compute shader #2 puisse tester la collision.

function setupSphere() {
    // IcosahedronGeometry : sphère à partir d'un icosaèdre subdivisé
    // (radius, detail) — detail=4 donne une sphère lisse
    const geometry = new THREE.IcosahedronGeometry(SPHERE_RADIUS * 0.95, 4);
    // MeshStandardNodeMaterial : PBR standard (métal + rugosité)
    const material = new THREE.MeshStandardNodeMaterial({
        color: 0x88aaff,
        roughness: 0.3,
        metalness: 0.8
    });
    sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);
}

// ============================================================
// 6. MESH DU TISSU  —  rendu en lisant le storage buffer
// ============================================================
//
// --- Principe clé : le vertex shader lit le storage buffer ---
//
// Le mesh du tissu est une grille régulière de vertices de RENDU.
// Mais ces vertices n'ont pas de position propre : leur position est
// calculée en lisant le `vertexPositionBuffer` (le même buffer que les
// compute shaders mettent à jour chaque frame).
//
// Chaque vertex de rendu est centré sur 4 vertices Verlet (les 4 coins
// de la cellule de grille correspondante). Sa position = moyenne des 4.
//
//     v00 ─── v10        renderVertex au centre
//      │       │         position = (v00 + v10 + v01 + v11) / 4
//      │   ×   │         normale   = cross( diagonale1, diagonale2 )
//      │       │
//     v01 ─── v11
//
// Le vertex shader lit les positions Verlet DIRECTEMENT depuis le
// storage buffer — AUCUN aller-retour CPU. C'est ça la puissance de
// WebGPU : compute et render partagent la même mémoire GPU.
//
// --- L'attribut 'vertexIds' ---
//
// L'attribut 'vertexIds' (vec4 d'uints) contient les 4 IDs Verlet pour
// chaque vertex de rendu. Il est fixe (la topologie ne change pas).
// C'est l'unique attribut "classique" du mesh — tout le reste vient
// du storage buffer.

function setupClothMesh() {
    const vertexCount = SEGMENTS_X * SEGMENTS_Y;
    const geometry = new THREE.BufferGeometry();

    // --- Attribut 'vertexIds' : les 4 IDs Verlet pour chaque vertex de rendu ---
    const verletVertexIdArray = new Uint32Array(vertexCount * 4);
    const indices = [];

    const getIndex = (x, y) => y * SEGMENTS_X + x;

    // Pour chaque cellule de la grille de rendu, on stocke les 4 IDs
    // des vertices Verlet qui forment les coins de cette cellule.
    for (let x = 0; x < SEGMENTS_X; x++) {
        for (let y = 0; y < SEGMENTS_Y; y++) {
            const index = getIndex(x, y);
            // Les 4 coins Verlet de la cellule (x, y)
            verletVertexIdArray[index * 4]     = verletColumns[x][y].id;       // v00
            verletVertexIdArray[index * 4 + 1] = verletColumns[x + 1][y].id;   // v10
            verletVertexIdArray[index * 4 + 2] = verletColumns[x][y + 1].id;   // v01
            verletVertexIdArray[index * 4 + 3] = verletColumns[x + 1][y + 1].id; // v11

            // 2 triangles par cellule (à partir de x>0, y>0 pour éviter les bords)
            // Triangle 1 : (x,y), (x-1,y), (x-1,y-1)
            // Triangle 2 : (x,y), (x-1,y-1), (x,y-1)
            if (x > 0 && y > 0) {
                indices.push(
                    getIndex(x, y),     getIndex(x - 1, y),     getIndex(x - 1, y - 1),
                    getIndex(x, y),     getIndex(x - 1, y - 1), getIndex(x, y - 1)
                );
            }
        }
    }

    // --- Attributs de géométrie ---
    // 'position' est un PLACEHOLDER : le vertex shader override la position
    // via positionNode. On le met à zéro ; la vraie position vient du
    // storage buffer. Three.js a quand même besoin d'un attribut 'position'
    // pour calculer la bounding sphere (qu'on désactive via frustumCulled).
    geometry.setAttribute('position',
        new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    geometry.setAttribute('vertexIds',
        new THREE.BufferAttribute(verletVertexIdArray, 4));
    geometry.setIndex(indices);

    // --- Matériau : MeshPhysicalNodeMaterial (PBR + sheen) ---
    // MeshPhysicalNodeMaterial = version "node" (TSL) de MeshPhysicalMaterial.
    // Elle supporte les mêmes paramètres PBR + des features avancées
    // comme `sheen` (réflexion diffuse au bord → effet velours/tissu).
    //
    // Paramètres :
    //   color         : couleur de base du tissu (bleu foncé)
    //   side          : DoubleSide → on voit les deux côtés du tissu
    //   roughness     : 0.7 = assez rugueux (pas de réflexs nettes)
    //   sheen         : 1.0 = effet velours maximal
    //   sheenRoughness: 0.5 = sheen moyennement diffus
    //   sheenColor    : couleur du sheen (bleu clair)
    clothMaterial = new THREE.MeshPhysicalNodeMaterial({
        color: new THREE.Color(0x2040cc),
        side: THREE.DoubleSide,
        roughness: 0.7,
        sheen: 1.0,
        sheenRoughness: 0.5,
        sheenColor: new THREE.Color(0xaaaaff)
    });

    // --- positionNode : lire la position depuis le storage buffer ---
    //
    // positionNode est une propriété des *NodeMaterial : c'est un node TSL
    // qui remplace la position du vertex. Au lieu d'utiliser l'attribut
    // 'position' classique, on calcule la position en lisant le storage
    // buffer mis à jour par les compute shaders.
    //
    // Étapes pour chaque vertex de rendu :
    //   1. Lire l'attribut 'vertexIds' (les 4 IDs Verlet)
    //   2. Lire les 4 positions Verlet depuis vertexPositionBuffer
    //   3. Calculer la position = moyenne des 4 coins
    //   4. Calculer la normale à partir des diagonales :
    //        tangent   = normalize( (v1 + v3) - (v0 + v2) )  (axe X local)
    //        bitangent = normalize( (v2 + v3) - (v0 + v1) )  (axe Y local)
    //        normal    = cross( tangent, bitangent )          (axe Z local)
    //   5. Passer la normale au fragment shader via .toVarying()
    //
    // La normale est calculée à partir des positions Verlet, donc elle
    // réagit en temps réel à la déformation du tissu → l'éclairage PBR
    // suit les plis du tissu.
    //
    // Fn( ( { material } ) => ... ) : la fonction reçoit un contexte avec
    // `material` pour pouvoir modifier d'autres nodes du matériau (ici
    // normalNode, en plus de la position retournée).
    clothMaterial.positionNode = Fn(({ material }) => {
        // Lire les 4 IDs Verlet pour ce vertex de rendu
        const vertexIds = attribute('vertexIds');

        // Lire les 4 positions Verlet depuis le storage buffer
        // .element( id ) = accès aléatoire au i-ème élément du buffer
        const v0 = vertexPositionBuffer.element(vertexIds.x).toVar();
        const v1 = vertexPositionBuffer.element(vertexIds.y).toVar();
        const v2 = vertexPositionBuffer.element(vertexIds.z).toVar();
        const v3 = vertexPositionBuffer.element(vertexIds.w).toVar();

        // Calculer tangente et bitangente à partir des diagonales de la cellule
        // tangent   = (v1 + v3) - (v0 + v2)  → direction X de la cellule
        // bitangent = (v2 + v3) - (v0 + v1)  → direction Y de la cellule
        const tangent   = v1.add(v3).sub(v0.add(v2)).normalize();
        const bitangent = v2.add(v3).sub(v0.add(v1)).normalize();
        // Normale = produit vectoriel (perpendiculaire au plan du tissu)
        const normal    = cross(tangent, bitangent);

        // Passer la normale au fragment shader (transformée en espace vue)
        // transformNormalToView : mat3(normalMatrix) * normal
        // .toVarying() : crée un varying (interpolé entre vertex et fragment)
        material.normalNode = transformNormalToView(normal).toVarying();

        // Position finale = centre des 4 coins (moyenne)
        // .mul(0.25) = diviser par 4
        return v0.add(v1).add(v2).add(v3).mul(0.25);
    })();

    // --- Création du mesh ---
    // frustumCulled = false est ESSENTIEL : la bounding sphere CPU est
    // fausse (les positions dans l'attribut 'position' sont toutes à 0),
    // donc Three.js croirait que le mesh est hors de l'écran et ne le
    // dessinerait pas. Les vraies positions viennent du GPU.
    clothMesh = new THREE.Mesh(geometry, clothMaterial);
    clothMesh.frustumCulled = false;
    scene.add(clothMesh);
}

// ============================================================
// 7. GUI  —  interface de contrôle (lil-gui)
// ============================================================
//
// On utilise lil-gui (même librairie que shaders_101.js) pour exposer
// les paramètres de la simulation. Chaque slider modifie un uniform GPU
// en temps réel — le tissu réagit instantanément.

function setupGUI() {
    gui = new GUI();

    // --- Raideur des ressorts (k) ---
    // Plus k est grand, plus le tissu est rigide (se déforme peu).
    // Plus k est petit, plus le tissu est mou (s'étire sous son poids).
    gui.add(params, 'stiffness', 0.05, 0.5, 0.01).name('Raideur (k)').onChange(v => {
        stiffnessUniform.value = v;
    });

    // --- Intensité du vent ---
    // 0 = pas de vent (le tissu pend immobile)
    // 5 = tempête (le tissu ondule fortement)
    gui.add(params, 'wind', 0, 5, 0.1).name('Vent').onChange(v => {
        windUniform.value = v;
    });

    // --- Amortissement ---
    // 1.0 = aucun amortissement (le tissu oscille indéfiniment)
    // 0.9 = fort amortissement (le tissu se stabilise vite)
    // 0.99 = valeur par défaut (légère dissipation d'énergie)
    gui.add(params, 'dampening', 0.9, 1.0, 0.001).name('Amortissement').onChange(v => {
        dampeningUniform.value = v;
    });

    // --- Afficher/cacher la sphère de collision ---
    gui.add(params, 'showSphere').name('Sphère').onChange(v => {
        sphere.visible = v;
    });

    // --- Mode wireframe ---
    // Affiche la structure triangulaire du tissu (utile pour comprendre
    // la topologie). Désactivé par défaut.
    gui.add(params, 'wireframe').name('Wireframe').onChange(v => {
        clothMaterial.wireframe = v;
    });

    // --- Bouton Reset ---
    // Remet le tissu à sa position initiale (grille plate horizontale).
    gui.add(params, 'reset').name('♻️ Reset');
}

// ============================================================
// 8. RESET  —  remettre le tissu à sa position initiale
// ============================================================
//
// Pour reset, on doit réécrire les positions initiales dans le storage
// buffer GPU. On ne peut pas faire buffer.element(i).assign(...) depuis
// le JS (TSL ne fonctionne que dans Fn). À la place, on crée un nouveau
// TypedArray avec les positions initiales et on utilise la méthode
// .array.set() du InstancedBufferAttribute sous-jacent.

function resetSimulation() {
    // Reconstruire le tableau des positions initiales
    const positions = new Float32Array(verletVertices.length * 3);
    const forces = new Float32Array(verletVertices.length * 3);

    for (let i = 0; i < verletVertices.length; i++) {
        const v = verletVertices[i];
        positions[i * 3]     = v.position.x;
        positions[i * 3 + 1] = v.position.y;
        positions[i * 3 + 2] = v.position.z;
    }
    // forces = 0 (vélocité nulle au reset)

    // Copier dans les buffers GPU
    // vertexPositionBuffer.instanceMatrix est l'InstancedBufferAttribute
    // sous-jacent. On accède au tableau via .array.
    vertexPositionBuffer.instanceMatrix.array.set(positions);
    vertexPositionBuffer.instanceMatrix.needsUpdate = true;
    vertexForceBuffer.instanceMatrix.array.set(forces);
    vertexForceBuffer.instanceMatrix.needsUpdate = true;
}

// ============================================================
// 9. BOUCLE D'ANIMATION  —  simulation à pas fixe + rendu
// ============================================================
//
// --- Pourquoi un pas de temps fixe ? ---
//
// La simulation utilise un PAS DE TEMPS FIXE (1/240 s) découplé du
// framerate. À chaque frame, on accumule le temps écoulé et on exécute
// autant de steps que nécessaire pour "rattraper" le temps réel.
//
//   frame dt = 16.6 ms (60 FPS) → 4 steps par frame (4 × 1/240 ≈ 16.6 ms)
//   frame dt = 6.9 ms (144 FPS) → 1-2 steps par frame
//
// Avantages :
//   - La simulation avance à la même vitesse sur tous les écrans
//   - La simulation est stable (le pas de temps est constant)
//   - Le rendu peut tourner à n'importe quel FPS sans affecter la physique
//
// Le deltaTime est clampé à 1/60 pour éviter une explosion de la sim
// quand l'onglet perd le focus (rAF se met en pause, puis reprend avec
// un énorme delta de plusieurs secondes).

function animate() {
    timer.update();

    // Temps écoulé depuis la dernière frame (en secondes)
    const deltaTime = Math.min(timer.getDelta(), 1 / 60);
    const timePerStep = 1 / STEPS_PER_SECOND;

    timeSinceLastStep += deltaTime;

    // --- Boucle de simulation : autant de steps que nécessaire ---
    // On exécute 0, 1, 2, ou plusieurs steps selon le temps accumulé.
    while (timeSinceLastStep >= timePerStep) {
        timestamp += timePerStep;
        timeSinceLastStep -= timePerStep;

        // 1. Mettre à jour la position de la sphère (oscillation lente)
        updateSphere();

        // 2. Compute #1 : calculer les forces de tous les ressorts
        //    Dispatch ~5800 threads sur le GPU
        renderer.compute(computeSpringForces);

        // 3. Compute #2 : accumuler les forces + intégrer les positions
        //    Dispatch 961 threads sur le GPU
        //    (lit les résultats du compute #1 → synchronisation implicite)
        renderer.compute(computeVertexForces);
    }

    // --- Rendu : le vertex shader lit les positions fraîches du GPU ---
    // controls.update() est nécessaire pour enableDamping
    controls.update();
    renderer.render(scene, camera);
}

// ============================================================
// 10. SPHÈRE  —  oscillation de la sphère de collision
// ============================================================
//
// La sphère se déplace selon une oscillation sinusoïdale en x et z.
// Le mouvement est lent (périodes différentes en x et z → lissajous)
// pour que le tissu ait le temps de réagir.
//
// On copie la position dans l'uniform spherePositionUniform pour que
// le compute shader #2 puisse tester la collision.

function updateSphere() {
    // Oscillation en x : amplitude 0.1, fréquence 2.1 rad/s
    // Oscillation en z : amplitude 1.0, fréquence 0.8 rad/s
    // (fréquences différentes → trajectoire lissajous non périodique)
    sphere.position.set(
        Math.sin(timestamp * 2.1) * 0.1,
        0,
        Math.sin(timestamp * 0.8)
    );
    // Copier dans l'uniform GPU
    spherePositionUniform.value.copy(sphere.position);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
