// ===================== WEBGPU 102 =====================
// Système de particules simulé ENTIEREMENT sur le GPU via un compute shader.
//
// Pipeline WebGPU illustré :
//
//   CPU (init) ──▶ storage buffers (position, vélocité, couleur)
//                          │
//                          ▼
//   Compute shader (chaque frame) ──▶ met à jour position & vélocité
//                          │
//                          ▼
//   Vertex shader (rendu) ──▶ lit la position depuis le storage buffer
//                          │
//                          ▼
//   Fragment shader ──▶ couleur par particule + halo doux
//
// C'est exactement le même schéma que l'exemple officiel webgpu_compute_cloth,
// mais réduit à l'essentiel : pas de ressorts, pas de vent, juste de la
// gravité + un rebond au sol. L'objectif est pédagogique.
//
// Concepts TSL nouveaux par rapport à webgpu_101 :
//   - instancedArray(...)        : déclare un storage buffer (tableau GPU)
//   - .element( index )          : accès en lecture/écriture à un élément
//   - Fn( () => { ... } )()      : définit un "node" TSL (compute OU shader)
//   - .compute( N )              : transforme un node en kernel de N threads
//   - renderer.compute( node )   : exécute le kernel (équivalent d'un dispatch)
//   - instanceIndex              : id du thread courant (0..N-1)
//   - If / Loop / Return         : contrôle de flux TSL (compilé vers WGSL)
//   - uniform( v )               : valeur globale partagée CPU ↔ GPU
//   - hash( x )                  : fonction de bruit pseudo-aléatoire déterministe

import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import {
    Fn, If, Return, Loop,
    instancedArray, instanceIndex, uniform,
    attribute, varying, vec2, vec3, vec4, float,
    hash, fract, dot, length, max, min, pow, smoothstep,
    time, uv, cos, sin
} from 'three/tsl';

// --- Paramètres de la simulation ---
const PARTICLE_COUNT = 20000;   // nombre de particules (autant de threads GPU)
const BOUNDS = 4;               // demi-taille de la "boîte" de simulation
const GRAVITY = -9.8;           // m/s²
const RESTITUTION = 0.55;       // énergie conservée à chaque rebond (0..1)

// --- Variables globales ---
let renderer, scene, camera, controls;
let particleMesh, particleMaterial;
let computeNode;
let positionBuffer, velocityBuffer, colorBuffer, seedBuffer;
let boundsUniform, gravityUniform, restitutionUniform, timeScaleUniform;
let lastTime = 0;

init();

async function init() {
    // --- Renderer WebGPU ---
    // On demande explicitement la lecture d'un storage buffer dans le VERTEX
    // stage (maxStorageBuffersInVertexStage: 1). Sans ça, certains drivers
    // refusent de lire un storage buffer côté vertex shader.
    renderer = new THREE.WebGPURenderer({
        antialias: true,
        requiredLimits: { maxStorageBuffersInVertexStage: 1 }
    });
    await renderer.init();
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);

    // Indiquer le backend réellement utilisé (WebGPU ou fallback WebGL2)
    const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2 (fallback)';
    document.getElementById('info').textContent =
        `WebGPU 102 — ${PARTICLE_COUNT.toLocaleString()} particules (${backend})`;

    // --- Scène & caméra ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a14);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(6, 4, 8);
    camera.lookAt(0, 0, 0);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);

    // --- Grille au sol pour repérer l'espace ---
    scene.add(new THREE.GridHelper(BOUNDS * 2, BOUNDS * 2, 0x223366, 0x111122));

    // --- Construction des buffers, du compute shader et du mesh ---
    setupBuffers();
    setupUniforms();
    setupComputeShader();
    setupParticleMesh();

    // --- Resize ---
    window.addEventListener('resize', onWindowResize, false);

    // --- Lancement ---
    renderer.setAnimationLoop(animate);
}

// ============================================================
// 1. BUFFERS  —  données GPU partagées entre compute et render
// ============================================================
//
// Quatre storage buffers (tableaux en mémoire GPU accessibles en lecture
// ET écriture par les compute shaders, et en lecture par les vertex shaders).
//
//  positionBuffer : vec3  — position courante de chaque particule
//  velocityBuffer : vec3  — vélocité courante de chaque particule
//  colorBuffer    : vec3  — couleur fixe de chaque particule (assignée une fois)
//  seedBuffer     : float — graine aléatoire par particule (pour varier le rebond)
//
// `instancedArray( dataOrLength, 'type' )` est le constructeur TSL d'un
// storage buffer. On peut lui passer soit un TypedArray déjà rempli, soit
// juste une longueur (le buffer est alloué à zéro).

