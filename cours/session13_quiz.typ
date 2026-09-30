#import "@preview/theorion:0.4.1": *
#import cosmos.rainbow: *
#show: show-theorion

// ===================== SESSION 13 — QUIZ FINAL =====================

#heading(level: 1)[Session 13 : Quiz final]

#definition-box(title: "Consignes")[
  - *30 questions* à choix multiple, portant sur l'ensemble du cours (sessions 1 à 12).
  - Les questions sont dans un ordre *volontairement mélangé* : elles ne suivent pas le plan du cours.
  - Chaque question propose quatre réponses, *A*, *B*, *C* et *D*.
  - Pour *la plupart* des questions, une seule réponse est exacte. Pour *certaines*, il y en a *plus d'une* — c'est à vous de déterminer combien. Cochez toutes les réponses que vous jugez exactes, et seulement celles-là.
  - Aucun document, aucune calculatrice. Les questions portent sur les *concepts*, pas sur le calcul.
  - Une réponse fausse cochée annule une bonne réponse cochée pour cette question.
]

#definition-box(title: "Feuille de réponses")[
  Reportez vos réponses sur la feuille de réponses fournie, en indiquant pour chaque question les lettres cochées (par exemple `Q01 : B`, ou `Q05 : A, C`).

  Une réponse fausse cochée annule une bonne réponse cochée : en cas de doute, ne cochez que ce dont vous êtes certain.
]

// ============================================================
#pagebreak()

#definition-box(title: "Q01")[
  Dans un shader, quelle est la différence essentielle entre un `uniform` et un `varying` ?

  *A.* Un `uniform` est identique pour tous les sommets et tous les pixels d'un draw call, alors qu'un `varying` est interpolé par le rasterizer entre les sommets d'un triangle.

  *B.* Un `varying` est une donnée lue directement dans le vertex buffer, alors qu'un `uniform` est fourni par le CPU.

  *C.* Un `uniform` change à chaque sommet, car le vertex shader peut lui attribuer une valeur différente, alors qu'un `varying` reste constant pendant tout le draw call.

  *D.* Les deux sont équivalents : `varying` est simplement l'ancien nom de `uniform` dans les versions récentes de GLSL.
]

#definition-box(title: "Q02")[
  Pourquoi la tache *spéculaire* se déplace-t-elle quand on déplace la caméra, alors que la composante *diffuse* ne bouge pas ?

  *A.* Parce que la normale de la surface change lorsque la caméra se déplace, comme si l'orientation visible de l'objet était recalculée depuis le point de vue.

  *B.* Parce que le diffus dépend de l'angle entre la normale et la direction de la lumière, tandis que le spéculaire dépend de l'angle entre le reflet et la direction de la vue.

  *C.* Parce que la composante diffuse est pré-calculée (bakée) dans une texture et reste donc figée, contrairement au spéculaire.

  *D.* Parce que le spéculaire est calculé par le vertex shader et le diffus par le fragment shader.
]

#definition-box(title: "Q03")[
  Quel problème les *mipmaps* résolvent-ils ?

  *A.* La *magnification* : quand une texture est observée de très près, le filtrage bilinéaire ne suffit plus à lisser l'image.

  *B.* Le manque de mémoire vidéo : les mipmaps compressent la texture en stockant moins de détails dans les niveaux éloignés, ce qui réduit son empreinte en VRAM.

  *C.* La *minification* : quand une texture est vue de loin, un texel couvre moins d'un pixel et l'échantillonnage naïf produit du scintillement. Les mipmaps fournissent une version réduite adaptée à la distance.

  *D.* La correction gamma : les mipmaps stockent la texture en espace linéaire, ce qui évite les couleurs délavées.
]

