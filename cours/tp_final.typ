#import "@preview/theorion:0.4.1": *
#import cosmos.rainbow: *
#show: show-theorion

#heading(level: 1)[TP final — Projet individuel + vidéo explicative]

#important-box(title: "En une phrase")[
  Vous choisissez *un* sujet parmi les options proposées, vous réalisez une petite scène ou un effet qui met en pratique la matière du cours, et vous rendez une *vidéo de 10 minutes* où vous l'expliquez. La note porte surtout sur votre *compréhension* — pas sur la quantité de code.
]

#heading(level: 2)[Format du travail]

#definition-box(title: "Les règles du jeu")[
  - *Individuel* : votre propre scène, votre propre code, votre propre voix.
  - *Outils libres* : Babylon.js, Three.js, Godot, Unity, Blender, shaders GLSL, Node Material Editor… ce que vous voulez, tant que le résultat tourne.
  - *Charge visée* : environ *10 heures* de travail. Le « livrable minimum » de chaque sujet est calibré pour ça. Les bonus sont *optionnels* et servent à viser plus haut.
  - *Rendu* : une vidéo de *10 minutes* + le projet + un court résumé écrit (voir plus bas).
]

#heading(level: 2)[Échéancier]

#important-box(title: "Dates")[
  - *Démarrage* : le *prochain cours* est réservé pour choisir votre sujet et commencer. Venez avec une idée (ou deux) et votre environnement de travail déjà installé.
  - *Remise* : *vendredi 25 septembre 2026*, avant la fin de la journée — vidéo, projet et résumé écrit.
]

#heading(level: 2)[Structure imposée de la vidéo]

#tip-box(title: "Pourquoi une structure fixe ?")[
  Une vidéo structurée est rapide à évaluer et vous force à expliquer le *pourquoi*, pas seulement à cliquer. Suivez ces cinq parties, dans cet ordre.
]

#example(title: "Les 5 parties (10 min ± 1)")[
  *1. 0:00–0:30 — Sujet et objectif.* Quel sujet, ce que vous avez construit, le résultat en une phrase.

  *2. 0:30–2:30 — Démonstration.* Le résultat qui tourne : la caméra bouge, vous interagissez, vous balayez les paramètres de la GUI.

  *3. 2:30–7:00 — Explication technique.* *Comment* ça marche : le pipeline, le shader, ou les réglages de bake. Expliquez le *pourquoi*, pas la suite de clics.

  *4. 7:00–9:00 — Preuves.* Comparaison avant/après, interrupteur A/B, chiffres de FPS ou de draw calls. C'est la partie qui empêche de « faire semblant ».

  *5. 9:00–10:00 — Bilan.* Ce qui a été difficile, ce que vous amélioreriez, ce que vous réutiliseriez.
]

#warning-box(title: "À éviter")[
  - Une vidéo de diapositives seules : on veut voir *votre écran en direct*.
  - Rejouer un tutoriel trouvé en ligne : le sujet doit être *votre* travail et vous devez pouvoir l'expliquer.
  - Dépasser largement 10 minutes : entraînez-vous, coupez le superflu.
]

#heading(level: 2)[Ce qu'il faut remettre]

#definition-box(title: "Trois éléments")[
  - *La vidéo* : lien non répertorié (YouTube) ou fichier (Drive, Teams). 10 min, voix française.
  - *Le projet* : archive `.zip` du dossier (scène, code, assets). Sert de vérification au besoin.
  - *Un résumé écrit de 5 lignes* : le sujet choisi, les outils, ce que les preuves montrent. Cela me permet d'aller droit au but en corrigeant.
]

#heading(level: 2)[Les sujets]

Vous en choisissez *un*. Chaque sujet indique : l'idée, le *livrable minimum*, ce que la *vidéo doit montrer*, et des *bonus*.

#heading(level: 3)[Option A — Matériau personnalisé (shader)]

#definition-box(title: "A — Écrire un matériau de A à Z")[
  *Idée.* Écrire un matériau en GLSL (ShaderMaterial brut, ou Node Material Editor) — *pas* StandardMaterial ni PBRMaterial — qui combine un motif procédural et un modèle d'éclairage.

  *Livrable minimum (~10 h).* Un mesh 3D avec un shader maison qui :
  + génère un *motif procédural* (bruit, FBM, damier, rayures…),
  + applique un *éclairage* (Lambert ou Blinn-Phong) avec au moins une lumière,
  + expose au moins un *paramètre réglable* (uniform) modifiable en direct.

  *Vidéo — à montrer.* Le matériau en marche ; le vertex et le fragment shader parcourus ligne à ligne ; le calcul d'éclairage expliqué (produit scalaire N · L) ; activer/désactiver le motif puis le terme spéculaire.

  *Bonus.* Normal map par-dessus, triplanar mapping, uniforms animés.

  *Sessions couvertes :* 3, 4, 5, 8.
]

#heading(level: 3)[Option B — Effet procédural « vitrine »]

#definition-box(title: "B — Un effet piloté par le bruit")[
  *Idée.* Produire un effet visuel convaincant à partir de bruit procédural : planète, eau, marbre, bois, dissolve, hologramme.

  *Livrable minimum (~10 h).* Un shader qui produit l'effet, avec au moins un paramètre animé dans une GUI.

  *Vidéo — à montrer.* L'effet en marche ; la pile de bruit expliquée (les octaves du FBM, la fonction de hash) ; chaque paramètre balayé pour montrer ce qu'il change.

  *Bonus.* Combiner l'effet avec un éclairage ou une normal map.

  *Sessions couvertes :* 8, 3, 4.
]

