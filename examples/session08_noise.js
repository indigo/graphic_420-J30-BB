import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { GUI } from 'https://unpkg.com/lil-gui@0.20.0/dist/lil-gui.esm.min.js';

// ============================================================
//  CONFIGURATION
// ============================================================
const PLANE_SIZE = 8;
const NOISE_SCALE = 4.0;           // fréquence de base du bruit
const OCTAVES = 5;                  // nombre d'octaves pour le FBM

// ============================================================
//  PARAMÈTRES GUI
// ============================================================
let NOISE_TYPE = 'value';          // 'value' | 'perlin' | 'simplex' | 'worley' | 'fbm'
let SCALE = NOISE_SCALE;
let CONTRAST = 1.0;                // multiplication du résultat (post-traitement)
let BRIGHTNESS = 0.0;              // offset ajouté au résultat
let ANIMATE = true;                // anime le bruit dans le temps
let TERRAIN_MODE = false;          // applique le bruit comme height map (displacement)

const params = {
    noiseType: NOISE_TYPE,
    scale: SCALE,
    contrast: CONTRAST,
    brightness: BRIGHTNESS,
    animate: ANIMATE,
    terrain: TERRAIN_MODE
};

function syncFromParams() {
    NOISE_TYPE = params.noiseType;
    SCALE = params.scale;
    CONTRAST = params.contrast;
    BRIGHTNESS = params.brightness;
    ANIMATE = params.animate;
    TERRAIN_MODE = params.terrain;
}

// ============================================================
//  THREE.JS — Scène, caméra, rendu
// ============================================================
let camera, scene, renderer, controls;
let plane, material, gui;
let elapsedTime = 0;
let lastTime = performance.now() / 1000;
let clockDelta = 0;

