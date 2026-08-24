// ===================== WEBGPU 101 =====================
// Triangle simple rendu avec le WebGPURenderer de Three.js.
// On définit 3 sommets avec une couleur par sommet ; le fragment
// shader (écrit en TSL — Three Shading Language) interpole ces
// couleurs à travers le triangle.
//
// Contrairement à WebGL + ShaderMaterial (voir shaders_101.js),
// on n'écrit pas de GLSL : on compose le shader avec des "nodes"
// TSL qui sont compilés vers WGSL par Three.js.

import * as THREE from 'three';
import { attribute, varying, vec3, vec4 } from 'three/tsl';

let renderer, scene, camera, mesh;

init();

async function init() {
    // --- Renderer WebGPU ---
    // WebGPURenderer est asynchrone : il faut attendre init() avant
    // de pouvoir rendre. Il retombe sur WebGL2 si WebGPU est absent.
    renderer = new THREE.WebGPURenderer({ antialias: true });
    await renderer.init();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Indiquer dans la page quel backend est réellement utilisé
    const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2 (fallback)';
    document.getElementById('info').textContent = `WebGPU 101 — Triangle (${backend})`;

    // --- Scène & caméra ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111122);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 4);

    // --- Géométrie : un triangle (3 sommets) ---
    // Chaque sommet a une position (XY dans le plan z=0) et une couleur RGB.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        -1.0, -0.8, 0.0,   // sommet 0 : bas-gauche  → rouge
         1.0, -0.8, 0.0,   // sommet 1 : bas-droite → vert
         0.0,  1.0, 0.0    // sommet 2 : haut       → bleu
    ], 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute([
        1.0, 0.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 0.0, 1.0
    ], 3));
    geometry.setIndex([0, 1, 2]); // un seul triangle

    // --- Matériau "node" (TSL) ---
    // MeshBasicNodeMaterial = équivalent de MeshBasicMaterial, mais le
    // shader est piloté par la propriété `.colorNode` (un node TSL).
    //
    // Ici on lit l'attribut 'color' par sommet et on le passe au fragment
    // shader via un varying. C'est l'équivalent TSL de :
    //   // vertex shader GLSL
    //   varying vec3 vColor;
    //   void main() {
    //     vColor = color;
    //     gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    //   }
    //   // fragment shader GLSL
    //   varying vec3 vColor;
    //   void main() { gl_FragColor = vec4(vColor, 1.0); }
    const vColor = varying(attribute('color'), 'vColor');

    const material = new THREE.MeshBasicNodeMaterial();
    material.colorNode = vec4(vColor, 1.0);
    // Astuce : on peut aussi écrire `material.colorNode = vec4(vColor, 1.0);`
    // directement. positionLocal est utilisé implicitement par le vertex
    // shader par défaut (projectionMatrix * modelViewMatrix * positionLocal).

    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // --- Resize ---
    window.addEventListener('resize', onWindowResize, false);

    // --- Lancement : WebGPU utilise setAnimationLoop comme WebGL ---
    renderer.setAnimationLoop(animate);
}

function animate() {
    // Faire tourner le triangle pour bien voir les 3 couleurs
    mesh.rotation.z += 0.01;
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