#heading(level: 3)[Option C — Éclairage : baked vs temps réel]

#definition-box(title: "C — Comparer les deux stratégies d'éclairage")[
  *Idée.* Comparer sur une *même* scène l'éclairage précalculé (baked) et l'éclairage temps réel.

  *Livrable minimum (~10 h).* Une scène rendue de deux façons — baked (lightmap / light probes) et temps réel (lumières + ombres) — avec la même caméra, et le *FPS mesuré* pour chacune.

  *Vidéo — à montrer.* Les deux rendus côte à côte ; le pipeline de chacun expliqué ; les chiffres de FPS ; une conclusion : quand choisir quoi.

  *Bonus.* Éclairage mixte, objet dynamique éclairé par les light probes.

  *Sessions couvertes :* 5, 6, 9, 10.
]

#heading(level: 3)[Option D — « Look » cinématographique]

#definition-box(title: "D — Ombres + post-processing")[
  *Idée.* Donner une identité visuelle forte à une scène avec des ombres et une chaîne de post-processing.

  *Livrable minimum (~10 h).* Une scène avec ombres (directionnelle CSM + spot) et une chaîne de post-processing (tone mapping + bloom + au moins un pass custom), paramétrable via une GUI.

  *Vidéo — à montrer.* La *même* image, post-processing désactivé puis activé ; chaque pass désactivé un par un ; l'ordre des passes expliqué ; les artefacts d'ombre corrigés (acne, peter panning).

  *Bonus.* Depth of Field, SSAO, color grading (LUT).

  *Sessions couvertes :* 10, 11, 5.
]

#heading(level: 3)[Option E — Défi d'optimisation (scène à 60 FPS)]

#definition-box(title: "E — Des milliers d'objets à 60 FPS")[
  *Idée.* Faire tenir une scène de milliers d'objets à 60 FPS.

  *Livrable minimum (~10 h).* Une scène avec des milliers d'objets (herbe, forêt, ville) utilisant *instancing + LOD + billboards + culling*, un HUD affichant les *draw calls* et les triangles, et des *interrupteurs A/B* qui prouvent l'impact de chaque technique.

  *Vidéo — à montrer.* La scène ; les interrupteurs basculés en direct (les draw calls explosent sans instancing/culling, s'effondrent avec) ; chaque technique expliquée à partir des mesures.

  *Bonus.* Impostors, occlusion culling.

  *Sessions couvertes :* 12, 1, 2.
]

#heading(level: 3)[Option F — Pipeline d'asset Blender + bake]

#definition-box(title: "F — Fabriquer et cuire un asset")[
  *Idée.* Fabriquer un asset propre et le cuire (bake) pour l'intégrer dans un moteur.

  *Livrable minimum (~10 h).* Modéliser ou retopologiser un asset (ou partir d'un mesh fourni), déplier les UVs, baker au moins *deux* maps (normale + AO ou diffuse) du high-poly vers le low-poly, exporter, puis l'intégrer avec un matériau PBR dans un moteur.

  *Vidéo — à montrer.* Le workflow Blender (seams, cage, réglages de bake) ; les maps exportées ; le résultat en moteur *avec et sans* la normal map.

  *Bonus.* Baker un lightmap pour l'objet, ajouter une reflection probe, préparer un LOD.

  *Sessions couvertes :* 7, 8, 9, 12.
]

#heading(level: 3)[Option G — Sujet libre avancé (à faire approuver)]

#definition-box(title: "G — Une technique hors du programme")[
  *Idée.* Implémenter une technique *non vue en cours* : raymarching de SDF, réflexions en espace écran (SSR), brouillard volumétrique, compute shader WebGPU, particules GPU…

  *Livrable minimum (~10 h).* Une démo fonctionnelle, plus une comparaison à une version naïve (baseline).

  *Vidéo — à montrer.* La technique expliquée *depuis zéro* ; la démo qui tourne ; les maths ou le pipeline ; une discussion de la performance face à la baseline.

  *Contrainte.* Le sujet doit être *approuvé par l'enseignant avant de commencer*.

  *Sessions couvertes :* selon le sujet.
]

#heading(level: 2)[Grille d'évaluation]

#definition-box(title: "Chaque critère est noté de 0 à 4")[
  + *Résultat fonctionnel* — ça tourne et ça fait ce qui est annoncé.
  + *Compréhension technique* — explication correcte du pipeline et des maths. *Critère décisif.*
  + *Profondeur / ambition* — au-delà du minimum ; concepts du cours maîtrisés.
  + *Rigueur / preuves* — comparaisons et chiffres réels, limites reconnues honnêtement.
  + *Communication* — vidéo structurée, dans le temps, claire, en français.
]

#heading(level: 2)[Règles et rappels]

#warning-box(title: "À respecter")[
  - *Travail individuel* : votre scène, votre code, votre voix.
  - *La vidéo montre votre écran en direct*, pas seulement des diapositives.
  - *Retard* : moins 5 % par jour ; note zéro après trois jours ouvrables (politique du Collège).
  - *Intégrité* : toute fraude ou plagiat entraîne la note zéro (politique du Collège). Vous devez pouvoir expliquer chaque partie de votre travail.
]

#tip-box(title: "Conseils pour une bonne vidéo")[
  - Faites un plan écrit avant de filmer, puis enregistrez en une ou deux prises.
  - Zoomez sur le code quand vous l'expliquez.
  - Préparez la partie *preuves* à l'avance : c'est là que se gagnent les points de compréhension.
  - Répétez le minutage : mieux vaut 9 minutes denses que 14 minutes confuses.
]
