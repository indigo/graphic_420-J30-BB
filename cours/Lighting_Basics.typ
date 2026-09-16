#import "@preview/theorion:0.4.1": *
#import cosmos.rainbow: *
#show: show-theorion

// ===================== TP : LIGHTING BASICS =====================

#heading(level: 1)[TP : Lighting Basics — Les fondamentaux de l'éclairage]

#tip-box(title: "Objectifs du TP")[
  L'éclairage, c'est 80 % du "look" d'une image — et c'est gratuit : pas de modélisation, pas de texture, juste des lumières bien placées. Dans ce TP, vous allez construire pas à pas les fondamentaux que tous les studios utilisent : le *setup 3 points*, la relation entre *taille de lumière* et *douceur des ombres*, et l'utilisation de la *couleur* pour raconter une histoire. Tout se fait dans Blender, sur un sujet simple : Suzanne.
]

#tip-box(title: "Prérequis")[
  - *Session 5* : vous savez que l'éclairage direct repose sur le produit scalaire $N dot.op L$ — l'angle entre la normale et la direction de la lumière.
  - *Session 10* : vous savez ce qu'est une shadow map et pourquoi les ombres temps réel sont dures.
  - Blender : savoir naviguer (orbite, zoom), ajouter des objets (#box[Add], raccourci `Shift A`), et lancer un rendu (`F12`).
]

#heading(level: 2)[Mise en place]

#definition-box(title: "La scène de départ")[
  Ouvrez `lighting_basics.blend` (fourni avec le TP). Tout est déjà en place :
  - *Suzanne* posée sur un sol, matériau neutre *blanc cassé* (0.8, 0.8, 0.8), Roughness 0.5 — un sujet neutre montre la lumière telle qu'elle est.
  - Une *caméra* cadrée en portrait serré (50 mm) : la tête remplit l'image.
  - Moteur *EEVEE* (itération rapide), rendu 1080p. On testera Cycles à la fin.
  - Un *monde quasi noir* — et surtout : *aucune lumière*. C'est votre travail.

  Vérifiez le cadrage avec `Numpad 0` (vue caméra), puis rendez (`F12`) : l'image est presque noire. C'est le point de départ — votre première lumière va tout révéler.

  *Règle pour tout le TP* : ne touchez plus à la caméra. C'est la lumière qui change, jamais le point de vue.
]

#important-box(title: "La règle d'or du TP")[
  Rendez *souvent* (`F12`). L'éclairage s'apprend par itération : déplacez, rendez, observez, recommencez. Ne faites jamais confiance à la vue 3D seule — le rendu est la vérité.
]

#heading(level: 2)[Partie 1 : Le setup 3 points]

#definition-box(title: "Le vocabulaire")[
  #table(
    columns: (auto, 1fr),
    stroke: 0.5pt,
    inset: 6pt,
    table.header([*Lumière*], [*Rôle*]),
    [*Key* (principale)], [La source dominante. Elle définit l'exposition, la direction des ombres, et le "sens" de l'image.],
    [*Fill* (remplissage)], [Plus faible, placée à l'opposé. Elle *lift* les ombres de la key sans créer de nouvelles ombres visibles.],
    [*Rim* (contre-jour)], [Derrière le sujet, au-dessus. Elle dessine un liseré lumineux sur la silhouette et *sépare* le sujet du fond.],
  )
]

#definition-box(title: "Instructions")[
  + #box[Add > Light > Point], renommez-la *Key*. Position $approx$ (-2, -2, 2) : 45° à gauche, en hauteur, devant le sujet. Power $approx$ 100 W. Rendez.
  + Dupliquez-la (`Shift D`), renommez *Fill*. Position $approx$ (2, -1.5, 1) : côté opposé, plus bas. Power $approx$ 25 W — *un quart de la key*. Rendez.
  + Troisième copie, renommez *Rim*. Position $approx$ (0.5, 2, 2.5) : derrière et au-dessus. Power $approx$ 150 W. Rendez.
]

#important-box(title: "La règle du ratio")[
  Le contraste d'une image = le ratio key/fill. Fill à 25 % de la key : contraste modéré, look "cinéma". Fill à 100 % : plat, look "vidéo conférence". Fill à 0 : contraste extrême, look "film noir". Il n'y a pas de bonne réponse — il y a une *intention*.

  Testez : rendez la même scène avec fill à 10 %, 25 %, 50 %, 100 % de la key. Quatre rendus, quatre ambiances, zéro modélisation.
]

#tip-box(title: "Livrable 1")[
  4 rendus : key seule, key + fill, key + fill + rim, et votre cadrage final préféré. Nommez-les `nom_partie1_a.png` à `nom_partie1_d.png`.
]

#heading(level: 2)[Partie 2 : Dur ou doux ? La taille de la lumière]

