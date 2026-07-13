#import "@preview/theorion:0.4.1": *
#import cosmos.rainbow: *
#show: show-theorion

#heading(level: 1)[Session 7 : Création de Post-Process dans Babylon.js]

#tip-box(title: "Objectifs de la session")[
  Apprendre à appliquer des effets visuels après le rendu de la scène (post-processing) : flou, bloom, correction de couleur, etc.
]

#heading(level: 2)[Qu'est-ce qu'un Post-Process ?]

#definition-box(title: "Définition")[
  Un post-process est un effet appliqué sur l'image finale rendue (framebuffer) avant son affichage. Il s'exécute dans un shader plein écran (fullscreen quad) qui lit la texture de rendu et applique une transformation par pixel.
]

#heading(level: 2)[Post-Process Pipeline dans Babylon.js]

#example(title: "Pipeline de post-process")[
  ```javascript
  const pipeline = new BABYLON.DefaultRenderingPipeline(
    "default", true, scene, [camera]
  );
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.8;
  pipeline.bloomWeight = 0.3;

  pipeline.imageProcessing.contrast = 1.2;
  pipeline.imageProcessing.exposure = 1.0;
  pipeline.imageProcessing.vignetteEnabled = true;
  ```
]

#heading(level: 2)[Post-Process Intégrés]

#definition-box(title: "Effets disponibles")[
  - *Bloom* : Halos lumineux autour des zones brillantes.
  - *Depth of Field (DoF)* : Flou de profondeur (arrière-plan flou).
  - *Vignette* : Assombrissement des bords de l'image.
  - *Chromatic Aberration* : Décalage des canaux RGB (effet lentille).
  - *Grain* : Bruit filmique.
  - *Fxaa* : Anti-aliasing rapide.
  - *Screen Space Reflections (SSR)* : Réflexions temps réel.
]

#heading(level: 2)[Post-Process Custom]

#example(title: "Shader personnalisé en post-process")[
  ```javascript
  const postProcess = new BABYLON.PostProcess(
    "custom", "customEffect", ["time"], null, 1.0, camera
  );

  BABYLON.Effect.ShadersStore["customEffectFragmentShader"] = `
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform float time;

    void main() {
      vec2 uv = vUV;
      uv.x += sin(uv.y * 10.0 + time) * 0.01;
      gl_FragColor = texture2D(textureSampler, uv);
    }
  `;

  postProcess.onApply = (effect) => {
    effect.setFloat("time", performance.now() / 1000);
  };
  ```
]

#heading(level: 2)[HDR et Tone Mapping]

#definition-box(title: "Tone Mapping")[
  Le rendu HDR (High Dynamic Range) calcule la lumière avec des valeurs supérieures à 1.0. Le tone mapping ramène ces valeurs dans la plage $[0, 1]$ pour l'affichage. Babylon.js propose plusieurs opérateurs : ACES, Reinhard, etc.
]