// ============================================================
//  GLSL — Toutes les fonctions de bruit dans une string
//  Insérée à la fois dans le vertex et le fragment shader.
//
//  sampleNoise(int type, vec2 p) est le point d'entrée unique.
// ============================================================
const NOISE_GLSL = /* glsl */`
    // ================================================================
    //  HASH — pseudo-aléatoire pour une coordonnée entière
    //  Retourne [0, 1]. Déterministe : même input → même output.
    // ================================================================
    float hash11(float p) {
        p = fract(p * 0.1031);
        p *= p + 33.33;
        p *= p + p;
        return fract(p);
    }

    float hash21(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    vec2 hash22(vec2 p) {
        // Hash sin-based (Inigo Quilez) — bien distribué pour les grilles entières
        return fract(sin(vec2(
            dot(p, vec2(127.1, 311.7)),
            dot(p, vec2(269.5, 183.3))
        )) * 43758.5453);
    }

    // ================================================================
    //  VALUE NOISE — interpolation de valeurs aléatoires sur une grille
    //  Le plus simple. "Bloqueux" : on voit les cellules de la grille.
    // ================================================================
    float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        // Smoothstep pour adoucir les transitions (sinon : bilinear dur)
        f = f * f * (3.0 - 2.0 * f);

        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));

        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    // ================================================================
    //  PERLIN NOISE (gradient noise) — interpolation de gradients
    //  Ken Perlin (1985). Plus doux que value noise : C1-continu.
    //  Chaque point de grille a un gradient aléatoire, et on calcule
    //  le produit scalaire entre le gradient et le vecteur vers le pixel.
    //  Implémentation : Stefan Gustavson / Ashima Arts — le standard GLSL.
    //  La clé : un hash par permutation (mod289 + permute) qui décorrèle
    //  vraiment les cellules voisines — pas de lignes de grille visibles.
    // ================================================================
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float perlinNoise(vec2 P) {
        vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
        vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
        Pi = mod289(Pi);                       // replie dans [0, 289)
        vec4 ix = Pi.xzxz;                     // indices des 4 coins
        vec4 iy = Pi.yyww;
        vec4 fx = Pf.xzxz;                     // offsets dans la cellule
        vec4 fy = Pf.yyww;

        // Hash par permutation → 2 composantes pseudo-aléatoires par coin
        vec4 i = permute(permute(ix) + iy);

        // Gradient directionnel : (gx, gy) — une "croix" tournée
        vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
        vec4 gy = abs(gx) - 0.5;
        vec4 tx = floor(gx + 0.5);
        gx = gx - tx;

        // Normalisation des 4 gradients (produit scalaire max ≈ 1)
        vec2 g00 = vec2(gx.x, gy.x);
        vec2 g10 = vec2(gx.y, gy.y);
        vec2 g01 = vec2(gx.z, gy.z);
        vec2 g11 = vec2(gx.w, gy.w);
        vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01),
                                       dot(g10, g10), dot(g11, g11)));
        g00 *= norm.x;
        g01 *= norm.y;
        g10 *= norm.z;
        g11 *= norm.w;

        // Produits scalaires gradient · offset
        float n00 = dot(g00, vec2(fx.x, fy.x));
        float n10 = dot(g10, vec2(fx.y, fy.y));
        float n01 = dot(g01, vec2(fx.z, fy.z));
        float n11 = dot(g11, vec2(fx.w, fy.w));

        // Quintic smoothstep + interpolation bilinéaire
        vec2 fade_xy = Pf.xy * Pf.xy * Pf.xy *
                       (Pf.xy * (Pf.xy * 6.0 - 15.0) + 10.0);
        vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
        float n_xy = mix(n_x.x, n_x.y, fade_xy.y);
        return 2.3 * n_xy * 0.5 + 0.5;   // remap [-1,1] → [0,1]
    }

    // ================================================================
    //  SIMPLEX NOISE — amélioration du Perlin par Perlin lui-même (2001)
    //  Grille triangulaire au lieu de carrée. Moins d'artefacts
    //  directionnels, plus rapide en N dimensions (N≥3).
    //  Implémentation 2D par Stefan Gustavson (simplifiée).
    // ================================================================
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

    float simplexNoise(vec2 p) {
        const vec4 C = vec4(0.211324865405187,  // (sqrt(3)-1)/2
                            0.366025403784439,  // (3-sqrt(3))/6
                           -0.577350269189626,  // -1/sqrt(3)
                            0.024390243902439); // 1/41
        vec2 i = floor(p + dot(p, C.yy));
        vec2 x0 = p - i + dot(i, C.xx);

        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;

        i = mod289(i);
        vec3 p1 = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                                + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                                 dot(x12.zw, x12.zw)), 0.0);
        m = m * m;
        m = m * m;

        vec3 x = 2.0 * fract(p1 * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;

        m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

        vec3 g;
        g.x = a0.x * x0.x + h.x * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g) * 0.5 + 0.5;
    }

    // ================================================================
    //  WORLEY NOISE (cellular) — distance aux points les plus proches
    //  Steven Worley (1996). Produit des cellules (type Voronoi).
    //  Idéal pour : écailles, bulles, pierre, cellules organiques.
    // ================================================================
    float worleyNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);

        float minDist = 1.0;

        // Chercher dans les 9 cellules voisines (3x3)
        for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
                vec2 neighbor = vec2(float(x), float(y));
                vec2 point = hash22(i + neighbor);
                // Point aléatoire dans la cellule
                vec2 diff = neighbor + point - f;
                float dist = length(diff);
                minDist = min(minDist, dist);
            }
        }
        return minDist;
    }

    // ================================================================
    //  FBM (Fractal Brownian Motion) — superposition d'octaves
    //  On additionne plusieurs couches de bruit à des fréquences
    //  croissantes et amplitudes décroissantes. Donne du détail
    //  à toutes les échelles — comme la nature.
    // ================================================================
    float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;

        for (int i = 0; i < ${OCTAVES}; i++) {
            value += amplitude * perlinNoise(p * frequency);
            frequency *= 2.0;    // lacunarité : double la fréquence
            amplitude *= 0.5;    // persistence : divise l'amplitude par 2
        }
        return value;
    }

    // ================================================================
    //  POINT D'ENTRÉE — sélectionne le bruit selon uNoiseType
    // ================================================================
    float sampleNoise(int type, vec2 p) {
        if (type == 0) return valueNoise(p);
        if (type == 1) return perlinNoise(p);
        if (type == 2) return simplexNoise(p);
        if (type == 3) return worleyNoise(p);
        if (type == 4) return fbm(p);
        return 0.0;
    }

    vec3 terrainColor(float h);
`;

init();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
    camera.position.set(0, 5, 9);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    createPlane();
    setupGUI();

    controls = new OrbitControls(camera, renderer.domElement);
    addEventListener('resize', onResize);
    renderer.setAnimationLoop(animate);
}