function setupBuffers() {
    // --- Positions initiales : nuage au-dessus de la scène ---
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Position : répartie dans un cube au-dessus du sol
        positions[i * 3]     = (Math.random() - 0.5) * BOUNDS * 1.5;
        positions[i * 3 + 1] = Math.random() * BOUNDS + 1;     // en l'air
        positions[i * 3 + 2] = (Math.random() - 0.5) * BOUNDS * 1.5;

        // Vélocité initiale : petite, aléatoire
        velocities[i * 3]     = (Math.random() - 0.5) * 1.0;
        velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 1.0;

        // Couleur : dégradé entre deux teintes selon la hauteur initiale
        const t = positions[i * 3 + 1] / (BOUNDS + 1);
        const c1 = new THREE.Color(0x3366ff);  // bleu
        const c2 = new THREE.Color(0xff66cc);  // rose
        const c = c1.clone().lerp(c2, t);
        colors[i * 3]     = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;

        // Graine : pour varier la restitution par particule (rebond plus ou moins élastique)
        seeds[i] = Math.random();
    }

    // setPBO(true) est requis uniquement pour le fallback WebGL2 :
    // WebGL n'a pas de storage buffers natifs, Three.js les émule via des
    // Pixel Buffer Objects. En WebGPU natif, ce drapeau est ignoré.
    positionBuffer = instancedArray(positions, 'vec3').setPBO(true);
    velocityBuffer = instancedArray(velocities, 'vec3').setPBO(true);
    colorBuffer    = instancedArray(colors, 'vec3').setPBO(true);
    seedBuffer     = instancedArray(seeds, 'float').setPBO(true);
}

// ============================================================
// 2. UNIFORMS  —  valeurs globales CPU → GPU, modifiables en live
// ============================================================
//
// Un `uniform( v )` crée un "handle" dont on peut changer `.value` côté JS
// à chaque frame ; le GPU lit automatiquement la nouvelle valeur.
// Contrairement à un storage buffer, un uniform est petit (scalaire,
// vec3, mat4...) et identique pour TOUS les threads d'un même dispatch.

function setupUniforms() {
    boundsUniform       = uniform(float(BOUNDS));
    gravityUniform      = uniform(float(GRAVITY));
    restitutionUniform  = uniform(float(RESTITUTION));
    timeScaleUniform    = uniform(float(1.0));
}

// ============================================================
// 3. COMPUTE SHADER  —  le cœur de la simulation
// ============================================================
//
// On définit une fonction TSL avec `Fn( () => { ... } )`. À l'intérieur,
// on écrit du code qui ressemble à du JS mais qui est compilé en WGSL.
//
// `instanceIndex` est l'équivalent de gl_InstanceID / SV_DispatchThreadID :
// c'est l'identifiant du thread courant (0, 1, 2, ..., PARTICLE_COUNT-1).
// Chaque thread traite UNE particule.
//
// `.compute( N )` transforme la fonction en kernel lancé avec N threads.
//
// Schéma de la mise à jour (intégration d'Euler explicite, pas Verlet) :
//   1. lire position et vélocité courantes
//   2. appliquer la gravité à la vélocité : v.y += g * dt
//   3. intégrer : p += v * dt
//   4. tester collision avec le sol (y = 0) et les murs (|x|,|z| < bounds)
//      → si collision : inverser la composante de vélocité correspondante
//                        et amortir par la restitution
//   5. écrire la nouvelle position et vélocité dans les buffers

