import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { GUI } from 'https://unpkg.com/lil-gui@0.20.0/dist/lil-gui.esm.min.js';

// ============================================================
//  CONFIGURATION
// ============================================================
const RT_SIZE = 1024;
const WATER_SIZE = 12;

// ============================================================
//  PARAMÈTRES GUI
// ============================================================
const params = {
    waveSpeed: 0.8,
    waveScale: 0.15,
    distortionStrength: 0.08,
    fresnelPower: 2.0,
    waterColor: '#0a2030',
    deepColor: '#050a10'
};

// ============================================================
//  THREE.JS
// ============================================================
let camera, scene, renderer, controls, gui;
let waterMesh, waterMaterial;
let reflectionCamera;
let renderTarget;
let sceneObjects = [];
let elapsedTime = 0;
let lastTime = performance.now() / 1000;

// Matrice de réflexion pour le plan Y=0
const reflectionMatrix = new THREE.Matrix4();

init();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 25, 60);

    camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
    camera.position.set(5, 3.5, 7);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Render target pour la réflexion
    renderTarget = new THREE.WebGLRenderTarget(RT_SIZE, RT_SIZE);

    // Caméra de réflexion
    reflectionCamera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);

    // Matrice de réflexion : miroir par rapport au plan Y=0
    // [1  0  0  0]
    // [0 -1  0  0]
    // [0  0  1  0]
    // [0  0  0  1]
    reflectionMatrix.set(
        1, 0, 0, 0,
        0, -1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    );

    createSceneObjects();
    createWater();
    setupGUI();

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.maxPolarAngle = Math.PI * 0.495;

    addEventListener('resize', onResize);
    renderer.setAnimationLoop(animate);
}

// ============================================================
//  SCENE — objets au-dessus de l'eau
// ============================================================
function createSceneObjects() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(5, 10, 5);
    scene.add(sun);

    const colors = [0xe74c3c, 0x2ecc71, 0x3498db, 0xf1c40f, 0x9b59b6, 0xe67e22];
    const geos = [
        new THREE.BoxGeometry(1.5, 1.5, 1.5),
        new THREE.SphereGeometry(0.8, 32, 32),
        new THREE.CylinderGeometry(0.5, 0.5, 1.5, 32),
        new THREE.TorusGeometry(0.6, 0.2, 16, 64),
        new THREE.BoxGeometry(0.6, 3, 0.6),
        new THREE.ConeGeometry(0.7, 1.5, 32)
    ];
    const positions = [
        [-2, 0.75, -1], [1.5, 0.8, 1], [0, 0.75, -2.5],
        [2.5, 0.8, -1.5], [-3, 1.5, 2], [3, 0.75, 2.5]
    ];

    for (let i = 0; i < colors.length; i++) {
        const mesh = new THREE.Mesh(
            geos[i],
            new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.4 })
        );
        mesh.position.set(...positions[i]);
        if (i === 3) mesh.rotation.x = Math.PI / 2;
        scene.add(mesh);
        sceneObjects.push(mesh);
    }

    // Sol sous l'eau (pour voir à travers)
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(WATER_SIZE * 2, WATER_SIZE * 2),
        new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2;
    scene.add(floor);
}

