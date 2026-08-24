import * as THREE from 'three';
import { GUI } from 'https://unpkg.com/lil-gui@0.20.0/dist/lil-gui.esm.min.js';

// ============================================================
//  CONFIGURATION
// ============================================================
const PLANE_SIZE = 6;

// ============================================================
//  PARAMÈTRES GUI
// ============================================================
const params = {
    textureType: 'marble',   // 'marble' | 'wood' | 'dissolve' | 'scales' | 'terrain'
    scale: 4.0,
    threshold: 0.5,          // pour dissolve
    exportPNG: () => exportPNG()
};

let TEXTURE_TYPE = params.textureType;
let SCALE = params.scale;
let THRESHOLD = params.threshold;

function syncFromParams() {
    TEXTURE_TYPE = params.textureType;
    SCALE = params.scale;
    THRESHOLD = params.threshold;
}

// ============================================================
//  THREE.JS — Scène orthographique (on veut une vue 2D plate)
// ============================================================
let camera, scene, renderer, gui;
let plane, material;
let elapsedTime = 0;
let lastTime = performance.now() / 1000;
let clockDelta = 0;

// ============================================================
//  GLSL — Fonctions de bruit (Gustavson/Ashima Perlin + Worley)
// ============================================================
const NOISE_GLSL = /* glsl */`
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
    vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float perlinNoise(vec2 P) {
        vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
        vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
        Pi = mod289(Pi);
        vec4 ix = Pi.xzxz;
        vec4 iy = Pi.yyww;
        vec4 fx = Pf.xzxz;
        vec4 fy = Pf.yyww;
        vec4 i = permute(permute(ix) + iy);
        vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
        vec4 gy = abs(gx) - 0.5;
        vec4 tx = floor(gx + 0.5);
        gx = gx - tx;
        vec2 g00 = vec2(gx.x, gy.x);
        vec2 g10 = vec2(gx.y, gy.y);
        vec2 g01 = vec2(gx.z, gy.z);
        vec2 g11 = vec2(gx.w, gy.w);
        vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01),
                                       dot(g10, g10), dot(g11, g11)));
        g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
        float n00 = dot(g00, vec2(fx.x, fy.x));
        float n10 = dot(g10, vec2(fx.y, fy.y));
        float n01 = dot(g01, vec2(fx.z, fy.z));
        float n11 = dot(g11, vec2(fx.w, fy.w));
        vec2 fade_xy = Pf.xy * Pf.xy * Pf.xy *
                       (Pf.xy * (Pf.xy * 6.0 - 15.0) + 10.0);
        vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
        float n_xy = mix(n_x.x, n_x.y, fade_xy.y);
        return 2.3 * n_xy * 0.5 + 0.5;
    }

    // Hash pour Worley
    vec2 hash22(vec2 p) {
        return fract(sin(vec2(
            dot(p, vec2(127.1, 311.7)),
            dot(p, vec2(269.5, 183.3))
        )) * 43758.5453);
    }

    float worleyNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float minDist = 1.0;
        for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
                vec2 neighbor = vec2(float(x), float(y));
                vec2 point = hash22(i + neighbor);
                vec2 diff = neighbor + point - f;
                minDist = min(minDist, length(diff));
            }
        }
        return minDist;
    }

    // FBM
    float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        for (int i = 0; i < 5; i++) {
            value += amplitude * perlinNoise(p * frequency);
            frequency *= 2.0;
            amplitude *= 0.5;
        }
        return value;
    }
`;

init();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    // Caméra orthographique pour une vue de face
    camera = new THREE.OrthographicCamera(
        -PLANE_SIZE / 2, PLANE_SIZE / 2,
        PLANE_SIZE / 2, -PLANE_SIZE / 2,
        0.1, 100
    );
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    createPlane();
    setupGUI();

    addEventListener('resize', onResize);
    renderer.setAnimationLoop(animate);
}

