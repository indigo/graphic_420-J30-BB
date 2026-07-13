#import "@preview/theorion:0.4.1": *
#import cosmos.rainbow: *
#show: show-theorion

#heading(level: 1)[Session 11 : Techniques d'Optimisation et Profilage (Partie 2)]

#tip-box(title: "Objectifs de la session")[
  Optimisation des textures, des shaders, et techniques avancées de performance GPU.
]

#heading(level: 2)[Optimisation des Textures]

#definition-box(title: "Stratégies")[
  - *Texture Compression* : Formats compressés GPU (BasisU, KTX2) qui réduisent la mémoire et la bande passante.
  - *Mipmapping* : Versions pré-calculées de la texture à différentes résolutions. Le GPU choisit la mip level selon la distance.
  - *Texture Atlas* : Regrouper plusieurs textures en une seule pour réduire les changements de matériau.
  - *Resolution* : Adapter la résolution des textures à l'importance visuelle de l'objet.
]

#heading(level: 2)[Optimisation des Shaders]

#definition-box(title: "Bonnes pratiques GLSL")[
  - Éviter les branches conditionnelles (`if`) dans les shaders — préférer `mix`, `step`.
  - Minimiser les calculs dans le Fragment Shader (il s'exécute millions de fois par frame).
  - Précalculer ce qui peut l'être dans le Vertex Shader.
  - Utiliser les built-in GLSL (plus optimisés que les fonctions custom).
]

#heading(level: 2)[Level of Detail (LOD) dans Babylon.js]

#example(title: "LOD automatique")[
  ```javascript
  mesh.addLODLevel(20, highDetailMesh);
  mesh.addLODLevel(50, mediumDetailMesh);
  mesh.addLODLevel(100, lowDetailMesh);
  mesh.addLODLevel(200, null); // Rien rendu au-delà
  ```
]

#heading(level: 2)[Gestion de la Mémoire GPU]

#important-box(title: "Règles d'or")[
  - Libérer les ressources : `mesh.dispose()`, `texture.dispose()`, `material.dispose()`.
  - Réutiliser les géométries (un seul mesh, multiples instances).
  - Surveiller les fuites : le Babylon.js Inspector affiche la mémoire GPU.
]

#heading(level: 2)[WebGPU vs WebGL]

#definition-box(title: "Le futur du rendu web")[
  Babylon.js supporte WebGPU, la nouvelle API graphique du web. WebGPU offre :
  - Accès plus direct au GPU (moins d'overhead CPU).
  - Compute Shaders (calculs généraux sur GPU).
  - Meilleure performance pour les scènes complexes.
  
  On bascule entre WebGL et WebGPU via :
  ```javascript
  const engine = new BABYLON.WebGPUEngine(canvas);
  await engine.initAsync();
  ```
]