// ============================================================
//  EAU — ShaderMaterial avec projective texturing + 2 vagues
// ============================================================
function createWater() {
    const geo = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, 256, 256);
    geo.rotateX(-Math.PI / 2);

    waterMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uReflection: { value: renderTarget.texture },
            uTime: { value: 0 },
            uWaveSpeed: { value: params.waveSpeed },
            uWaveScale: { value: params.waveScale },
            uDistortion: { value: params.distortionStrength },
            uFresnelPower: { value: params.fresnelPower },
            uWaterColor: { value: new THREE.Color(params.waterColor) },
            uDeepColor: { value: new THREE.Color(params.deepColor) },
            uReflectionVP: { value: new THREE.Matrix4() },
            uCameraPos: { value: new THREE.Vector3() },
            uSunDir: { value: new THREE.Vector3(0.5, 1.0, 0.5).normalize() }
        },
        vertexShader: /* glsl */`
            uniform float uTime;
            uniform float uWaveSpeed;
            uniform float uWaveScale;

            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying vec2 vUv;

            // Value noise + FBM pour le vertex displacement (vagues visibles)
            float hash21(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }
            float valueNoise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
                           mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
            }
            float fbm(vec2 p) {
                float v = 0.0, a = 0.5, f = 1.0;
                for (int i = 0; i < 4; i++) {
                    v += a * valueNoise(p * f);
                    f *= 2.0; a *= 0.5;
                }
                return v;
            }

            void main() {
                vUv = uv;
                vec3 pos = position;

                // 2 vagues en sens opposé → vertex displacement
                float w1 = fbm(pos.xz * uWaveScale + vec2(uTime * uWaveSpeed, 0.0));
                float w2 = fbm(pos.xz * uWaveScale * 1.3 - vec2(uTime * uWaveSpeed * 0.7, uTime * uWaveSpeed * 0.5));
                float height = (w1 + w2 - 1.0) * 0.3;
                pos.y += height;

                // Normale approximée par différences finies
                float eps = 0.1;
                float hx = fbm((pos.xz + vec2(eps, 0.0)) * uWaveScale + vec2(uTime * uWaveSpeed, 0.0))
                         + fbm((pos.xz + vec2(eps, 0.0)) * uWaveScale * 1.3 - vec2(uTime * uWaveSpeed * 0.7, uTime * uWaveSpeed * 0.5));
                float hz = fbm((pos.xz + vec2(0.0, eps)) * uWaveScale + vec2(uTime * uWaveSpeed, 0.0))
                         + fbm((pos.xz + vec2(0.0, eps)) * uWaveScale * 1.3 - vec2(uTime * uWaveSpeed * 0.7, uTime * uWaveSpeed * 0.5));
                vNormal = normalize(vec3(-(hx - height) / eps * 0.3, 1.0, -(hz - height) / eps * 0.3));

                vec4 worldPos = modelMatrix * vec4(pos, 1.0);
                vWorldPos = worldPos.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `,
        fragmentShader: /* glsl */`
            uniform sampler2D uReflection;
            uniform float uTime;
            uniform float uWaveSpeed;
            uniform float uWaveScale;
            uniform float uDistortion;
            uniform float uFresnelPower;
            uniform vec3 uWaterColor;
            uniform vec3 uDeepColor;
            uniform mat4 uReflectionVP;
            uniform vec3 uCameraPos;
            uniform vec3 uSunDir;

            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying vec2 vUv;

            // Value noise pour la distortion du fragment
            float hash21(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }
            float valueNoise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
                           mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
            }
            float fbm(vec2 p) {
                float v = 0.0, a = 0.5, f = 1.0;
                for (int i = 0; i < 4; i++) {
                    v += a * valueNoise(p * f);
                    f *= 2.0; a *= 0.5;
                }
                return v;
            }

            void main() {
                // ============================================================
                //  2 VAGUES en sens opposé (fragment-level distortion)
                // ============================================================
                vec2 p1 = vWorldPos.xz * uWaveScale + vec2(uTime * uWaveSpeed, 0.0);
                vec2 p2 = vWorldPos.xz * uWaveScale * 1.3 - vec2(uTime * uWaveSpeed * 0.7, uTime * uWaveSpeed * 0.5);
                float w1 = fbm(p1);
                float w2 = fbm(p2);
                float waveSum = (w1 + w2) * 0.5;  // [0, 1]

                // Normale perturbée par les vagues (plus de détail que la vertex normal)
                vec3 normal = normalize(vNormal + vec3(
                    (w1 - 0.5) * uDistortion * 2.0,
                    0.0,
                    (w2 - 0.5) * uDistortion * 2.0
                ));

                // ============================================================
                //  RÉFLEXION — projective texturing
                //  On projette la position world-space dans l'espace de la
                //  caméra de réflexion pour obtenir les UV correctes.
                // ============================================================
                vec4 projected = uReflectionVP * vec4(vWorldPos, 1.0);
                vec3 projCoord = projected.xyz / projected.w;
                // projCoord est en NDC [-1, 1] → remap vers [0, 1]
                vec2 reflectUv = projCoord.xy * 0.5 + 0.5;

                // Distortion des UV par la normale des vagues
                reflectUv += normal.xz * uDistortion;
                reflectUv = clamp(reflectUv, 0.0, 1.0);

                vec3 reflection = texture(uReflection, reflectUv).rgb;

                // ============================================================
                //  FRESNEL — angle de vue
                //  De biais : réflexion forte. De haut : on voit sous l'eau.
                //  Minimum de 0.4 pour toujours voir la réflexion.
                // ============================================================
                vec3 viewDir = normalize(uCameraPos - vWorldPos);
                float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), uFresnelPower);
                fresnel = clamp(fresnel * 0.6 + 0.4, 0.0, 1.0);  // min 0.4

                // Contraste des vagues : waveSum est trop plat (~0.5), on l'étire
                float waveContrast = clamp((waveSum - 0.4) * 3.0, 0.0, 1.0);  // crests vs troughs

                // Couleur de l'eau : sombre dans les creux, plus claire sur les crêtes
                vec3 waterCol = mix(uDeepColor, uWaterColor, waveContrast);

                // La réflexion est la base. L'eau l'assombrit/modifie selon l'angle.
                float waterAmount = 1.0 - fresnel;  // 0.6 de haut, ~0 de biais
                vec3 color = reflection;

                // Assombrir dans les creux (où waveContrast est faible)
                color *= 0.7 + 0.3 * waveContrast;  // creux plus sombres

                // Teinter avec la couleur de l'eau (subtil)
                color = mix(color, waterCol, waterAmount * 0.3);

                // Specular highlight du soleil sur les vagues
                vec3 reflectDir = reflect(-uSunDir, normal);
                float spec = pow(max(dot(viewDir, reflectDir), 0.0), 48.0);
                color += spec * vec3(1.0, 0.95, 0.8) * 1.5;

                // Scintillement sur les crêtes — plus visible
                float sparkle = pow(waveContrast, 3.0) * 0.4;
                color += sparkle * vec3(1.0, 1.0, 0.95);

                gl_FragColor = vec4(color, 1.0);
            }
        `
    });

    waterMesh = new THREE.Mesh(geo, waterMaterial);
    scene.add(waterMesh);
}

