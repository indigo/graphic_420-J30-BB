#import "@preview/theorion:0.4.1": *
#import cosmos.rainbow: *
#show: show-theorion

#heading(level: 1)[Session 4 : Création de Shaders dans Babylon.js (Partie 2)]

#tip-box(title: "Objectifs de la session")[
  Approfondir les shaders : éclairage custom, textures dans les shaders, et effets visuels.
]

#heading(level: 2)[Éclairage dans un Shader]

#definition-box(title: "Modèle d'éclairage Lambertien (Diffuse)")[
  ```glsl
  uniform vec3 lightDirection;
  uniform vec3 lightColor;
  varying vec3 vNormal;
  varying vec3 vColor;

  void main() {
    float intensity = max(dot(normalize(vNormal), normalize(lightDirection)), 0.0);
    gl_FragColor = vec4(vColor * lightColor * intensity, 1.0);
  }
  ```
  
  Le produit scalaire entre la normale de la surface et la direction de la lumière donne l'intensité de l'éclairage diffus.
]

#heading(level: 2)[Textures dans les Shaders]

#definition-box(title: "Sampling de texture")[
  ```glsl
  uniform sampler2D diffuseTexture;
  varying vec2 vUV;

  void main() {
    vec4 texColor = texture2D(diffuseTexture, vUV);
    gl_FragColor = texColor;
  }
  ```
  
  En Babylon.js, on passe la texture via le `ShaderMaterial` :
  ```javascript
  shaderMaterial.setTexture("diffuseTexture", myTexture);
  ```
]

#heading(level: 2)[Normal Mapping]

#definition-box(title: "Normal Map")[
  Une normal map est une texture RGB où chaque texel encode une normale $(R=x, G=y, B=z)$. Elle permet de simuler des détails géométriques sans ajouter de polygones.
  
  Dans le shader, on remplace la normale de la géométrie par la normale lue dans la texture (après conversion de l'espace tangent à l'espace monde).
]

#heading(level: 2)[Effets visuels : Procedural Shaders]

#example(title: "Shader procédural : damier")[
  ```glsl
  varying vec2 vUV;

  void main() {
    float checker = mod(floor(vUV.x * 10.0) + floor(vUV.y * 10.0), 2.0);
    vec3 color = mix(vec3(1.0), vec3(0.0), checker);
    gl_FragColor = vec4(color, 1.0);
  }
  ```
]

#heading(level: 2)[Node Material Editor]

#definition-box(title: "Node Material")[
  Babylon.js propose un éditeur visuel de shaders (Node Material Editor) permettant de créer des shaders sans écrire de GLSL, en connectant des nœuds (comme dans Blender ou Unreal Engine). C'est un excellent outil pour prototyper rapidement des effets.
]