#definition-box(title: "Q04")[
  D'où vient l'artefact de *shadow acne* — ces bandes moirées qui apparaissent sur des surfaces pourtant éclairées ?

  *A.* D'un manque de résolution de la shadow map : il suffit d'augmenter sa taille pour le faire disparaître.

  *B.* De la couleur de la lumière, qui déborde sur les surfaces voisines au lieu de s'arrêter au bord de l'ombre, surtout lorsque la lumière est très intense.

  *C.* De l'absence de filtrage PCF : c'est le filtrage qui crée les bandes, et les désactiver les supprime.

  *D.* De la quantification de la profondeur stockée dans la shadow map : une surface se compare à elle-même et, selon l'arrondi, se déclare par endroits à l'ombre.
]

#definition-box(title: "Q05")[
  À propos du rendu d'une scène contenant des milliers d'objets *identiques* (une forêt, par exemple), quelles affirmations sont exactes ?

  *A.* L'*instancing* permet de dessiner les milliers d'arbres en un seul draw call, à partir d'un tableau de transformations.

  *B.* Un *LOD* plus grossier pour les arbres lointains réduit le nombre de vertices traités et le fill-rate.

  *C.* Le *frustum culling* n'apporte rien ici, puisque tous les arbres sont identiques et que le GPU peut réutiliser leur géométrie sans tenir compte de leur position.

  *D.* Des *billboards* coûteraient plus cher que le mesh complet, puisqu'il faut les réorienter vers la caméra à chaque image.
]

#definition-box(title: "Q06")[
  Pourquoi le pipeline graphique utilise-t-il des coordonnées *homogènes* $(x, y, z, w)$ plutôt que de simples triplets $(x, y, z)$ ?

  *A.* Parce qu'un triplet de trois nombres ne suffit pas à représenter précisément une position dans l'espace 3D.

  *B.* Parce qu'une matrice $4 times 4$ se multiplie plus vite qu'une matrice $3 times 3$.

  *C.* Pour que la translation devienne une multiplication matricielle comme les autres transformations, et pour distinguer un point ($w = 1$) d'une direction ($w = 0$).

  *D.* Pour stocker la couleur du sommet dans la quatrième composante, qui est transmise avec la position jusqu'au fragment shader comme un canal supplémentaire.
]

#definition-box(title: "Q07")[
  Le *frustum culling* consiste à…

  *A.* …trier les objets du plus proche au plus lointain, afin de dessiner les premiers en premier.

  *B.* …supprimer les triangles dont la normale pointe à l'opposé de la caméra.

  *C.* …réduire le nombre de vertices des objets les plus éloignés.

  *D.* …ne pas envoyer au GPU les objets situés hors du volume de vision de la caméra.
]

#definition-box(title: "Q08")[
  À quoi sert une *normal map*, et pourquoi suffit-elle à donner l'illusion du relief ?

  *A.* Elle encode par texel une normale *perturbée*, exprimée dans l'espace tangent : le shader éclaire la surface comme si elle avait du relief, sans ajouter un seul triangle.

  *B.* Elle stocke une carte de hauteur qui déplace réellement la géométrie de la surface, en poussant les sommets vers l'extérieur selon la valeur lue.

  *C.* Elle pré-calcule l'éclairage de la surface afin d'éviter de le recalculer à chaque image.

  *D.* Elle indique où les ombres portées doivent être dessinées sur la surface.
]

#definition-box(title: "Q09")[
  Pourquoi applique-t-on un *tone mapping* en fin de chaîne de post-processing ?

  *A.* Pour convertir l'image de l'espace linéaire vers l'espace sRGB de l'écran.

  *B.* Pour compresser une plage dynamique élevée (valeurs supérieures à 1) vers ce que l'écran peut afficher, tout en préservant le détail des hautes lumières.

  *C.* Pour augmenter le contraste et saturer les couleurs de l'image finale, afin de lui donner un rendu plus vif avant de l'envoyer à l'écran.

  *D.* Pour supprimer le bruit présent dans les zones sombres de l'image.
]