// ============================================================
//  PLANE — ShaderMaterial avec un fragment shader par texture
// ============================================================
function createPlane() {
    const geo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, 1, 1);

    material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uScale: { value: SCALE },
            uThreshold: { value: THRESHOLD },
            uTextureType: { value: 0 }  // 0=marble, 1=wood, 2=dissolve, 3=scales, 4=terrain
        },
        vertexShader: /* glsl */`
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: /* glsl */`
            uniform float uTime;
            uniform float uScale;
            uniform float uThreshold;
            uniform int uTextureType;

            varying vec2 vUv;

            ${NOISE_GLSL}

            // ============================================================
            //  MARBRE — veines sinusoïdales perturbées par du FBM
            // ============================================================
            vec3 marble(vec2 uv) {
                float n = fbm(uv * 2.0);
                // Veines : sinusoïde perturbée. abs() pour des veines nettes.
                float vein = abs(sin((uv.x + n * 1.5) * 3.14159));
                // Couleur : blanc → gris-bleu foncé
                vec3 light = vec3(0.95, 0.95, 0.92);
                vec3 dark  = vec3(0.3, 0.35, 0.45);
                return mix(dark, light, vein);
            }

            // ============================================================
            //  BOIS — anneaux concentriques déformés par du bruit
            // ============================================================
            vec3 wood(vec2 uv) {
                float n = perlinNoise(uv * 3.0);
                // Anneaux : sinus absolu (effet de rings)
                float rings = abs(sin((uv.x * 8.0 + n * 5.0) * 3.14159));
                // Couleur : bois clair → bois foncé
                vec3 light = vec3(0.8, 0.6, 0.35);
                vec3 dark  = vec3(0.4, 0.25, 0.12);
                return mix(dark, light, rings);
            }

            // ============================================================
            //  DISSOLVE — bruit seuillé, transition dure
            // ============================================================
            vec3 dissolve(vec2 uv) {
                float n = fbm(uv * 3.0);
                float mask = step(uThreshold, n);
                // Bordure lumineuse au seuil (effet "burn")
                float edge = smoothstep(uThreshold - 0.05, uThreshold, n)
                           - smoothstep(uThreshold, uThreshold + 0.05, n);
                vec3 base = vec3(0.1, 0.1, 0.15);
                vec3 solid = vec3(0.9, 0.9, 0.95);
                vec3 color = mix(base, solid, mask);
                color += edge * vec3(1.0, 0.5, 0.1);  // halo orange
                return color;
            }

            // ============================================================
            //  ÉCAILLES (Worley) — cellules avec bordures
            // ============================================================
            vec3 scales(vec2 uv) {
                float w = worleyNoise(uv * 4.0);
                // Bordures : inverse du worley, seuillé
                float border = 1.0 - smoothstep(0.0, 0.15, w);
                // Couleur de base : dégradé selon la distance
                vec3 base = mix(vec3(0.2, 0.5, 0.6), vec3(0.4, 0.7, 0.8), w);
                // Bordures sombres
                return mix(base, vec3(0.05, 0.1, 0.15), border);
            }

            // ============================================================
            //  TERRAIN — FBM comme height map, coloration par altitude
            // ============================================================
            vec3 terrain(vec2 uv) {
                float h = fbm(uv * 2.0);
                vec3 color;
                if (h < 0.45)      color = vec3(0.15, 0.25, 0.5);   // eau profonde
                else if (h < 0.5)  color = vec3(0.2, 0.35, 0.6);    // eau peu profonde
                else if (h < 0.55) color = vec3(0.85, 0.8, 0.6);    // sable
                else if (h < 0.65) color = vec3(0.3, 0.5, 0.2);     // plaine
                else if (h < 0.75) color = vec3(0.25, 0.4, 0.15);   // forêt
                else if (h < 0.85) color = vec3(0.4, 0.35, 0.25);   // montagne
                else               color = vec3(0.95, 0.95, 0.98);  // neige
                // Lissage des transitions
                float t = smoothstep(0.43, 0.57, h);
                return color;
            }

            void main() {
                vec2 uv = vUv * uScale;
                // Léger mouvement pour voir que c'est animé
                uv += uTime * 0.02;

                vec3 color;
                if (uTextureType == 0)      color = marble(uv);
                else if (uTextureType == 1) color = wood(uv);
                else if (uTextureType == 2) color = dissolve(uv);
                else if (uTextureType == 3) color = scales(uv);
                else                        color = terrain(uv);

                gl_FragColor = vec4(color, 1.0);
            }
        `
    });

    plane = new THREE.Mesh(geo, material);
    scene.add(plane);
}

// ============================================================
//  GUI
// ============================================================
function setupGUI() {
    gui = new GUI();
    gui.add(params, 'textureType',
        { 'Marbre': 'marble', 'Bois': 'wood', 'Dissolve': 'dissolve',
          'Écailles': 'scales', 'Terrain': 'terrain' }
    ).name('Texture');
    gui.add(params, 'scale', 1, 12, 0.5).name('Fréquence');
    gui.add(params, 'threshold', 0.0, 1.0, 0.01).name('Seuil (dissolve)');
    gui.add(params, 'exportPNG').name('Exporter PNG');
}

// ============================================================
//  EXPORT PNG — sauve le canvas comme image
// ============================================================
function exportPNG() {
    // Rendre une frame à la résolution voulue
    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `texture_${TEXTURE_TYPE}.png`;
    link.click();
}

// ============================================================
//  BOUCLE DE RENDU
// ============================================================
function animate() {
    const now = performance.now() / 1000;
    clockDelta = now - lastTime;
    lastTime = now;

    syncFromParams();

    const typeMap = { marble: 0, wood: 1, dissolve: 2, scales: 3, terrain: 4 };
    material.uniforms.uTextureType.value = typeMap[TEXTURE_TYPE];
    material.uniforms.uScale.value = SCALE;
    material.uniforms.uThreshold.value = THRESHOLD;
    elapsedTime += clockDelta;
    material.uniforms.uTime.value = elapsedTime;

    renderer.render(scene, camera);
}

function onResize() {
    const aspect = innerWidth / innerHeight;
    camera.left = -PLANE_SIZE / 2 * aspect;
    camera.right = PLANE_SIZE / 2 * aspect;
    camera.top = PLANE_SIZE / 2;
    camera.bottom = -PLANE_SIZE / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}
