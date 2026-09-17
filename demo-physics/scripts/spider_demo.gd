extends Node3D
## ============================================================
##  SPIDER DEMO — CharacterBody3D + IK FABRIK (Session 16)
##
##  Une araignée procédurale : le corps est un character
##  controller (move_and_slide), et chaque patte est une chaîne
##  de 2 segments résolue en IK. Le pied RESTE PLANTÉ au sol
##  pendant que le corps bouge ; quand la patte s'étire trop,
##  le pied se décolle et se re-plante à sa position de repos.
##
##  Le solveur est le FABRIK du cours — même structure que
##  fabrikSolve() dans session16.typ, adapté en 3D avec un
##  « pole vector » qui force le genou vers l'extérieur/haut.
##
##  Contrôles :
##    ZQSD / WASD  → déplacer l'araignée
##    R            → reset
##    Échap        → quitter la démo (souris)
## ============================================================

# --- Corps (character controller) ---
const MOVE_SPEED := 3.2
const GRAVITY := 18.0
const TURN_SPEED := 8.0          # vitesse de rotation vers la direction de marche

# --- Pattes ---
const LEG_COUNT := 8             # 4 par côté
const LEG_UPPER := 0.7           # longueur hanche → genou
const LEG_LOWER := 0.95          # longueur genou → pied
const REST_DIST := 1.0           # distance horizontale du pied de repos
const STEP_THRESHOLD := 0.38     # étirement max avant de lever le pied
const STEP_TIME := 0.16          # durée d'un pas (s)
const STEP_HEIGHT := 0.18        # hauteur de l'arc du pas
const FABRIK_ITER := 8           # itérations (le pied bouge peu → converge vite)

# --- Internes ---
var _body: CharacterBody3D
var _camera: Camera3D
var _hud: Label
var _space: PhysicsDirectSpaceState3D

# Par patte : ancre locale, direction de repos, groupe de démarche,
# position du pied (monde), état du pas, joints résolus
var _hip_local: Array[Vector3] = []
var _rest_local: Array[Vector3] = []
var _gait_group: Array[int] = []
var _feet: Array[Vector3] = []
var _step_from: Array[Vector3] = []
var _step_to: Array[Vector3] = []
var _step_t: Array[float] = []   # <0 = planté, 0..1 = en vol
var _knees: Array[Vector3] = []  # genou de la frame précédente (continuité)

var _seg_a: Array[MeshInstance3D] = []  # hanche → genou
var _seg_b: Array[MeshInstance3D] = []  # genou → pied
var _foot_meshes: Array[MeshInstance3D] = []

var _step_count := 0
var _active_group := 0      # groupe de démarche autorisé à lever (0/1)
var _body_velocity := Vector3.ZERO


func _ready() -> void:
	_space = get_world_3d().direct_space_state
	_setup_light()
	_setup_terrain()
	_setup_spider()
	_setup_camera()
	_setup_hud()


## ============================================================
##  ENVIRONNEMENT
## ============================================================

func _setup_light() -> void:
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, -30, 0)
	sun.shadow_enabled = true
	add_child(sun)

	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.04, 0.055, 0.08)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.35, 0.4, 0.5)
	env.ambient_light_energy = 0.8
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)


func _add_block(pos: Vector3, size: Vector3, color: Color) -> StaticBody3D:
	var block := StaticBody3D.new()
	block.position = pos
	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	col.shape = shape
	block.add_child(col)
	var mesh := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.85
	mesh.material_override = mat
	mesh.mesh = box
	block.add_child(mesh)
	add_child(block)
	return block


func _setup_terrain() -> void:
	# Sol
	_add_block(Vector3(0, -0.1, 0), Vector3(60, 0.2, 60), Color(0.28, 0.3, 0.34))
	# Quelques reliefs pour montrer le foot placement (les pattes
	# montent DESSUS — c'est le raycast qui fait tout le travail)
	_add_block(Vector3(4.5, 0.25, -2.0), Vector3(3.0, 0.5, 3.0), Color(0.4, 0.42, 0.45))
	_add_block(Vector3(-5.0, 0.4, -4.0), Vector3(2.5, 0.8, 2.5), Color(0.45, 0.4, 0.35))
	_add_block(Vector3(1.0, 0.15, -6.5), Vector3(4.0, 0.3, 1.5), Color(0.36, 0.38, 0.42))


func _setup_hud() -> void:
	var canvas := CanvasLayer.new()
	add_child(canvas)
	_hud = Label.new()
	_hud.add_theme_font_size_override("font_size", 18)
	_hud.add_theme_color_override("font_color", Color(0.0, 1.0, 0.8))
	_hud.position = Vector2(20, 20)
	canvas.add_child(_hud)


## ============================================================
##  L'ARAIGNÉE
## ============================================================