#definition-box(title: "Q10")[
  À propos du *baking* d'éclairage, quelles affirmations sont exactes ?

  *A.* Il met à jour l'éclairage en temps réel dès qu'une lumière se déplace, en recalculant la texture bakée pour conserver le résultat à chaque image.

  *B.* Il réduit la mémoire vidéo utilisée, puisque les lumières ne sont plus calculées à l'exécution.

  *C.* Il pré-calcule hors ligne un résultat coûteux, puis le lit dans une texture en temps réel — un échange de mémoire contre du calcul.

  *D.* Il permet d'obtenir un éclairage indirect global, impossible à calculer par pixel en temps réel.
]

#definition-box(title: "Q11")[
  Si une transformation s'écrit $M = T dot R dot S$, dans quel ordre les opérations sont-elles appliquées à un sommet ?

  *A.* La mise à l'échelle, puis la rotation, puis la translation.

  *B.* La translation, puis la rotation, puis la mise à l'échelle.

  *C.* La rotation, puis la mise à l'échelle, puis la translation.

  *D.* L'ordre n'a pas d'importance : la multiplication des matrices est commutative.
]

#definition-box(title: "Q12")[
  Quel est l'intérêt de la variante *Blinn-Phong* par rapport au modèle de Phong classique ?

  *A.* Elle remplace le terme diffus par une constante, ce qui accélère nettement le calcul sans modifier la façon dont la surface reçoit la lumière.

  *B.* Elle utilise le *half-vector* entre la lumière et la vue, ce qui évite de calculer le vecteur réfléchi — moins coûteuse, et le reflet reste plausible aux angles rasants.

  *C.* Elle supprime complètement le terme spéculaire lorsque la surface est rugueuse.

  *D.* Elle calcule l'éclairage par sommet plutôt que par pixel.
]

#definition-box(title: "Q13")[
  Pourquoi les textures de couleur sont-elles stockées en *sRGB* alors que les calculs d'éclairage se font en *linéaire* ?

  *A.* Parce que le sRGB occupe moins de mémoire que le linéaire à qualité égale, grâce à une représentation plus compacte des couleurs perceptibles.

  *B.* Parce que les GPU ne savent pas échantillonner une texture stockée en linéaire.

  *C.* Parce que la perception de l'œil est non-linéaire : le sRGB répartit mieux les niveaux perceptibles, et le shader convertit donc en linéaire avant de calculer, puis reconvertit à l'affichage.

  *D.* Parce que le sRGB supprime les artefacts de filtrage des textures.
]

#definition-box(title: "Q14")[
  Que fait le *PCF* (Percentage Closer Filtering) ?

  *A.* Il augmente la résolution de la shadow map afin d'obtenir des ombres plus nettes.

  *B.* Il décale la profondeur comparée afin de supprimer l'acné d'ombre, en éloignant artificiellement la surface de la lumière lors du test de visibilité.

  *C.* Il empêche l'ombre de se détacher de l'objet qui la projette.

  *D.* Il échantillonne plusieurs texels voisins de la shadow map et moyenne le résultat du test, ce qui adoucit les bords de l'ombre.
]

#definition-box(title: "Q15")[
  Pourquoi le nombre de *draw calls* est-il un goulot d'étranglement, alors que le GPU est très rapide ?

  *A.* Parce que le coût de *préparation* de chaque appel est payé par le CPU, qui doit valider l'état, les shaders et les buffers avant d'envoyer le travail au GPU.

  *B.* Parce que chaque draw call occupe le GPU pendant un temps fixe important, quelle que soit la scène.

  *C.* Parce que les draw calls sont forcément exécutés l'un après l'autre, sans aucun recouvrement possible, ce qui empêche le GPU de traiter plusieurs commandes en parallèle.

  *D.* Parce que chaque draw call vide le depth buffer avant de dessiner.
]

#definition-box(title: "Q16")[
  Quel est le rôle du *rasterizer* dans le pipeline ?

  *A.* Transformer les sommets de l'espace local vers l'espace de clip, en appliquant les matrices de modèle, de vue et de projection avant leur affichage.

  *B.* Déterminer quels pixels sont couverts par chaque triangle, et *interpoler* les varyings avant le fragment shader.

  *C.* Calculer la couleur finale de chaque pixel de l'écran.

  *D.* Trier les triangles afin d'éviter le surdessin.
]