function setupComputeShader() {
    computeNode = Fn(() => {
        // --- Identifiant du thread = index de la particule ---
        const id = instanceIndex;

        // --- Lire l'état courant ---
        // .element( i ) renvoie un "node" qui pointe vers l'élément i du
        // storage buffer. On peut le lire (à droite d'une affectation)
        // ou l'écrire (à gauche : .assign( ... )).
        const position = positionBuffer.element(id).toVar('p');
        const velocity = velocityBuffer.element(id).toVar('v');
        const seed     = seedBuffer.element(id);

        // --- Pas de temps fixe ---
        // On utilise un dt fixe (1/60) plutôt que le vrai deltaTime pour
        // garder la simulation stable et déterministe. Une vraie sim
        // utiliserait un accumulateur comme l'exemple cloth (360 Hz).
        const dt = float(1.0 / 60.0);

        // --- 1. Gravité ---
        velocity.y.addAssign(gravityUniform.mul(dt));

        // --- 2. Petite force aléatoire (turbulence) ---
        // hash( x ) ∈ [0, 1] de façon déterministe. On l'utilise pour
        // ajouter une légère perturbation horizontale, différente pour
        // chaque particule et chaque frame (via `time`).
        const noiseX = hash(id.toFloat().add(time)).sub(0.5).mul(0.4);
        const noiseZ = hash(id.toFloat().add(time).add(100.0)).sub(0.5).mul(0.4);
        velocity.x.addAssign(noiseX.mul(dt));
        velocity.z.addAssign(noiseZ.mul(dt));

        // --- 3. Intégration : p += v * dt ---
        position.addAssign(velocity.mul(dt));

        // --- 4. Collisions ---
        // Sol : si y < 0, remonter à 0 et inverser v.y avec amorti
        If(position.y.lessThan(0.0), () => {
            position.y.assign(0.0);
            // restitution par particule = restitution globale * (0.7 + 0.6 * seed)
            // → certaines particules rebondissent plus que d'autres
            const r = restitutionUniform.mul(float(0.7).add(seed.mul(0.6)));
            velocity.y.assign(velocity.y.mul(r).negate());
            // friction horizontale au contact
            velocity.x.mulAssign(0.85);
            velocity.z.mulAssign(0.85);
        });

        // Murs en x : si |x| > bounds, ramener et inverser v.x
        If(position.x.greaterThan(boundsUniform), () => {
            position.x.assign(boundsUniform);
            velocity.x.assign(velocity.x.mul(restitutionUniform).negate());
        });
        If(position.x.lessThan(boundsUniform.negate()), () => {
            position.x.assign(boundsUniform.negate());
            velocity.x.assign(velocity.x.mul(restitutionUniform).negate());
        });

        // Murs en z (identique)
        If(position.z.greaterThan(boundsUniform), () => {
            position.z.assign(boundsUniform);
            velocity.z.assign(velocity.z.mul(restitutionUniform).negate());
        });
        If(position.z.lessThan(boundsUniform.negate()), () => {
            position.z.assign(boundsUniform.negate());
            velocity.z.assign(velocity.z.mul(restitutionUniform).negate());
        });

        // --- 5. Écrire le résultat ---
        positionBuffer.element(id).assign(position);
        velocityBuffer.element(id).assign(velocity);

    })().compute(PARTICLE_COUNT).setName('Particle Update');
    //                                ↑ nombre de threads = nombre de particules
    //   .setName(...) donne un nom au kernel, visible dans les outils de debug
    //   WebGPU (ex: inspector de Three.js, chrome://gpu).
}

// ============================================================
// 4. MESH  —  rendu des particules en lisant le storage buffer
// ============================================================
//
// On crée un mesh "instanced" : une seule géométrie (un quad de 2 triangles)
// est dessinée PARTICLE_COUNT fois. À chaque instance, le vertex shader
// lit la position correspondante dans `positionBuffer` et déplace le quad.
//
// C'est le même principe que l'exemple cloth : le vertex shader lit un
// storage buffer écrit par le compute shader. AUCUN aller-retour CPU.