func _setup_spider() -> void:
	_body = CharacterBody3D.new()
	_body.position = Vector3(0, 1.2, 4)
	add_child(_body)

	# Collision : sphère aplatie (le corps « roule » sur le sol)
	var col := CollisionShape3D.new()
	var shape := SphereShape3D.new()
	shape.radius = 0.5
	col.shape = shape
	col.scale = Vector3(1.0, 0.75, 1.2)
	_body.add_child(col)

	# Abdomen (sphère aplatie sombre)
	var abdomen := MeshInstance3D.new()
	var ab_mesh := SphereMesh.new()
	ab_mesh.radius = 0.5
	ab_mesh.height = 1.0
	var ab_mat := StandardMaterial3D.new()
	ab_mat.albedo_color = Color(0.12, 0.1, 0.14)
	ab_mat.roughness = 0.4
	abdomen.material_override = ab_mat
	abdomen.mesh = ab_mesh
	abdomen.scale = Vector3(1.0, 0.75, 1.2)
	_body.add_child(abdomen)

	# Tête (petite sphère devant, -Z)
	var head := MeshInstance3D.new()
	var head_mesh := SphereMesh.new()
	head_mesh.radius = 0.22
	head_mesh.height = 0.44
	var head_mat := StandardMaterial3D.new()
	head_mat.albedo_color = Color(0.15, 0.12, 0.16)
	head.material_override = head_mat
	head.mesh = head_mesh
	head.position = Vector3(0, 0.05, -0.55)
	_body.add_child(head)

	# Yeux (deux petites sphères émissives — gratuit, et ça donne
	# instantanément la direction du regard aux étudiants)
	var eye_mat := StandardMaterial3D.new()
	eye_mat.albedo_color = Color(1, 0.3, 0.1)
	eye_mat.emission_enabled = true
	eye_mat.emission = Color(1, 0.25, 0.05)
	eye_mat.emission_energy_multiplier = 3.0
	for sx in [-0.1, 0.1]:
		var eye := MeshInstance3D.new()
		var em := SphereMesh.new()
		em.radius = 0.05
		em.height = 0.1
		eye.material_override = eye_mat
		eye.mesh = em
		eye.position = Vector3(sx, 0.12, -0.72)
		_body.add_child(eye)

	# --- Pattes : 4 par côté, en éventail ---
	# Indices : paire j → i = 2j (gauche), i = 2j+1 (droite).
	# Groupe de démarche en diagonale : {G0, D1, G2, D3} vs {D0, G1, D2, G3}.
	var seg_mat := StandardMaterial3D.new()
	seg_mat.albedo_color = Color(0.2, 0.17, 0.22)
	seg_mat.roughness = 0.5
	var foot_mat := StandardMaterial3D.new()
	foot_mat.albedo_color = Color(0.9, 0.5, 0.15)

	for i in LEG_COUNT:
		var side: float = -1.0 if i % 2 == 0 else 1.0
		var j: int = i / 2
		# Ancre sur le flanc du corps
		_hip_local.append(Vector3(side * 0.35, 0.1, -0.35 + j * 0.23))
		# Direction de repos : en éventail (avant → avant-extérieur,
		# arrière → arrière-extérieur)
		_rest_local.append(Vector3(side * 0.95, 0, -0.55 + j * 0.37).normalized())
		_gait_group.append((j + i) % 2)

		_feet.append(Vector3.ZERO)
		_step_from.append(Vector3.ZERO)
		_step_to.append(Vector3.ZERO)
		_step_t.append(-1.0)
		_knees.append(Vector3.ZERO)

		# Visuels : 2 cylindres + une boule au pied
		_seg_a.append(_make_segment(seg_mat))
		_seg_b.append(_make_segment(seg_mat))
		var foot := MeshInstance3D.new()
		var fm := SphereMesh.new()
		fm.radius = 0.05
		fm.height = 0.1
		foot.material_override = foot_mat
		foot.mesh = fm
		add_child(foot)
		_foot_meshes.append(foot)

	# Plant initial : chaque pied à sa position de repos
	_body.global_transform = Transform3D(Basis(), Vector3(0, 1.2, 4))
	for i in LEG_COUNT:
		var rest := _rest_target(i)
		_feet[i] = rest
		_knees[i] = _initial_knee(i)


func _make_segment(mat: Material) -> MeshInstance3D:
	var seg := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.028
	cyl.bottom_radius = 0.038
	cyl.height = 1.0          # étiré à la longueur réelle dans _place_segment
	cyl.radial_segments = 6
	seg.material_override = mat
	seg.mesh = cyl
	add_child(seg)
	return seg


