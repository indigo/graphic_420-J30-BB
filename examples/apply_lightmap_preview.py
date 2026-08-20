"""
À exécuter APRÈS le baking.
Connecte l'image lightmap baked aux matériaux pour prévisualisation
dans le viewport (mode Material Preview ou Rendered).

Utilisation :
1. Baker le lightmap d'abord (voir generate_bake_scene.py)
2. Exécutez ce script
3. Basculez le viewport en Material Preview (Z > Material Preview)
4. Vous devriez voir l'éclairage baked sur la scène
"""

import bpy

# Récupérer l'image baked
bake_image = bpy.data.images.get("session06_lightmap")
if not bake_image:
    print("ERREUR : Image 'session06_lightmap' introuvable. Bakez d'abord !")
    raise ValueError("Image lightmap manquante")

# Récupérer l'objet BakeScene
obj = bpy.data.objects.get("BakeScene")
if not obj:
    print("ERREUR : Objet 'BakeScene' introuvable. Exécutez generate_bake_scene.py d'abord !")
    raise ValueError("Objet BakeScene manquant")

# Pour chaque matériau, connecter le lightmap en Emission pour prévisualisation
for slot in obj.material_slots:
    if not slot.material or not slot.material.use_nodes:
        continue

    tree = slot.material.node_tree
    nodes = tree.nodes
    links = tree.links

    # Récupérer le Principled BSDF
    bsdf = nodes.get("Principled BSDF")
    if not bsdf:
        continue

    # Récupérer ou créer le node Image Texture du lightmap
    lightmap_node = None
    for n in nodes:
        if n.type == 'TEX_IMAGE' and n.image == bake_image:
            lightmap_node = n
            break

    if not lightmap_node:
        lightmap_node = nodes.new(type='ShaderNodeTexImage')
        lightmap_node.image = bake_image
        lightmap_node.location = (bsdf.location.x - 300, bsdf.location.y - 200)

    # Connecter le lightmap en Emission pour prévisualisation
    # (l'éclairage baked "émet" de la lumière = on le voit sans lumières temps réel)
    links.new(lightmap_node.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.0

    # Conserver la couleur de base (albedo) en multiplicateur
    # Pour un rendu correct : albedo * lightmap
    # On utilise un Mix RGB en mode Multiply
    mix_node = nodes.new(type='ShaderNodeMix')
    mix_node.data_type = 'RGBA'
    mix_node.blend_type = 'MULTIPLY'
    mix_node.location = (bsdf.location.x - 150, bsdf.location.y)

    # Récupérer la couleur de base existante
    base_color_link = None
    for link in links:
        if link.input_socket == bsdf.inputs['Base Color']:
            base_color_link = link
            break

    if base_color_link:
        # Il y a déjà une texture de couleur connectée
        mix_node.inputs[6].default_value = (1, 1, 1, 1)  # A (factor)
        links.new(base_color_link.from_node.outputs['Color'], mix_node.inputs[7])  # socket A
        links.new(lightmap_node.outputs['Color'], mix_node.inputs[8])  # socket B
        links.new(mix_node.outputs[2], bsdf.inputs['Emission Color'])
    else:
        # Pas de texture de couleur, utiliser la couleur par défaut du BSDF
        base_color = bsdf.inputs['Base Color'].default_value
        mix_node.inputs[6].default_value = (1, 1, 1, 1)  # factor
        mix_node.inputs[7].default_value = base_color  # A = albedo
        links.new(lightmap_node.outputs['Color'], mix_node.inputs[8])  # B = lightmap
        links.new(mix_node.outputs[2], bsdf.inputs['Emission Color'])

    bsdf.inputs['Emission Strength'].default_value = 1.0

print("Lightmap appliqué aux matériaux !")
print("Basculez le viewport en Material Preview (touche Z > Material Preview)")
print("Vous devriez voir l'éclairage baked sans aucune lumière temps réel.")
