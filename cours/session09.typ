#import "@preview/theorion:0.4.1": *
#import cosmos.rainbow: *
#show: show-theorion

#heading(level: 1)[Session 9 : Rendering Pipeline (Partie 2)]

#tip-box(title: "Objectifs de la session")[
  Approfondir le pipeline : techniques avancées de rendu, deferred rendering, et architecture moderne.
]

#heading(level: 2)[Forward vs Deferred Rendering]

#definition-box(title: "Forward Rendering")[
  Chaque objet est rendu un par un. Pour chaque fragment, on calcule l'éclairage de toutes les lumières.
  - *Avantage* : Simple, MSAA compatible, bon pour peu de lumières.
  - *Inconvénient* : Coût $O("objets" times "lumières")$, overdraw (pixels rendus plusieurs fois).
]

#definition-box(title: "Deferred Rendering")[
  On rend d'abord la géométrie dans des G-Buffers (positions, normales, couleurs, profondeur). L'éclairage est calculé dans un second pass en plein écran.
  - *Avantage* : Coût d'éclairage indépendant du nombre d'objets, $O("pixels" times "lumières")$.
  - *Inconvénient* : Gourmand en mémoire (G-Buffers), MSAA difficile, transparence problématique.
]

#heading(level: 2)[G-Buffer]

#definition-box(title: "Composition typique")[
  - *RT0* : Albedo (RGB) + AO (A)
  - *RT1* : Normales (RGB) + Roughness (A)
  - *RT2* : Metallic (R) + Specular (G) + Depth (B)
  
  Chaque Render Target stocke des informations géométriques et matérielles.
]

#heading(level: 2)[Culling]

#definition-box(title: "Optimisations de géométrie")[
  - *Frustum Culling* : On ignore les objets hors du champ de vision de la caméra.
  - *Occlusion Culling* : On ignore les objets cachés derrière d'autres.
  - *Backface Culling* : On ignore les faces arrière des triangles (normale pointant away).
]

#heading(level: 2)[Draw Calls et Batching]

#important-box(title: "Le goulot d'étranglement")[
  Chaque *draw call* (appel de rendu) a un coût CPU. Réduire le nombre de draw calls est crucial :
  - *Instancing* : Rendre N copies d'un même mesh en un seul draw call.
  - *Merging* : Fusionner les meshes statiques.
  - *Texture Atlas* : Regrouper les textures pour éviter de changer de matériau.
]

#heading(level: 2)[Babylon.js et le Pipeline]

#definition-box(title: "Rendering Pipeline de Babylon.js")[
  Babylon.js utilise par défaut le Forward Rendering. Le Deferred Rendering est disponible via le plugin `@babylonjs/materials`. La scène gère automatiquement le frustum culling, le tri des objets transparents, et le batching des lumières.
]
