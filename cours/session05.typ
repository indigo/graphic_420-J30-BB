#import "@preview/theorion:0.4.1": *
#import cosmos.rainbow: *
#show: show-theorion

#heading(level: 1)[Session 5 : Création d'éclairage dans Babylon.js]

#tip-box(title: "Objectifs de la session")[
  Maîtriser les différents types de lumières, leurs paramètres, et comment elles interagissent avec les matériaux.
]

#heading(level: 2)[Types de Lumières dans Babylon.js]

#definition-box(title: "Lumières intégrées")[
  - *HemisphericLight* : Lumière ambiante simulée (ciel + sol).
  - *DirectionalLight* : Lumière directionnelle (ex: soleil). Tous les rayons sont parallèles.
  - *PointLight* : Lumière ponctuelle omnidirectionnelle (ex: ampoule).
  - *SpotLight* : Lumière conique (ex: lampe torche). Possède un angle et un penumbra.
  ]
  
#heading(level: 2)[Paramètres de Lumière]

#definition-box(title: "Propriétés communes")[
  - `light.diffuse` : Couleur de la lumière (Color3).
  - `light.specular` : Couleur du reflet spéculaire.
  - `light.intensity` : Intensité (multiplicateur).
  - `light.range` : Portée de la lumière (pour Point/Spot).
  - `light.direction` : Direction (pour Directional/Spot).
]

#heading(level: 2)[Modèles d'Éclairage]

#definition-box(title: "Modèles physiques")[
  - *Lambert (Diffuse)* : $k_d = max(N dot L, 0)$ — lumière répartie uniformément.
  - *Phong (Spéculaire)* : $k_s = max(R dot V, 0)^"shininess"$ — reflet brillant.
  - *Blinn-Phong* : Variante utilisant le vecteur half-angle $H = (L + V) / |L + V|$.
  - *PBR (Physically Based Rendering)* : Modèle réaliste basé sur la conservation d'énergie. Utilisé par le `PBRMaterial` de Babylon.js.
]

#heading(level: 2)[PBRMaterial dans Babylon.js]

#definition-box(title: "Propriétés PBR")[
  - `albedoColor` : Couleur de base (équivalent diffuse mais en PBR).
  - `metallic` : 0 = diélectrique (bois, plastique), 1 = métal.
  - `roughness` : 0 = surface lisse (miroir), 1 = surface rugueuse (caoutchouc).
  - `environmentTexture` : Image HDR pour les réflexions et l'éclairage ambient (IBL).
]

#heading(level: 2)[Multiples Lumières et Performance]

#important-box(title: "Limite de lumières")[
  Chaque lumière ajoutée augmente le coût du shader. Babylon.js limite le nombre de lumières simultanées affectant un mesh (par défaut 4). Au-delà, il faut utiliser des techniques avancées (light pre-pass, deferred rendering).
]