#definition-box(title: "Q17")[
  À propos de l'*ambient occlusion*, quelles affirmations sont exactes ?

  *A.* En version *SSAO*, elle est calculée à l'écran et donc plus précise que la version bakée.

  *B.* Elle remplace le shadow mapping pour le calcul des ombres portées.

  *C.* Elle assombrit les creux et les recoins où la lumière ambiante pénètre difficilement, ce qui donne le contact visuel entre les objets.

  *D.* En version *bakée*, elle est précise et quasi gratuite à l'exécution, mais totalement statique.
]

#definition-box(title: "Q18")[
  Qu'est-ce que le *FBM* (Fractal Brownian Motion) ?

  *A.* Une somme d'octaves de bruit, chaque octave doublant la fréquence et réduisant l'amplitude — ce qui ajoute du détail à toutes les échelles.

  *B.* Un bruit dont la fréquence reste constante tandis que l'amplitude varie dans le temps.

  *C.* Une méthode de filtrage des textures destinée à supprimer l'aliasing, en combinant plusieurs fréquences pour lisser les détails trop fins à l'écran.

  *D.* Une technique de compression des textures procédurales pour la mémoire vidéo.
]

#definition-box(title: "Q19")[
  Pourquoi utilise-t-on du *ping-pong rendering* entre deux render targets ?

  *A.* Pour doubler la résolution de l'image finale.

  *B.* Pour enchaîner plusieurs passes d'effets sans qu'un shader lise et écrive simultanément la même texture.

  *C.* Pour synchroniser le CPU et le GPU entre deux images.

  *D.* Pour économiser de la mémoire vidéo en réutilisant une seule texture.
]

#definition-box(title: "Q20")[
  Le *backface culling* supprime les triangles…

  *A.* …situés hors du frustum de la caméra.

  *B.* …cachés derrière d'autres objets de la scène.

  *C.* …dont la normale pointe à l'opposé de la caméra.

  *D.* …dont la texture n'est pas encore chargée en mémoire vidéo.
]

#definition-box(title: "Q21")[
  À propos du dépliage UV, quelles affirmations sont exactes ?

  *A.* Les coutures doivent être placées là où l'œil ne les remarquera pas.

  *B.* Un texel qui couvre plusieurs pixels d'écran correspond à un cas de *minification*.

  *C.* Les UVs sont stockées dans la shadow map, ce qui permet de projeter l'ombre sur la surface.

  *D.* Plus d'îlots UV réduit l'étirement, mais multiplie les coutures visibles.
]

#definition-box(title: "Q22")[
  Qu'apporte une *HemisphericLight* par rapport à une simple lumière ambiante constante ?

  *A.* Elle projette des ombres portées sur les objets de la scène.

  *B.* Elle interpole deux couleurs (ciel et sol) selon l'orientation de la normale, simulant un ciel qui éclaire par le haut et un sol qui renvoie par le bas.

  *C.* Elle atténue son intensité selon la distance qui la sépare de l'objet, comme une lumière ponctuelle dont la puissance décroît avec l'éloignement.

  *D.* Elle restreint son éclairage à un cône orienté.
]

#definition-box(title: "Q23")[
  Qu'est-ce qu'un *render target* ?

  *A.* La résolution maximale que le GPU est capable d'afficher.

  *B.* Le point de la scène que vise la caméra.

  *C.* Une texture dans laquelle on rend la scène au lieu de l'écran, ce qui permet de la relire ensuite pour la retraiter.

  *D.* Le nombre d'images par seconde visé par le moteur.
]

