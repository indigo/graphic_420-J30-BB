import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { EffectComposer } from 'jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'jsm/postprocessing/OutputPass.js';
import { BokehPass } from 'jsm/postprocessing/BokehPass.js';
import { GUI } from 'jsm/libs/lil-gui.module.min.js';

// ============================================================
//  Session 11 — Post-Processing Demo
//
//  Démontre le pipeline de post-processing :
//    RenderPass → Bloom → Vignette → Chromatic Aberration
//    → Tone Mapping (OutputPass)
//
//  La scène contient des objets lumineux (émissifs) pour
//  bien voir le bloom, et des objets sombres pour le contraste.
// ============================================================

// ------------------------------------------------------------
//  Setup
// ------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0a0a14);
renderer.toneMapping = THREE.ACESFilmicToneMapping;  // OutputPass lit cette valeur
// Important : rendu en HalfFloat pour préserver l'HDR dans le render target
// Sans ça, les valeurs > 1.0 sont clamped avant que le bloom les voie
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0a14, 0.015);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(5, 4, 8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

// Lumières
const hemiLight = new THREE.HemisphereLight(0x8090ff, 0x404030, 0.6);
scene.add(hemiLight);
scene.add(new THREE.AmbientLight(0x404050, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);
// Une deuxième lumière pour déboucher les ombres
const fillLight = new THREE.DirectionalLight(0x6080ff, 0.5);
fillLight.position.set(-5, 5, -5);
scene.add(fillLight);

// ------------------------------------------------------------
//  Scène : objets variés pour montrer les effets
// ------------------------------------------------------------

// Sol
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.9 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Sphères émissives (pour le bloom) — réparties sur une spirale
const emissiveColors = [0xff3030, 0x30ff60, 0x3060ff, 0xffaa30, 0xff30ff];
const emissiveSpheres = [];
for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const r = 2 + i * 0.8;  // spirale qui s'éloigne
    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 32, 32),
        new THREE.MeshStandardMaterial({
            color: emissiveColors[i],
            emissive: emissiveColors[i],
            emissiveIntensity: 2.0,
            roughness: 0.3,
        })
    );
    sphere.position.set(Math.cos(angle) * r, 1.0 + i * 0.5, Math.sin(angle) * r);
    sphere.userData = { baseY: 1.0 + i * 0.5, phase: i };
    scene.add(sphere);
    emissiveSpheres.push(sphere);
}

// Cube central (non émissif, pour le contraste)
const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.5, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 0.5, metalness: 0.3 })
);
cube.position.set(0, 0.75, 0);
scene.add(cube);

// Piliers (pour la profondeur / DoF)
const pillarMat = new THREE.MeshStandardMaterial({ color: 0x303040, roughness: 0.8 });
for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const r = 6;
    const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 3, 0.3),
        pillarMat
    );
    pillar.position.set(Math.cos(angle) * r, 1.5, Math.sin(angle) * r);
    scene.add(pillar);
}

// ------------------------------------------------------------
//  Post-Processing : EffectComposer
// ------------------------------------------------------------

// --- Pass 1 : Rendu de la scène ---
const renderPass = new RenderPass(scene, camera);

// --- Pass 2 : Bloom ---
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.3,   // strength
    0.3,   // radius
    1.0    // threshold (HDR > 1.0 devient bloom)
);

// --- Pass 3 : Vignette (custom ShaderPass) ---
const vignettePass = new ShaderPass({
    uniforms: {
        tDiffuse: { value: null },
        offset:   { value: 1.0 },
        darkness: { value: 1.0 },
    },
    vertexShader: `
        varying vec2 vUV;
        void main() {
            vUV = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float offset;
        uniform float darkness;
        varying vec2 vUV;

        void main() {
            vec4 color = texture2D(tDiffuse, vUV);
            vec2 uv = (vUV - vec2(0.5)) * offset;
            float vignette = 1.0 - dot(uv, uv) * darkness;
            vignette = clamp(vignette, 0.0, 1.0);
            gl_FragColor = vec4(color.rgb * vignette, color.a);
        }
    `,
});

// --- Pass 4 : Chromatic Aberration (custom ShaderPass) ---
const chromaticPass = new ShaderPass({
    uniforms: {
        tDiffuse: { value: null },
        amount:   { value: 0.002 },
    },
    vertexShader: `
        varying vec2 vUV;
        void main() {
            vUV = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float amount;
        varying vec2 vUV;

        void main() {
            vec2 dir = vUV - vec2(0.5);
            float r = texture2D(tDiffuse, vUV + dir * amount).r;
            float g = texture2D(tDiffuse, vUV).g;
            float b = texture2D(tDiffuse, vUV - dir * amount).b;
            gl_FragColor = vec4(r, g, b, 1.0);
        }
    `,
});