#definition-box(title: "La règle physique")[
  La douceur d'une ombre dépend de la *taille apparente* de la lumière vue depuis le sujet :
  - *Petite* (point, sun) : un seul rayon par point de la surface $arrow$ bord d'ombre net $arrow$ ombre *dure*.
  - *Grande* (area large, proche) : la lumière "entoure" le bord $arrow$ pénombre large $arrow$ ombre *douce*.

  Deux leviers : la *taille* de la lumière, et sa *distance* au sujet (plus elle est proche, plus elle paraît grande). Une fenêtre est douce parce qu'elle est immense ; le soleil paraît petit parce qu'il est loin, même s'il est gigantesque.
]

#definition-box(title: "Instructions")[
  + Dupliquez la key, renommez *KeyArea*, désactivez la key d'origine.
  + Convertissez-la en *Area* light : #box[Add > Light > Area], même position. Size 0.1 m, Power 100 W. Rendez : ombres *dures*.
  + Passez Size à 3 m (et Power à 400 W — une grande lumière perd en intensité apparente). Rendez : ombres *douces*.
  + Bonus : rapprochez la grande area du sujet (0.5 m) et comparez.
]

#important-box(title: "Le lien avec les ombres temps réel (Session 10)")[
  Une shadow map se comporte comme une lumière de taille *nulle* : un seul point de vue depuis la lumière, un seul $z$ par pixel. C'est pour ça que les ombres temps réel sont dures par défaut — et c'est pour ça que les moteurs les adoucissent en trichant (PCF : plusieurs échantillons flous autour du bord). En Cycles, la pénombre est *calculée* physiquement : chaque point de la grande lumière émet, et le bord d'ombre devient une vraie pénombre.
]

#tip-box(title: "Livrable 2")[
  2 rendus côte à côte : area 0.1 m vs area 3 m. Annotez (flèche ou annotation) la *pénombre* sur le second.
]

#heading(level: 2)[Partie 3 : La couleur = l'émotion]

#definition-box(title: "Deux outils : température et complémentarité")[
  - *Température* : lumière chaude (orange, $approx$ 3500 K) = feu, soleil couchant, intime. Lumière froide (bleu, $approx$ 8000 K) = nuit, ombre, froideur. L'œil lit la température avant tout le reste.
  - *Complémentarité* : key chaude + fill froide (orange/bleu) = le look "blockbuster". Les deux teintes se renforcent : les ombres paraissent plus profondes, la lumière plus vivante. Deux lumières de même teinte = image terne.
]

#definition-box(title: "Instructions — trois ambiances, même sujet")[
  + *Cosy* : key orange (1.0, 0.55, 0.3), fill bleue très faible (0.3, 0.5, 1.0) à 10 %, rim chaud derrière.
  + *Sinistre* : key quasi éteinte. Une seule lumière *vert* (0.3, 1.0, 0.5) placée *en dessous* du visage, légèrement de face. L'éclairage par en dessous est un code visuel universel de menace — le cerveau le lit immédiatement.
  + *Héroïque* : key chaude forte en biais, rim bleu froid (0.4, 0.6, 1.0) bien visible derrière, fill quasi nulle. Fort contraste, silhouette dessinée.
]

#tip-box(title: "Livrable 3")[
  3 rendus : `nom_partie3_cosy.png`, `nom_partie3_sinistre.png`, `nom_partie3_hero.png`. Préparez une phrase par image : *quelle émotion*, et *quel choix* la produit.
]

#heading(level: 2)[Bonus : Cycles et le rebond]

#important-box(title: "La lumière rebondit")[
  Passez le moteur en *Cycles* et rendez la scène cosy. Observez le côté de Suzanne opposé à la key : il n'est pas noir. La lumière a *rebondi* sur le sol et les murs (indirect lighting). En Session 6, on a vu l'éclairage statique — c'est exactement ce phénomène que le light baking capture. Pour l'exagérer : ajoutez un plan de couleur vive (rouge) sous le sujet, et regardez le rouge "monter" sur le bas du visage (color bleeding).
]

#heading(level: 2)[Grille de livrables]

#table(
  columns: (auto, auto, auto),
  stroke: 0.5pt,
  inset: 6pt,
  table.header([*Partie*], [*Rendus*], [*Ce qu'on vérifie*]),
  [1 — Setup 3 points], [4 images], [Key expose, fill lifte, rim sépare. Ratio visible entre les rendus.],
  [2 — Dur/doux], [2 images], [Bord d'ombre net vs pénombre large. Annotation présente.],
  [3 — Couleur], [3 images], [Trois ambiances lisibles sans explication orale.],
  [Bonus — Cycles], [1 image], [Color bleeding visible sur la zone d'ombre.],
)

#tip-box(title: "Pour aller plus loin")[
  - *Recreate a still* : choisissez une image de film ou de jeu, reproduisez l'éclairage avec 3 lumières maximum. C'est l'exercice des studios.
  - *Un seul sujet, dix ambiances* : même Suzanne, même cadrage, uniquement la lumière qui change.
  - *Le piège du fill* : un fill trop visible tue le contraste. En pratique, on triche souvent avec un plan blanc (bounce card) au lieu d'une vraie lumière — essayez : un plan gris clair face à la key, et comparez avec votre fill.
]
