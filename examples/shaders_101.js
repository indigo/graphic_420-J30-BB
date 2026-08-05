import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { GUI } from 'https://unpkg.com/lil-gui@0.20.0/dist/lil-gui.esm.min.js';

// ===================== SHADERS 101 =====================
// Demo des shaders de la Session 5 : Lambert, Phong, Blinn-Phong, Combiné.
// On utilise un ShaderMaterial custom pour montrer le GLSL exact du cours.

// --- Variables Globales ---
let camera, scene, renderer;
let sphere, lightMesh;
let material;

// --- Paramètres GUI ---
const params = {
    mode: 'combined',        // 'diffuse' | 'specular' | 'combined' | 'blinn'
    shininess: 32,
    lightAngle: 45,          // degrés autour de la sphère
    lightHeight: 3,
    materialColor: '#cc2020',
    lightColor: '#ffffff',
    specularColor: '#ffffff',
    reset: resetView
};

// --- GLSL : Vertex Shader ---
// Calcule la position clip-space et passe au fragment shader :
//   - la normale en espace monde (vNormal)
//   - la position du fragment en espace monde (vWorldPos)
const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    // Normale en ESPACE MONDE : mat3(modelMatrix) * normal
    // (PAS normalMatrix, qui transforme en espace vue — incompatible
    //  avec uLightPos et uCameraPos qui sont en espace monde.)
    // Correct ici car la sphère n'a que des rotations (matrice orthogonale,
    // donc inverse-transposée = elle-même).
    vNormal = normalize(mat3(modelMatrix) * normal);

    // Position en espace monde
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;

    // Position clip-space
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// --- GLSL : Fragment Shader ---
// Implémente les 4 modes de façon SANS AUCUN BRANCHEMENT.
// On calcule les 3 composantes (diffuse, spéculaire Phong, spéculaire Blinn-Phong)
// puis on les combine avec des masques flottants (0.0 ou 1.0).
//
// uShowDiffuse : 1.0 si on veut la composante diffuse
// uShowPhong   : 1.0 si on veut la spéculaire Phong (R·V)
// uShowBlinn   : 1.0 si on veut la spéculaire Blinn-Phong (N·H)
//
// Modes :
//   Diffus (Lambert)      → uShowDiffuse=1, uShowPhong=0, uShowBlinn=0
//   Spéculaire (Phong)    → uShowDiffuse=0, uShowPhong=1, uShowBlinn=0
//   Combiné (Phong)       → uShowDiffuse=1, uShowPhong=1, uShowBlinn=0
//   Combiné (Blinn-Phong) → uShowDiffuse=1, uShowPhong=0, uShowBlinn=1
const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec3 vNormal;
  varying vec3 vWorldPos;

  uniform float uShininess;
  uniform float uShowDiffuse;   // masque : 0.0 ou 1.0
  uniform float uShowPhong;     // masque : 0.0 ou 1.0
  uniform float uShowBlinn;     // masque : 0.0 ou 1.0
  uniform vec3  uLightPos;      // Position de la lumière (espace monde)
  uniform vec3  uCameraPos;     // Position de la caméra
  uniform vec3  uMaterialColor;
  uniform vec3  uLightColor;
  uniform vec3  uSpecularColor;

  void main() {
    // 1. Normaliser les varyings (ils ne sont plus unitaires après interpolation !)
    vec3 N = normalize(vNormal);

    // 2. Direction de la lumière L = normalize(lightPos - fragmentPos)
    vec3 L = normalize(uLightPos - vWorldPos);

    // 3. Direction de la caméra V = normalize(cameraPos - fragmentPos)
    vec3 V = normalize(uCameraPos - vWorldPos);

    // --- Produit scalaire brut (servira pour le masque step) ---
    float NdotL = dot(N, L);

    // --- Composante diffuse (Lambert) ---
    float diffuse = max(NdotL, 0.0);

    // --- Masque sans branchement : step(0, NdotL) = 1 si N·L >= 0, sinon 0 ---
    float facing = step(0.0, NdotL);

    // --- Spéculaire Phong (R·V) ---
    vec3 R = reflect(-L, N);     // R = 2*(N·L)*N - L
    float specularPhong = pow(max(dot(R, V), 0.0), uShininess) * facing;

    // --- Spéculaire Blinn-Phong (N·H) ---
    vec3 H = normalize(L + V);   // Vecteur half-angle
    float specularBlinn = pow(max(dot(N, H), 0.0), uShininess) * facing;

    // --- Combinaison SANS BRANCHEMENT : somme pondérée par les masques ---
    // Chaque masque vaut 0.0 ou 1.0 → la composance s'annule ou passe.
    vec3 color = uShowDiffuse * uLightColor * uMaterialColor * diffuse
               + uShowPhong   * uLightColor * uSpecularColor * specularPhong
               + uShowBlinn   * uLightColor * uSpecularColor * specularBlinn;

    gl_FragColor = vec4(color, 1.0);
  }