// ============================================================
//  GUI
// ============================================================
function setupGUI() {
    gui = new GUI();
    gui.add(params, 'waveSpeed', 0.0, 3.0, 0.05).name('Vitesse vagues');
    gui.add(params, 'waveScale', 0.02, 0.3, 0.005).name('Fréquence vagues');
    gui.add(params, 'distortionStrength', 0.0, 0.2, 0.005).name('Distortion');
    gui.add(params, 'fresnelPower', 1.0, 8.0, 0.1).name('Puissance Fresnel');
    gui.addColor(params, 'waterColor').name('Couleur eau').onChange(v => {
        waterMaterial.uniforms.uWaterColor.value.set(v);
    });
    gui.addColor(params, 'deepColor').name('Couleur profonde').onChange(v => {
        waterMaterial.uniforms.uDeepColor.value.set(v);
    });
}

// ============================================================
//  BOUCLE DE RENDU — deux passes
// ============================================================
function animate() {
    const now = performance.now() / 1000;
    const delta = now - lastTime;
    lastTime = now;
    elapsedTime += delta;

    // ============================================================
    //  PASSE 1 : rendre la scène reflétée dans le render target
    //  La caméra de réflexion = caméra principale miroirée en Y
    // ============================================================
    updateReflectionCamera();

    // Cacher la surface de l'eau pendant le rendu de réflexion
    waterMesh.visible = false;
    renderer.setRenderTarget(renderTarget);
    renderer.clear();
    renderer.render(scene, reflectionCamera);

    // ============================================================
    //  PASSE 2 : rendre la scène finale à l'écran
    // ============================================================
    waterMesh.visible = true;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    // Update uniforms
    waterMaterial.uniforms.uTime.value = elapsedTime;
    waterMaterial.uniforms.uWaveSpeed.value = params.waveSpeed;
    waterMaterial.uniforms.uWaveScale.value = params.waveScale;
    waterMaterial.uniforms.uDistortion.value = params.distortionStrength;
    waterMaterial.uniforms.uFresnelPower.value = params.fresnelPower;
    waterMaterial.uniforms.uCameraPos.value.copy(camera.position);

    // Animation des objets
    sceneObjects[0].rotation.y = elapsedTime * 0.5;
    sceneObjects[1].position.y = 0.8 + Math.sin(elapsedTime * 2) * 0.3;
    sceneObjects[3].rotation.z = elapsedTime * 0.8;
    sceneObjects[5].rotation.y = elapsedTime * 0.3;
}

// ============================================================
//  Caméra de réflexion — miroir par rapport au plan Y=0
//  On applique la matrice de réflexion à la view matrix.
// ============================================================
function updateReflectionCamera() {
    // Position : miroir de la caméra principale
    reflectionCamera.position.set(
        camera.position.x,
        -camera.position.y,
        camera.position.z
    );

    // Direction de visée : miroir
    const target = controls.target;
    reflectionCamera.lookAt(
        target.x,
        -target.y,
        target.z
    );

    // Aspect ratio
    reflectionCamera.aspect = camera.aspect;
    reflectionCamera.fov = camera.fov;
    reflectionCamera.updateProjectionMatrix();
    reflectionCamera.updateMatrixWorld();

    // View-projection matrix de la caméra de réflexion pour le projective texturing
    const vpMatrix = new THREE.Matrix4();
    vpMatrix.multiplyMatrices(reflectionCamera.projectionMatrix, reflectionCamera.matrixWorldInverse);

    waterMaterial.uniforms.uReflectionVP.value.copy(vpMatrix);
}

function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}