// ============================================================
//  PLANE — un plan subdivisé avec un ShaderMaterial custom
//  Le fragment shader calcule le bruit procédural.
//  Le vertex shader peut déplacer les sommets (terrain mode).
// ============================================================
function createPlane() {
    // Subdivisé pour le displacement (terrain mode)
    const geo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, 128, 128);
    geo.rotateX(-Math.PI / 2);

    material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uScale: { value: SCALE },
            uContrast: { value: CONTRAST },
            uBrightness: { value: BRIGHTNESS },
            uNoiseType: { value: 0 },    // 0=value, 1=perlin, 2=simplex, 3=worley, 4=fbm
            uTerrain: { value: 0 }
        },
        vertexShader: /* glsl */`
            uniform float uTime;
            uniform float uScale;
            uniform float uContrast;
            uniform int uNoiseType;
            uniform int uTerrain;

            varying vec2 vUv;
            varying float vHeight;

            // --- Inclut les fonctions de bruit (partagées vertex/fragment) ---
            ${NOISE_GLSL}

            void main() {
                vUv = uv * uScale;

                float h = 0.0;
                vec3 displaced = position;
                if (uTerrain == 1) {
                    vec2 p = vUv + (uTime * 0.05);
                    // Le contrast contrôle l'amplitude du relief
                    h = (sampleNoise(uNoiseType, p) - 0.5) * uContrast * 3.0;
                    displaced.y += h;
                }
                vHeight = h;

                gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
            }
        `,
        fragmentShader: /* glsl */`
            uniform float uTime;
            uniform float uScale;
            uniform float uContrast;
            uniform float uBrightness;
            uniform int uNoiseType;
            uniform int uTerrain;

            varying vec2 vUv;
            varying float vHeight;

            // --- Inclut les fonctions de bruit ---
            ${NOISE_GLSL}

            void main() {
                vec2 p = vUv;
                if (uTime > 0.0) p += uTime * 0.05;

                float n = sampleNoise(uNoiseType, p);
                n = n * uContrast + uBrightness;
                n = clamp(n, 0.0, 1.0);

                vec3 color;
                if (uTerrain == 1) {
                    // Normalise vHeight (qui est centré en 0) vers [0,1] pour la coloration
                    float hNorm = clamp(vHeight / (uContrast * 1.5) + 0.5, 0.0, 1.0);
                    color = terrainColor(hNorm);
                } else {
                    // Niveaux de gris avec une teinte légère
                    color = vec3(n);
                    // Subtle tint pour rendre ça moins terne
                    color *= vec3(0.9, 0.95, 1.0);
                }

                gl_FragColor = vec4(color, 1.0);
            }

            vec3 terrainColor(float h) {
                if (h < 0.1)  return vec3(0.2, 0.3, 0.6);       // eau
                if (h < 0.3)  return vec3(0.3, 0.5, 0.2);       // plaine
                if (h < 0.6)  return vec3(0.4, 0.35, 0.2);      // colline
                if (h < 0.9)  return vec3(0.5, 0.45, 0.4);      // montagne
                return vec3(0.9, 0.9, 0.95);                     // neige
            }
        `
    });

    plane = new THREE.Mesh(geo, material);
    scene.add(plane);
}

// ============================================================
//  GLSL — Toutes les fonctions de bruit dans une string
//  Insérée à la fois dans le vertex et le fragment shader.
//
//  sampleNoise(int type, vec2 p) est le point d'entrée unique.
// ============================================================

// ============================================================
//  GUI
// ============================================================
function setupGUI() {
    gui = new GUI();
    gui.add(params, 'noiseType',
        { 'Value': 'value', 'Perlin': 'perlin', 'Simplex': 'simplex',
          'Worley': 'worley', 'FBM': 'fbm' }
    ).name('Type de bruit');
    gui.add(params, 'scale', 1, 20, 0.5).name('Fréquence');
    gui.add(params, 'contrast', 0.0, 3.0, 0.05).name('Contraste');
    gui.add(params, 'brightness', -0.5, 0.5, 0.01).name('Luminosité');
    gui.add(params, 'animate').name('Animer');
    gui.add(params, 'terrain').name('Mode terrain');
}

// ============================================================
//  BOUCLE DE RENDU
// ============================================================
function animate() {
    const now = performance.now() / 1000;
    clockDelta = now - lastTime;
    lastTime = now;

    syncFromParams();

    const noiseTypeMap = { value: 0, perlin: 1, simplex: 2, worley: 3, fbm: 4 };
    material.uniforms.uNoiseType.value = noiseTypeMap[NOISE_TYPE];
    material.uniforms.uScale.value = SCALE;
    material.uniforms.uContrast.value = CONTRAST;
    material.uniforms.uBrightness.value = BRIGHTNESS;
    material.uniforms.uTerrain.value = TERRAIN_MODE ? 1 : 0;
    if (ANIMATE) elapsedTime += clockDelta;
    material.uniforms.uTime.value = ANIMATE ? elapsedTime : 0;

    renderer.render(scene, camera);
}

function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}