## Point de repos au sol pour la patte i (raycast vers le bas).
func _rest_target(i: int) -> Vector3:
	var hip_w: Vector3 = _body.global_transform * _hip_local[i]
	var dir_w: Vector3 = (_body.global_transform.basis * _rest_local[i]).normalized()
	var from := hip_w + dir_w * REST_DIST + Vector3.UP * 1.5
	var q := PhysicsRayQueryParameters3D.create(from, from + Vector3.DOWN * 4.0)
	q.exclude = [_body.get_rid()]
	var hit := _space.intersect_ray(q)
	if hit:
		return hit.position
	return Vector3(from.x, 0.0, from.z)


# Genou initial : au-dessus et à l'extérieur, sur le plan hanche-pied
func _initial_knee(i: int) -> Vector3:
	var hip_w: Vector3 = _body.global_transform * _hip_local[i]
	var dir_w: Vector3 = (_body.global_transform.basis * _rest_local[i]).normalized()
	return (hip_w + _feet[i]) * 0.5 + (dir_w + Vector3.UP).normalized() * LEG_UPPER * 0.6


## ============================================================
##  FABRIK — la même structure que fabrikSolve() du cours
##
##  Chaîne à 3 joints : hip (base, sur le corps) → knee → foot
##  (cible). Forward : pied sur la cible, on corrige vers la
##  base. Backward : hanche re-pinnée, on corrige vers le pied.
##  + pole vector : on tourne le genou autour de l'axe
##  hanche→pied pour qu'il pointe vers l'extérieur/haut —
##  c'est ce qui donne le look « araignée » au lieu de genoux
##  qui flippent au hasard.
## ============================================================

func _solve_leg(hip: Vector3, foot: Vector3, knee_hint: Vector3, pole_dir: Vector3) -> Array[Vector3]:
	var lengths := [LEG_UPPER, LEG_LOWER]
	var total := LEG_UPPER + LEG_LOWER
	var pts: Array[Vector3] = [hip, knee_hint, foot]

	var d := hip.distance_to(foot)
	if d >= total * 0.99:
		# Hors de portée : bras tendu vers la cible (cas du cours)
		var dir := (foot - hip).normalized()
		pts[1] = hip + dir * LEG_UPPER
		pts[2] = hip + dir * (total * 0.99)
	else:
		for _it in FABRIK_ITER:
			# --- FORWARD : cible → base ---
			pts[2] = foot
			for k in range(1, -1, -1):
				var r := pts[k].distance_to(pts[k + 1])
				if r > 1e-5:
					pts[k] = pts[k + 1].lerp(pts[k], lengths[k] / r)
			# --- BACKWARD : base → extrémité ---
			pts[0] = hip
			for k in range(0, 2):
				var r := pts[k].distance_to(pts[k + 1])
				if r > 1e-5:
					pts[k + 1] = pts[k].lerp(pts[k + 1], lengths[k] / r)

	# --- Pole bias : genou vers pole_dir, longueurs préservées ---
	# Le lieu des genoux valides est un cercle autour de l'axe
	# hanche→pied : tourner le genou sur ce cercle ne change
	# ni |hanche→genou| ni |genou→pied|.
	var axis := (pts[2] - pts[0]).normalized()
	if axis.length() > 0.5:
		var rel := pts[1] - pts[0]
		var proj := axis * rel.dot(axis)
		var perp := rel - proj
		var pole_perp := pole_dir - axis * pole_dir.dot(axis)
		if perp.length() > 1e-4 and pole_perp.length() > 1e-4:
			var ang := perp.normalized().signed_angle_to(pole_perp.normalized(), axis)
			pts[1] = pts[0] + proj + perp.rotated(axis, ang)

	return pts


## ============================================================
##  DÉMARCHE — quand lever le pied ?
## ============================================================

# Démarche alternée stricte : un seul groupe (diagonales) peut
# lever des pattes à la fois — quand toutes ses pattes ont
# re-atterri, on passe la main à l'autre groupe. C'est ce qui
# donne l'effet « vague » au lieu de tout lever en bloc.
# Dérogation si la patte est vraiment trop étirée (anti-deadlock).
func _can_step(i: int) -> bool:
	var err := _feet[i].distance_to(_rest_target(i))
	if err > STEP_THRESHOLD * 2.2:
		return true
	if _gait_group[i] != _active_group:
		return false
	var in_air := 0
	for k in LEG_COUNT:
		if _step_t[k] >= 0.0:
			in_air += 1
	return in_air < 2


func _count_stepping() -> int:
	var n := 0
	for k in LEG_COUNT:
		if _step_t[k] >= 0.0:
			n += 1
	return n


