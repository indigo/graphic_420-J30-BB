import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'jsm/loaders/RGBELoader.js';
import { GUI } from 'https://unpkg.com/lil-gui@0.20.0/dist/lil-gui.esm.min.js';

// ============================================================
//  SESSION 06 — BAKED LIGHTING EN THREE.JS
//  TP : Appliquer un lightmap baked et un environment map
//  sur une scène exportée depuis Blender.
// ============================================================

// --- Paramètres ---
const params = {
    useLightmap: true,
    lightmapIntensity: 1.0,
    useEnvironment: true,
    envIntensity: 1.0,
    useRealtimeLights: false,
};

let scene, camera, renderer;
let controls;
let bakedObjects = []; // meshes avec lightmap
let realtimeLights = [];

init();
animate();

function init() {
    // --- Scène ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    // --- Caméra ---
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(7, -7, 5);
    camera.lookAt(0, 0, 1);

    // --- Renderer ---
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.body.appendChild(renderer.domElement);

    // --- Controls ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 1);
    controls.update();

    // --- Lumières temps réel (désactivées par défaut) ---
    const dirLight = new THREE.DirectionalLight(0xffffff, 3.0);
    dirLight.position.set(5, -5, 8);
    dirLight.angle = THREE.MathUtils.degToRad(50);
    scene.add(dirLight);
    realtimeLights.push(dirLight);

    const pointLight = new THREE.PointLight(0xffe6b3, 200, 20);
    pointLight.position.set(0, 0, 2.8);
    scene.add(pointLight);
    realtimeLights.push(pointLight);

    // Désactiver les lumières temps réel par défaut
    realtimeLights.forEach(l => l.visible = false);

    // --- Environment Map (HDR) ---
    // TODO ÉTUDIANT : Charger un environment map HDR
    // Utilisez RGBELoader pour charger un fichier .hdr
    // Assignez-le à scene.environment
    // Voir la documentation : https://threejs.org/docs/#api/en/scenes/Scene.environment
    //
    // Indice :
    //   new RGBELoader().load('textures/nom_du_fichier.hdr', (texture) => {
    //       texture.mapping = THREE.EquirectangularReflectionMapping;
    //       scene.environment = texture;
    //   });

    // --- Charger la scène Blender (.glb) ---
    const loader = new GLTFLoader();
    loader.load('session06_bake_scene.glb', (gltf) => {
        const model = gltf.scene;
        scene.add(model);

        // Parcourir tous les meshes et préparer le lightmap
        model.traverse((child) => {
            if (child.isMesh) {
                bakedObjects.push(child);

                // TODO ÉTUDIANT : Appliquer le lightmap sur chaque mesh
                // 1. Charger la texture de lightmap (session06_lightmap.png)
                // 2. L'assigner à child.material.lightMap
                // 3. Régler child.material.lightMapIntensity
                //
                // Indice :
                //   const lightmapTex = new THREE.TextureLoader().load('session06_lightmap.png');
                //   lightmapTex.colorSpace = THREE.SRGBColorSpace;
                //   child.material.lightMap = lightmapTex;
                //   child.material.lightMapIntensity = params.lightmapIntensity;
                //   child.material.needsUpdate = true;

                // TODO ÉTUDIANT (BONUS) : Appliquer une AO map
                // child.material.aoMap = aoTexture;
                // child.material.aoMapIntensity = 1.0;
            }
        });

        console.log(`Scène chargée : ${bakedObjects.length} meshes`);
    }, undefined, (error) => {
        console.error('Erreur de chargement .glb :', error);
        console.log('Assurez-vous d\'avoir exporté la scène depuis Blender en .glb');
    });

    // --- GUI ---
    setupGUI();

    // --- Resize ---
    window.addEventListener('resize', onResize);
}

function setupGUI() {
    const gui = new GUI({ title: 'Baked Lighting' });

    const folderBake = gui.addFolder('Lightmap');
    folderBake.add(params, 'useLightmap').name('Lightmap ON/OFF').onChange(toggleLightmap);
    folderBake.add(params, 'lightmapIntensity', 0, 3, 0.1).name('Intensité').onChange(updateLightmapIntensity);

    const folderEnv = gui.addFolder('Environment');
    folderEnv.add(params, 'useEnvironment').name('Env Map ON/OFF').onChange(toggleEnvironment);
    folderEnv.add(params, 'envIntensity', 0, 3, 0.1).name('Intensité Env').onChange(updateEnvIntensity);

    const folderRT = gui.addFolder('Lumières temps réel');
    folderRT.add(params, 'useRealtimeLights').name('Realtime ON/OFF').onChange(toggleRealtimeLights);
}

function toggleLightmap() {
    bakedObjects.forEach(child => {
        if (child.material) {
            child.material.lightMapIntensity = params.useLightmap ? params.lightmapIntensity : 0;
        }
    });
}

function updateLightmapIntensity() {
    if (params.useLightmap) {
        bakedObjects.forEach(child => {
            if (child.material) {
                child.material.lightMapIntensity = params.lightmapIntensity;
            }
        });
    }
}

function toggleEnvironment() {
    scene.environmentIntensity = params.useEnvironment ? params.envIntensity : 0;
}

function updateEnvIntensity() {
    if (params.useEnvironment) {
        scene.environmentIntensity = params.envIntensity;
    }
}

function toggleRealtimeLights() {
    realtimeLights.forEach(l => l.visible = params.useRealtimeLights);
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
