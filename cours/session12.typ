#import "@preview/theorion:0.4.1": *
#import cosmos.rainbow: *
#show: show-theorion

#heading(level: 1)[Session 12 : Exploration d'une API de Programmation Graphique]

#tip-box(title: "Objectifs de la session")[
  Plonger dans une API graphique bas niveau (WebGPU) pour comprendre ce qui se cache sous l'abstraction de Babylon.js.
]

#heading(level: 2)[APIs Graphiques : Vue d'Ensemble]

#definition-box(title: "Niveaux d'abstraction")[
  - *Haut niveau* : Babylon.js, Three.js — moteur complet, scène, matériaux, éclairage.
  - *Moyen niveau* : WebGL, WebGPU — accès direct au pipeline GPU, mais gestion manuelle.
  - *Bas niveau* : OpenGL, Vulkan, DirectX 12, Metal — APIs natives, contrôle total.
]

#heading(level: 2)[WebGPU : La Nouvelle API Web]

#definition-box(title: "Concepts fondamentaux")[
  - *Adapter* : Représente le GPU physique.
  - *Device* : La connexion logique au GPU.
  - *Pipeline* : Décrit le rendu (shaders, format de sortie, blend mode).
  - *Buffers* : Données envoyées au GPU (vertex, index, uniform).
  - *Textures* : Images stockées sur le GPU.
  - *Command Encoder* : Enregistre les commandes de rendu, soumis au GPU en un seul *submit*.
]

#heading(level: 2)[Comparaison WebGL vs WebGPU]

#definition-box(title: "Différences clés")[
  | Aspect | WebGL | WebGPU |
  |---|---|---|
  | Shader Language | GLSL | WGSL |
  | Paradigme | État global | Objets explicites |
  | Compute | Non | Oui (Compute Shaders) |
  | Performance | Bonne | Meilleure (moins d'overhead) |
  | Maturité | Très mature | Récent, en évolution |
]

#heading(level: 2)[WebGPU dans Babylon.js]

#example(title: "Engine WebGPU")[
  ```javascript
  const engine = new BABYLON.WebGPUEngine(canvas);
  await engine.initAsync();

  const scene = new BABYLON.Scene(engine);
  // ... même code que WebGL

  engine.runRenderLoop(() => scene.render());
  ```
  
  Babylon.js abstrait la différence entre WebGL et WebGPU. Le même code de scène fonctionne sur les deux.

  Pour les compute shaders :
  ```javascript
  const computeShader = new BABYLON.ComputeShader(
    "compute", engine, { computeSource: wgslCode },
    [{ type: "storage", name: "output", buffer: storageBuffer }]
  );
  computeShader.dispatch(64, 1, 1);
  ```
]

#heading(level: 2)[WGSL : Le Langage de Shader WebGPU]

#definition-box(title: "Exemple WGSL")[
  ```wgsl
  @vertex
  fn vs_main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
    return vec4<f32>(position, 1.0);
  }

  @fragment
  fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
  }
  ```
  
  WGSL est plus typé et structuré que GLSL, conçu pour la sécurité et la performance.
]

#heading(level: 2)[Conclusion du Cours]

#tip-box(title: "Récapitulatif")[
  Au cours de cette session, nous avons exploré l'API sous-jacente qui alimente le rendu moderne sur le web. Comprendre WebGPU permet de mieux utiliser Babylon.js et d'optimiser les performances au maximum.
]