#definition-box(title: "Q24")[
  À propos des structures spatiales d'accélération, quelles affirmations sont exactes ?

  *A.* Un *BVH* est un arbre de boîtes englobantes : tester la boîte racine permet d'éliminer d'un coup tout un sous-arbre.

  *B.* Une structure spatiale accélère le rendu en réduisant le nombre de pixels réellement dessinés.

  *C.* Une structure spatiale remplace le depth buffer pour la gestion des occultations.

  *D.* Un *octree* subdivise l'espace en huit sous-boîtes à chaque niveau de profondeur.
]

#definition-box(title: "Q25")[
  Quelle est la différence essentielle entre le *value noise* et le *Perlin noise* ?

  *A.* Le value noise est interpolé, tandis que le Perlin noise ne l'est pas.

  *B.* Le value noise tire des valeurs aux coins d'une grille, tandis que le Perlin y place des *vecteurs* et interpole des produits scalaires — d'où un aspect plus organique.

  *C.* Le Perlin noise est plus rapide mais de moins bonne qualité que le value noise, car il évite le calcul des produits scalaires aux coins de la grille.

  *D.* Le value noise ne fonctionne qu'en deux dimensions.
]

#definition-box(title: "Q26")[
  Pourquoi utilise-t-on des *cascades* de shadow maps dans une grande scène éclairée par le soleil ?

  *A.* Pour projeter plusieurs ombres différentes depuis un même objet.

  *B.* Pour supprimer l'acné d'ombre sans avoir recours à un biais, en répartissant la profondeur sur plusieurs cartes plus précises selon la distance.

  *C.* Pour couvrir des tranches de distance croissante avec des résolutions adaptées — fine près de la caméra, grossière au loin — sans gaspiller de résolution.

  *D.* Pour obtenir des ombres colorées, teintées par la lumière.
]

#definition-box(title: "Q27")[
  Quelle est la différence entre un *billboard* et un *impostor* ?

  *A.* Le billboard est un objet 3D, tandis que l'impostor est une image purement 2D.

  *B.* Le billboard sert aux particules, l'impostor aux ombres portées, car chaque technique est adaptée à un type de rendu différent.

  *C.* L'impostor remplace le frustum culling pour les objets lointains.

  *D.* Le billboard est un quad orienté face caméra ; l'impostor en est la version évoluée, rendue depuis le bon angle pour restituer la parallaxe d'un vrai objet.
]

#definition-box(title: "Q28")[
  Que produit un *Worley noise* (bruit cellulaire) ?

  *A.* Un motif de cellules, de pierres ou d'écailles, obtenu en calculant la distance au point aléatoire le plus proche.

  *B.* Un bruit de gradient organique, très proche du Perlin noise.

  *C.* Un bruit dont la fréquence double à chaque octave ajoutée, avec une amplitude décroissante qui fait apparaître des détails de plus en plus fins.

  *D.* Une carte de normales pré-calculée pour une surface.
]

#definition-box(title: "Q29")[
  À propos des *light probes*, quelles affirmations sont exactes ?

  *A.* Elles projettent des ombres portées sur les objets dynamiques de la scène, en conservant leur position et leur forme pendant que ces objets se déplacent.

  *B.* Elles stockent la lumière ambiante d'un lieu, que les objets dynamiques peuvent échantillonner pour recevoir l'éclairage baké.

  *C.* Elles sont généralement compressées en *spherical harmonics* : quelques coefficients suffisent à décrire un champ lumineux directionnel.

  *D.* Elles remplacent les lightmaps pour les objets statiques, car elles stockent l'éclairage de toute une zone sans nécessiter de coordonnées UV.
]

#definition-box(title: "Q30")[
  Dans quel cas le filtrage *anisotrope* est-il indispensable ?

  *A.* Quand une texture est agrandie au-delà de sa résolution native, et que les texels doivent être reconstruits pour couvrir davantage de pixels à l'écran.

  *B.* Quand la texture est répétée en tuiles sur une grande surface.

  *C.* Quand la texture est stockée en niveaux de gris plutôt qu'en couleur.

  *D.* Quand une surface texturée est vue en perspective très rasante — un sol qui s'éloigne vers l'horizon, par exemple.
]