function setupParticleMesh() {
    // --- Géométrie de base : un petit quad centré sur l'origine ---
    // (deux triangles formant un carré de 0.05 unités de côté)
    //
    // IMPORTANT : on utilise InstancedBufferGeometry (pas BufferGeometry)
    // avec instanceCount = PARTICLE_COUNT. C'est ce qui déclenche le
    // dessin de PARTICLE_COUNT instances, et ce qui donne à `instanceIndex`
    // une valeur différente (0..N-1) pour chaque instance. Sans ça, le
    // mesh ne dessine qu'UNE instance et toutes les particules lisent
    // la même position (index 0) → écran noir.
    const size = 0.05;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        -size, -size, 0,
         size, -size, 0,
         size,  size, 0,
        -size,  size, 0
    ], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
        0, 0,  1, 0,  1, 1,  0, 1
    ], 2));
    geometry.setIndex([0, 1, 2,  0, 2, 3]);
    geometry.instanceCount = PARTICLE_COUNT;  // ← clé : N instances

    // --- Matériau TSL ---
    // MeshBasicNodeMaterial : pas d'éclairage PBR, juste la couleur qu'on
    // calcule nous-mêmes via `.positionNode` et `.colorNode`.
    particleMaterial = new THREE.MeshBasicNodeMaterial();
    particleMaterial.transparent = true;
    particleMaterial.depthWrite = false;   // évite le tri, les particules s'additionnent
    particleMaterial.blending = THREE.AdditiveBlending;

    // --- positionNode : où placer chaque instance ---
    // On lit la position GPU de la particule `instanceIndex` et on l'utilise
    // comme centre du quad. On ajoute le décalage local du quad (attribute
    // 'position') pour obtenir la position finale en clip space.
    //
    // Note : `positionLocal` est le builtin TSL pour l'attribut 'position'
    // du vertex courant (le coin du quad). On le tourne pour qu'il fasse
    // face à la caméra (billboard) en utilisant les axes de la caméra.
    const particlePos = positionBuffer.element(instanceIndex);
    const localOffset = attribute('position');  // coin du quad, espace local

    // Billboard simple : on suppose la caméra orientée vers -Z, donc les
    // axes X et Y monde ≈ axes du quad. Pas parfait mais suffisant ici.
    const worldPos = particlePos.add(vec3(localOffset.x, localOffset.y, 0.0));
    particleMaterial.positionNode = worldPos;

    // --- colorNode : couleur + halo doux ---
    // On lit la couleur fixe de la particule, puis on applique un dégradé
    // radial basé sur uv (centre = opaque, bords = transparent) pour donner
    // un aspect "point lumineux" plutôt que carré plein.
    const particleColor = colorBuffer.element(instanceIndex);

    // uv centrée : (0.5, 0.5) = centre du quad
    const centeredUV = uv().sub(0.5);
    const distFromCenter = length(centeredUV);

    // Halo : intensité maximale au centre, décroissante vers les bords.
    // smoothstep crée une transition douce. On élève au carré pour un
    // "fall-off" plus prononcé (effet glow).
    const halo = smoothstep(0.5, 0.0, distFromCenter);
    const glow = pow(halo, 1.5);

    // La couleur finale = couleur de la particule * intensité du halo.
    // L'alpha suit le halo → les bords sont transparents.
    particleMaterial.colorNode = vec4(
        particleColor.mul(glow.mul(2.0)),  // RGB (×2 pour un peu de HDR)
        glow                                 // alpha
    );

    // --- Création du mesh et ajout à la scène ---
    // frustumCulled = false est ESSENTIEL : la bounding sphere de la
    // géométrie est minuscule (un quad de 0.05), mais les particules
    // se déplacent jusqu'à ±BOUNDS. Sans ça, Three.js cull le mesh
    // (le croit hors de l'écran) et rien ne s'affiche.
    particleMesh = new THREE.Mesh(geometry, particleMaterial);
    particleMesh.frustumCulled = false;
    scene.add(particleMesh);
}

// ============================================================
// 5. BOUCLE D'ANIMATION
// ============================================================
//
// Deux étapes par frame :
//   1. renderer.compute( computeNode )  → lance le kernel (mise à jour)
//   2. renderer.render( scene, camera ) → dessine les particules
//
// Le compute est un "dispatch" WebGPU : la carte graphique lance
// PARTICLE_COUNT threads en parallèle. Le render lit ensuite les positions
// fraîchement écrites dans le storage buffer. Tout reste sur le GPU.

function animate() {
    const now = performance.now() / 1000;
    const dt = lastTime === 0 ? 1 / 60 : Math.min(now - lastTime, 1 / 30);
    lastTime = now;

    // Avancer le temps TSL (utilisé par `time` dans le compute shader
    // pour la turbulence). Three.js met à jour `time` automatiquement,
    // mais on peut aussi le forcer.
    // (Pas nécessaire ici : `time` est un builtin mis à jour par le renderer.)

    // 1. Compute : mettre à jour toutes les particules en parallèle
    renderer.compute(computeNode);

    // 2. Render : dessiner la scène (les particules + la grille)
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