`;

init();

function init() {
    // 1. Scène & Caméra
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222233);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 2, 7);

    // 2. Rendu
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 3. Lumière ambiante faible (juste pour ne pas avoir du noir pur)
    scene.add(new THREE.AmbientLight(0x111122, 0.3));

    // 4. Création de la sphère avec notre ShaderMaterial
    createSphere();

    // 5. Visualisation de la position de la lumière (petite sphère jaune)
    createLightMarker();

    // 6. Grille au sol pour repérer l'espace
    scene.add(new THREE.GridHelper(20, 20, 0x444466, 0x333344));

    // 7. GUI
    setupGUI();

    // 8. Contrôles
    new OrbitControls(camera, renderer.domElement);
    window.addEventListener('resize', onWindowResize, false);

    // 9. Lancement
    renderer.setAnimationLoop(animate);
}

function createSphere() {
    // ShaderMaterial : on fournit nous-mêmes le GLSL (pas de matériau intégré)
    material = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: {
            uShininess:      { value: params.shininess },
            uShowDiffuse:    { value: 1.0 },
            uShowPhong:      { value: 1.0 },
            uShowBlinn:      { value: 0.0 },
            uLightPos:       { value: new THREE.Vector3(3, 3, 0) },
            uCameraPos:      { value: camera.position.clone() },
            uMaterialColor:  { value: new THREE.Color(params.materialColor) },
            uLightColor:     { value: new THREE.Color(params.lightColor) },
            uSpecularColor:  { value: new THREE.Color(params.specularColor) }
        }
    });

    sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 64, 64),
        material
    );
    scene.add(sphere);
}

function createLightMarker() {
    // Petite sphère émissive pour visualiser où est la lumière
    lightMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffdd00 })
    );
    scene.add(lightMesh);
    updateLightPosition();
}

function updateLightPosition() {
    const rad = THREE.MathUtils.degToRad(params.lightAngle);
    const r = 4;
    const pos = new THREE.Vector3(
        Math.cos(rad) * r,
        params.lightHeight,
        Math.sin(rad) * r
    );
    lightMesh.position.copy(pos);
    material.uniforms.uLightPos.value.copy(pos);
}

function setupGUI() {
    const gui = new GUI();

    gui.add(params, 'mode', {
        'Diffus (Lambert)':      'diffuse',
        'Spéculaire (Phong)':    'specular',
        'Combiné (Phong)':       'combined',
        'Combiné (Blinn-Phong)': 'blinn'
    }).name('Modèle').onChange(updateMode);

    gui.add(params, 'shininess', 1, 128, 1).name('Shininess').onChange(v => {
        material.uniforms.uShininess.value = v;
    });

    gui.add(params, 'lightAngle', 0, 360, 1).name('Angle lumière').onChange(updateLightPosition);
    gui.add(params, 'lightHeight', -2, 5, 0.1).name('Hauteur lumière').onChange(updateLightPosition);

    gui.addColor(params, 'materialColor').name('Couleur matériau').onChange(v => {
        material.uniforms.uMaterialColor.value.set(v);
    });
    gui.addColor(params, 'lightColor').name('Couleur lumière').onChange(v => {
        material.uniforms.uLightColor.value.set(v);
    });
    gui.addColor(params, 'specularColor').name('Couleur spéculaire').onChange(v => {
        material.uniforms.uSpecularColor.value.set(v);
    });

    gui.add(params, 'reset').name('♻️ Reset vue');
}

function updateMode(value) {
    // Aucun branchement dans le shader : on active/désactive chaque
    // composante via des masques flottants (0.0 ou 1.0).
    const masks = {
        diffuse:  { d: 1, p: 0, b: 0 },
        specular: { d: 0, p: 1, b: 0 },
        combined: { d: 1, p: 1, b: 0 },
        blinn:    { d: 1, p: 0, b: 1 }
    };
    const m = masks[value];
    material.uniforms.uShowDiffuse.value = m.d;
    material.uniforms.uShowPhong.value   = m.p;
    material.uniforms.uShowBlinn.value   = m.b;
}

function resetView() {
    camera.position.set(0, 2, 7);
    camera.lookAt(0, 0, 0);
}

function animate() {
    // Mettre à jour la position de la caméra dans le shader
    // (indispensable : V = normalize(cameraPos - fragmentPos))
    material.uniforms.uCameraPos.value.copy(camera.position);

    // Faire tourner doucement la sphère pour voir le reflet se déplacer
    sphere.rotation.y += 0.003;

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