func _update_legs(delta: float) -> void:
	for i in LEG_COUNT:
		var hip_w: Vector3 = _body.global_transform * _hip_local[i]
		var dir_w: Vector3 = (_body.global_transform.basis * _rest_local[i]).normalized()

		if _step_t[i] >= 0.0:
			# Pas en cours : arc entre _step_from et _step_to
			_step_t[i] += delta / STEP_TIME
			if _step_t[i] >= 1.0:
				_feet[i] = _step_to[i]
				_step_t[i] = -1.0
			else:
				var t := _step_t[i]
				_feet[i] = _step_from[i].lerp(_step_to[i], t) \
					+ Vector3.UP * sin(t * PI) * STEP_HEIGHT
		else:
			# Planté : vérifier l'étirement
			if _feet[i].distance_to(_rest_target(i)) > STEP_THRESHOLD and _can_step(i):
				# Cible prédictive : on vise là où le repos SERA
				# quand le pied retombe (pas là où il est maintenant)
				_step_from[i] = _feet[i]
				_step_to[i] = _rest_target(i) + _body_velocity * STEP_TIME * 1.4
				_step_t[i] = 0.0
				_step_count += 1

		# IK : hanche (corps) → pied (sol)
		var pole := (dir_w + Vector3.UP * 1.2).normalized()
		var pts := _solve_leg(hip_w, _feet[i], _knees[i], pole)
		_knees[i] = pts[1]

		# Visuels
		_place_segment(_seg_a[i], pts[0], pts[1])
		_place_segment(_seg_b[i], pts[1], pts[2])
		_foot_meshes[i].global_position = pts[2]

	# La main passe à l'autre groupe quand tout est au sol
	if _count_stepping() == 0:
		_active_group = 1 - _active_group


# Étire un cylindre unitaire (axe Y) entre a et b
func _place_segment(seg: MeshInstance3D, a: Vector3, b: Vector3) -> void:
	var dir := b - a
	var len := dir.length()
	if len < 1e-5:
		seg.visible = false
		return
	seg.visible = true
	var y := dir / len
	var x := y.cross(Vector3.UP)
	if x.length() < 1e-3:
		x = Vector3.RIGHT
	else:
		x = x.normalized()
	var z := x.cross(y).normalized()
	seg.global_transform = Transform3D(Basis(x, y * len, z), (a + b) * 0.5)


## ============================================================
##  CAMÉRA (suivie, angle fixe)
## ============================================================

func _setup_camera() -> void:
	_camera = Camera3D.new()
	_camera.fov = 60
	_camera.current = true
	_camera.position = Vector3(0, 5.5, 8.5)
	add_child(_camera)


## ============================================================
##  INPUT & BOUCLE
## ============================================================

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_ESCAPE:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		elif event.keycode == KEY_R:
			_body.global_position = Vector3(0, 1.2, 4)
			_body.velocity = Vector3.ZERO
			_body.rotation = Vector3.ZERO
			for i in LEG_COUNT:
				_feet[i] = _rest_target(i)
				_step_t[i] = -1.0


func _physics_process(delta: float) -> void:
	# --- Déplacement (monde, caméra fixe derrière) ---
	var input_dir := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_Z):
		input_dir.y -= 1.0
	if Input.is_physical_key_pressed(KEY_S):
		input_dir.y += 1.0
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_Q):
		input_dir.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D):
		input_dir.x += 1.0
	input_dir = input_dir.normalized()

	var vel := _body.velocity
	vel.x = input_dir.x * MOVE_SPEED
	vel.z = input_dir.y * MOVE_SPEED

	if not _body.is_on_floor():
		vel.y -= GRAVITY * delta
	elif vel.y < 0.0:
		vel.y = -1.0

	_body.velocity = vel
	_body.move_and_slide()
	_body_velocity = _body.velocity

	# Le corps tourne doucement vers sa direction de marche —
	# les pattes suivent puisque les ancres sont en espace local
	var planar := Vector3(vel.x, 0, vel.z)
	if planar.length() > 0.2:
		var target_yaw := atan2(-planar.x, -planar.z)
		_body.rotation.y = lerp_angle(_body.rotation.y, target_yaw, TURN_SPEED * delta)

	if _body.global_position.y < -10.0:
		_body.global_position = Vector3(0, 1.2, 4)
		_body.velocity = Vector3.ZERO

	_update_legs(delta)

	# Caméra : suit le corps à offset fixe, regarde le corps
	var cam_target := _body.global_position + Vector3(0, 5.5, 7.5)
	_camera.global_position = _camera.global_position.lerp(cam_target, 4.0 * delta)
	_camera.look_at(_body.global_position + Vector3.UP * 0.5)

	var stepping := 0
	for i in LEG_COUNT:
		if _step_t[i] >= 0.0:
			stepping += 1
	_hud.text = "ZQSD/WASD déplacer · R reset · Échap souris\nIK : FABRIK ×8 pattes · Pas : %d · En l'air : %d" % [_step_count, stepping]
