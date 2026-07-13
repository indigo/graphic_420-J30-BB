#import "@preview/theorion:0.4.1": *
#import cosmos.rainbow: *
#show: show-theorion

#heading(level: 1)[Session 6 : Stratégies d'Ombres et Réflexions]

#tip-box(title: "Objectifs de la session")[
  Comprendre les techniques d'ombres temps réel et de réflexions, et les implémenter dans Babylon.js.
]

#heading(level: 2)[Shadow Mapping]

#definition-box(title: "Principe")[
  L'ombre est calculée en rendant la scène depuis le point de vue de la lumière. On stocke les profondeurs dans une *Shadow Map* (texture de profondeur). Au rendu final, on compare la profondeur du fragment à celle stockée dans la shadow map : si le fragment est plus loin, il est dans l'ombre.
]

#heading(level: 2)[Ombres dans Babylon.js]

#example(title: "ShadowGenerator")[
  ```javascript
  const shadowGenerator = new BABYLON.ShadowGenerator(1024, light);
  shadowGenerator.addShadowCaster(mesh);
  shadowGenerator.useExponentialShadowMap = true;

  // Le sol reçoit l'ombre
  ground.receiveShadows = true;
  ```
]

#heading(level: 2)[Types de Shadow Maps]

#definition-box(title: "Variantes")[
  - *Basic Shadow Map* : Simple, qualité limitée (aliasing).
  - *Exponential Shadow Map (ESM)* : Lisse les bords d'ombre.
  - *Poisson Sampling* : Flou stochastique pour adoucir les bords.
  - *Variance Shadow Map (VSM)* : Permet le flou gaussien sur la shadow map.
  - *Cube Shadow Map* : Pour les PointLight (6 faces).
]

#heading(level: 2)[Réflexions]

#definition-box(title: "Techniques de réflexion")[
  - *Environment Mapping* : Une texture cubique (cube map) représente l'environnement. Réflexion via `reflectionTexture` sur le matériau.
  - *Planar Reflections* : Rendu de la scène depuis un miroir. Coûteux mais précis.
  - *Screen Space Reflections (SSR)* : Réflexions calculées dans l'espace écran en réutilisant le framebuffer. Approximation, ne reflète que ce qui est visible à l'écran.
]

#heading(level: 2)[Réflexions dans Babylon.js]

#example(title: "CubeMap réflexion")[
  ```javascript
  const reflectionTexture = new BABYLON.CubeTexture(
    "textures/environment.env", scene
  );
  material.reflectionTexture = reflectionTexture;
  material.reflectionFresnelParameters = new BABYLON.FresnelParameters();
  material.reflectionFresnelParameters.bias = 0.1;
  ```
]

#heading(level: 2)[Image-Based Lighting (IBL)]

#definition-box(title: "IBL")[
  Technique PBR où l'environnement (cube map HDR) sert à la fois de source de réflexions et d'éclairage ambient. C'est le standard moderne pour un rendu réaliste. Babylon.js supporte l'IBL via `environmentTexture` sur la scène.
]