// --- Pass 5 : Old TV (CRT effect — scanlines + curvature + flicker + desaturation) ---
const oldTvPass = new ShaderPass({
    uniforms: {
        tDiffuse:    { value: null },
        time:        { value: 0 },
        scanlineDensity: { value: 800 },
        scanlineIntensity: { value: 0.15 },
        curvature:   { value: 0.15 },
        flicker:     { value: 0.03 },
        desaturation: { value: 0.3 },
        rgbShift:    { value: 0.001 },
    },
    vertexShader: `
        varying vec2 vUV;
        void main() {
            vUV = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float scanlineDensity;
        uniform float scanlineIntensity;
        uniform float curvature;
        uniform float flicker;
        uniform float desaturation;
        uniform float rgbShift;
        varying vec2 vUV;

        // Barrel distortion (courbure du tube CRT)
        vec2 curveUV(vec2 uv, float amount) {
            uv = uv * 2.0 - 1.0;  // [0,1] → [-1,1]
            vec2 offset = abs(uv.yx) / vec2(1.0, 0.75);  // plus de courbure vertical
            uv = uv + uv * offset * offset * amount;
            uv = uv * 0.5 + 0.5;  // [-1,1] → [0,1]
            return uv;
        }

        void main() {
            vec2 uv = curveUV(vUV, curvature);

            // Hors-bord : noir (le tube ne couvre pas tout)
            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }

            // RGB shift (séparation des canaux — lentille CRT bon marché)
            vec2 dir = uv - vec2(0.5);
            float r = texture2D(tDiffuse, uv + dir * rgbShift).r;
            float g = texture2D(tDiffuse, uv).g;
            float b = texture2D(tDiffuse, uv - dir * rgbShift).b;
            vec3 color = vec3(r, g, b);

            // Désaturation (vieil écran pas très coloré)
            float gray = dot(color, vec3(0.299, 0.587, 0.114));
            color = mix(color, vec3(gray), desaturation);

            // Scanlines (lignes horizontales sombres)
            float scanline = sin(uv.y * scanlineDensity) * 0.5 + 0.5;
            color *= 1.0 - scanlineIntensity * scanline;

            // Flicker (scintillement subtil)
            float flick = 1.0 - flicker * (fract(sin(time * 120.0) * 43758.5453) - 0.5);
            color *= flick;

            // Vignette CRT (bords sombres du tube)
            vec2 vig = (uv - 0.5) * 2.0;
            float vignette = 1.0 - dot(vig, vig) * 0.4;
            color *= clamp(vignette, 0.0, 1.0);

            gl_FragColor = vec4(color, 1.0);
        }
    `,
});

// --- Pass 6 : Tone Mapping + Gamma (OutputPass) ---
// OutputPass fait tone mapping (ACES par défaut) + gamma correction
const outputPass = new OutputPass();

// --- Assembler le composer ---
// renderTarget en HalfFloat pour préserver l'HDR (valeurs > 1.0)
// Sans ça, le bloom ne voit jamais les vraies valeurs HDR
const renderTarget = new THREE.WebGLRenderTarget(
    window.innerWidth, window.innerHeight,
    { type: THREE.HalfFloatType, format: THREE.RGBAFormat }
);
const composer = new EffectComposer(renderer, renderTarget);
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(vignettePass);
composer.addPass(chromaticPass);
composer.addPass(oldTvPass);
composer.addPass(outputPass);

// ------------------------------------------------------------
//  GUI
// ------------------------------------------------------------
const params = {
    bloomEnabled: true,
    bloomStrength: 0.3,
    bloomRadius: 0.3,
    bloomThreshold: 1.0,

    vignetteEnabled: true,
    vignetteOffset: 1.0,
    vignetteDarkness: 1.0,

    chromaticEnabled: false,
    chromaticAmount: 0.002,

    oldTvEnabled: false,
    tvScanlineIntensity: 0.15,
    tvCurvature: 0.15,
    tvFlicker: 0.03,
    tvDesaturation: 0.3,
    tvRgbShift: 0.001,

    toneMapping: 'ACES',
    emissiveIntensity: 2.0,

    showOriginal: false,  // bypass tout post-processing
};

const gui = new GUI({ title: 'Post-Processing' });

// Bloom folder
const bloomFolder = gui.addFolder('Bloom');
bloomFolder.add(params, 'bloomEnabled').name('Activé').onChange(updatePasses);
bloomFolder.add(params, 'bloomStrength', 0, 3, 0.05).name('Intensité').onChange(v => bloomPass.strength = v);
bloomFolder.add(params, 'bloomRadius', 0, 1, 0.05).name('Rayon').onChange(v => bloomPass.radius = v);
bloomFolder.add(params, 'bloomThreshold', 0, 2, 0.05).name('Seuil').onChange(v => bloomPass.threshold = v);

