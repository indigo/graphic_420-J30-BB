#import "@preview/theorion:0.4.1": *
#import cosmos.rainbow: *
#show: show-theorion

#heading(level: 1)[Session 10 : Techniques d'Optimisation et Profilage (Partie 1)]

#tip-box(title: "Objectifs de la session")[
  Apprendre à mesurer et optimiser les performances d'une application 3D temps réel.
]

#heading(level: 2)[Pourquoi Optimiser ?]

#definition-box(title: "Le budget de performance")[
  Pour maintenir 60 FPS, chaque frame doit être rendue en moins de 16.6ms. Le rendu graphique n'est qu'une partie de ce budget (avec la logique de jeu, l'audio, le réseau).
]

#heading(level: 2)[Outils de Profilage]

#definition-box(title: "Outils disponibles")[
  - *Babylon.js Inspector* : `scene.debugLayer.show()` — statistiques de scène, draw calls, FPS, mémoire GPU.
  - *Chrome DevTools* : Performance tab, GPU tab, Memory tab.
  - *WebGL Inspector / Spector.js* : Capture des draw calls WebGL, inspection des buffers et shaders.
]

#heading(level: 2)[Métriques Clés]

#definition-box(title: "Indicateurs de performance")[
  - *FPS* : Images par seconde (cible: 60).
  - *Draw Calls* : Nombre d'appels de rendu par frame (cible: $< 1000$).
  - *Triangles* : Nombre total de triangles rendus.
  - *Texture Memory* : Mémoire GPU utilisée par les textures.
  - *Shader Complexity* : Nombre d'instructions dans les shaders.
]

#heading(level: 2)[Optimisation Géométrique]

#definition-box(title: "Réduction de la complexité")[
  - *LOD (Level of Detail)* : Plusieurs versions d'un mesh avec des niveaux de détail décroissants. On choisit le LOD selon la distance à la caméra.
  - *Mesh Simplification* : Réduction du nombre de polygones.
  - *Frustum Culling* : Déjà géré par Babylon.js, mais peut être amélioré avec des *occluders*.
]

#heading(level: 2)[Optimisation des Draw Calls]

#definition-box(title: "Techniques de batching")[
  - *Thin Instances* : Babylon.js permet de rendre des milliers d'instances d'un mesh en un seul draw call.
  ```javascript
  mesh.thinInstanceCount = 1000;
  mesh.thinInstanceSetBuffer("matrix", matricesBuffer, 16);
  ```
  - *Merge Meshes* : `BABYLON.Mesh.MergeMeshes(meshes)` fusionne plusieurs meshes statiques en un seul.
]
