"""
Génère une scène simple prête pour le baking de lightmap dans Blender.

Utilisation :
1. Ouvrez Blender > Scripting
2. Collez ce script et exécutez-le
3. La scène est créée : une pièce avec des objets, UV2 dépliés
4. Allez dans Render Properties > Cycles > Bake
5. Bake Type: Combined, margin: 16px
6. Sauvegardez l'image de lightmap (PNG ou EXR)
7. Exportez la scène en .glb (File > Export > glTF)

La scène contient :
- Un sol, 4 murs, un plafond (formant une pièce ouverte)
- 3 boîtes de tailles différentes (statiques)
- 1 lumière directionnelle (simule le soleil par la fenêtre)
- 1 lumière point (ampoule intérieure)
- UV2 générés automatiquement pour le lightmapping
"""

import bpy
import bmesh
import math
from mathutils import Vector

# --- Nettoyer la scène ---
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Supprimer les meshes orphelins
for mesh in list(bpy.data.meshes):
    bpy.data.meshes.remove(mesh)
for mat in list(bpy.data.materials):
    bpy.data.materials.remove(mat)

# --- Matériaux ---

def make_material(name, color):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.8
    return mat

mat_wall = make_material("Mural", (0.7, 0.7, 0.7))
mat_floor = make_material("Plancher", (0.5, 0.35, 0.2))
mat_box = make_material("Boite", (0.8, 0.3, 0.3))
mat_box2 = make_material("Boite2", (0.2, 0.5, 0.8))

# --- Géométrie ---

def add_box(name, size, location, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj

# Sol
floor = add_box("Sol", (6, 6, 0.1), (0, 0, -0.05), mat_floor)

# Murs (3 murs + 1 ouvert avec fenêtre)
wall_back = add_box("MurArriere", (6, 0.1, 3), (0, 3, 1.5), mat_wall)
wall_left = add_box("MurGauche", (0.1, 6, 3), (-3, 0, 1.5), mat_wall)
wall_right = add_box("MurDroite", (0.1, 6, 3), (3, 0, 1.5), mat_wall)

# Plafond
ceiling = add_box("Plafond", (6, 6, 0.1), (0, 0, 3.05), mat_wall)

# Boîtes (objets statiques dans la pièce)
box1 = add_box("Boite1", (1.5, 1.5, 1.5), (-1.5, -1, 0.75), mat_box)
box2 = add_box("Boite2", (1, 1, 2), (1.5, 1, 1), mat_box2)
box3 = add_box("Boite3", (0.8, 0.8, 0.8), (0.5, -2, 0.4), mat_box)

# --- Lumières ---

# Lumière directionnelle (soleil par la fenêtre)
bpy.ops.object.light_add(type='SUN', location=(5, -5, 8))
sun = bpy.context.active_object
sun.name = "Soleil"
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(50), math.radians(20), math.radians(35))

# Lumière point (ampoule intérieure)
bpy.ops.object.light_add(type='POINT', location=(0, 0, 2.8))
bulb = bpy.context.active_object
bulb.name = "Ampoule"
bulb.data.energy = 200.0
bulb.data.color = (1.0, 0.9, 0.7)

# --- Joindre tous les meshes en un seul objet ---
# Nécessaire pour que Smart UV Project packed toutes les islands
# dans le même espace UV2 sans chevauchement.

# Désélectionner tout
bpy.ops.object.select_all(action='DESELECT')

# Sélectionner uniquement les meshes
mesh_objects = [obj for obj in bpy.data.objects if obj.type == 'MESH']
for obj in mesh_objects:
    obj.select_set(True)

# L'objet actif sera le premier mesh (deviendra le conteneur)
bpy.context.view_layer.objects.active = mesh_objects[0]

# Joindre
bpy.ops.object.join()
joined = bpy.context.active_object
joined.name = "BakeScene"

# --- UV2 pour le lightmapping ---
# On exclut les faces cachées (extérieur des murs, dessous du sol, dessus du plafond)
# pour concentrer le texel density sur les surfaces visibles.

# Créer le canal UV2
bpy.ops.mesh.uv_texture_add()
uv2 = joined.data.uv_layers[-1]
uv2.name = "UV2_Lightmap"
joined.data.uv_layers.active = uv2

# Passer en mode edit et sélectionner uniquement les faces visibles
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')

# Utiliser bmesh pour désélectionner les faces dont la normale pointe
# vers l'extérieur de la pièce (away from room center)
import bmesh as bm_module
bm = bm_module.from_edit_mesh(joined.data)
bm.faces.ensure_lookup_table()

room_center = Vector((0, 0, 1.5))

for face in bm.faces:
    face_center = face.calc_center_median()
    normal = face.normal
    # Vecteur du centre de la face vers le centre de la pièce
    to_center = (room_center - face_center).normalized()
    # Si la normale pointe vers l'extérieur (dot < 0), désélectionner
    # Sauf pour les boîtes qui sont à l'intérieur — on garde toutes leurs faces
    # Les boîtes sont petites, on les détecte par leur distance au centre
    if face_center.length > 2.5:
        # Boîte — garder toutes les faces
        continue
    if normal.dot(to_center) < -0.1:
        face.select = False

bm_module.update_edit_mesh(joined.data)

# Smart UV Project uniquement sur les faces sélectionnées (visibles)
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
bpy.ops.object.mode_set(mode='OBJECT')

# --- Créer l'image lightmap et l'assigner ---
# Crée une image 2048x2048 et ajoute un Image Texture node
# sélectionné dans le matériau (Blender bake dans le node actif)

bake_image = bpy.data.images.new(
    name="session06_lightmap",
    width=2048,
    height=2048,
    alpha=False,
    float_buffer=False,  # True pour EXR/HDR
)

# Ajouter un Image Texture node à chaque matériau du mesh joint
for slot in joined.material_slots:
    if slot.material and slot.material.use_nodes:
        nodes = slot.material.node_tree.nodes
        tex_node = nodes.new(type='ShaderNodeTexImage')
        tex_node.image = bake_image
        tex_node.select = True
        # Désélectionner les autres nodes
        for n in nodes:
            if n != tex_node:
                n.select = False
        # Définir comme node actif
        slot.material.node_tree.nodes.active = tex_node

# --- Configurer Cycles pour le baking ---
bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.device = 'GPU'
bpy.context.scene.cycles.samples = 64

# Configurer le bake
bpy.context.scene.cycles.bake_type = 'COMBINED'
bpy.context.scene.render.bake.margin = 16

# --- Caméra ---
bpy.ops.object.camera_add(location=(7, -7, 5))
cam = bpy.context.active_object
cam.name = "Camera"
cam.rotation_euler = (math.radians(65), 0, math.radians(45))
bpy.context.scene.camera = cam

print("Scène générée avec succès !")
print("Tous les meshes sont joints en un seul objet 'BakeScene'.")
print("Les UV2 sont packed sans chevauchement.")
print("L'image lightmap 'session06_lightmap' est créée (2048x2048).")
print("")
print("Pour baker :")
print("  1. Render Properties > Engine: Cycles")
print("  2. Sélectionner l'objet BakeScene")
print("  3. Render Properties > Bake > Bake Type: Combined")
print("  4. Cliquer 'Bake'")
print("  5. Dans l'UV Editor, Image > Save As > session06_lightmap.png")
print("")
print("Puis exportez en .glb : File > Export > glTF 2.0 (.glb)")