// Vignette folder
const vignetteFolder = gui.addFolder('Vignette');
vignetteFolder.add(params, 'vignetteEnabled').name('Activé').onChange(updatePasses);
vignetteFolder.add(params, 'vignetteOffset', 0.5, 2.0, 0.05).name('Offset').onChange(v => vignettePass.uniforms.offset.value = v);
vignetteFolder.add(params, 'vignetteDarkness', 0, 2.0, 0.05).name('Obscurité').onChange(v => vignettePass.uniforms.darkness.value = v);

// Chromatic folder
const chromaticFolder = gui.addFolder('Aberration Chromatique');
chromaticFolder.add(params, 'chromaticEnabled').name('Activé').onChange(updatePasses);
chromaticFolder.add(params, 'chromaticAmount', 0, 0.01, 0.0005).name('Intensité').onChange(v => chromaticPass.uniforms.amount.value = v);

// Old TV folder
const tvFolder = gui.addFolder('Vieux Téléviseur (CRT)');
tvFolder.add(params, 'oldTvEnabled').name('Activé').onChange(updatePasses);
tvFolder.add(params, 'tvScanlineIntensity', 0, 0.5, 0.01).name('Scanlines').onChange(v => oldTvPass.uniforms.scanlineIntensity.value = v);
tvFolder.add(params, 'tvCurvature', 0, 0.5, 0.01).name('Courbure tube').onChange(v => oldTvPass.uniforms.curvature.value = v);
tvFolder.add(params, 'tvFlicker', 0, 0.1, 0.005).name('Scintillement').onChange(v => oldTvPass.uniforms.flicker.value = v);
tvFolder.add(params, 'tvDesaturation', 0, 1, 0.05).name('Désaturation').onChange(v => oldTvPass.uniforms.desaturation.value = v);
tvFolder.add(params, 'tvRgbShift', 0, 0.005, 0.0002).name('Séparation RGB').onChange(v => oldTvPass.uniforms.rgbShift.value = v);

// Tone mapping folder
const toneFolder = gui.addFolder('Tone Mapping');
toneFolder.add(params, 'toneMapping', ['None', 'Reinhard', 'ACES', 'AgX']).name('Opérateur').onChange(updateToneMapping);

// Scene folder
const sceneFolder = gui.addFolder('Scène');
sceneFolder.add(params, 'emissiveIntensity', 0, 5, 0.1).name('Intensité émissive').onChange(v => {
    emissiveSpheres.forEach(s => s.material.emissiveIntensity = v);
});
sceneFolder.add(params, 'showOriginal').name('Sans post-FX (comparaison)').onChange(updatePasses);

function updatePasses() {
    bloomPass.enabled = params.bloomEnabled && !params.showOriginal;
    vignettePass.enabled = params.vignetteEnabled && !params.showOriginal;
    chromaticPass.enabled = params.chromaticEnabled && !params.showOriginal;
    oldTvPass.enabled = params.oldTvEnabled && !params.showOriginal;
    outputPass.enabled = !params.showOriginal;
}

function getToneMappingEnum() {
    const tm = params.toneMapping;
    if (tm === 'Reinhard') return THREE.ReinhardToneMapping;
    if (tm === 'ACES') return THREE.ACESFilmicToneMapping;
    if (tm === 'AgX') return THREE.AgXToneMapping;
    return THREE.NoToneMapping;
}

function updateToneMapping() {
    // OutputPass lit renderer.toneMapping directement — pas de propriété propre
    renderer.toneMapping = getToneMappingEnum();
}

updateToneMapping();
updatePasses();

// ------------------------------------------------------------
//  FPS counter
// ------------------------------------------------------------
const fpsEl = document.getElementById('fps');
let frames = 0, lastTime = performance.now();

// ------------------------------------------------------------
//  Animation
// ------------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const dt = clock.getDelta();
    const t = clock.getElapsedTime();

    // Faire flotter les sphères émissives
    emissiveSpheres.forEach((s, i) => {
        s.position.y = s.userData.baseY + Math.sin(t * 2 + s.userData.phase) * 0.3;
    });

    // Faire tourner le cube
    cube.rotation.y = t * 0.5;

    // Mettre à jour le time pour le flicker du vieux TV
    oldTvPass.uniforms.time.value = t;

    controls.update();

    if (params.showOriginal) {
        renderer.render(scene, camera);
    } else {
        composer.render();
    }

    // FPS
    frames++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
        fpsEl.textContent = Math.round(frames * 1000 / (now - lastTime)) + ' FPS';
        frames = 0;
        lastTime = now;
    }
}

// ------------------------------------------------------------
//  Resize
// ------------------------------------------------------------
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth, window.innerHeight);
});

animate();
