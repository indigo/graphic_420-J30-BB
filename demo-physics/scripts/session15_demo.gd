extends Node3D
## ============================================================
##  SESSION 15 — Joints & Moteurs en Godot
##
##  Le « Joint Zoo » — 4 stations, comme la version Rapier :
##    1. BERCE DE NEWTON → HingeJoint3D  (revolute, 5 balles)
##    2. PISTON SUR PENTE  → SliderJoint3D (prismatic + moteur)
##    3. CHAÎNE           → PinJoint3D    (spherical, 4 maillons)
##    4. CAPTEUR RAYCAST  → RayCast3D     (rayon balayant)
##
##  Comparez avec la version Three.js + Rapier :
##  ICI, les joints sont des NODES placés dans la scène.
##  Pas de world.createImpulseJoint() — on crée un HingeJoint3D,
##  on lui donne node_a et node_b, et Godot fait le reste.
## ============================================================

const BALL_COLORS: Array[Color] = [
	Color(0.176, 0.243, 0.314),  # acier
	Color(0.176, 0.243, 0.314),
	Color(0.176, 0.243, 0.314),
	Color(0.176, 0.243, 0.314),
	Color(0.176, 0.243, 0.314),
]

const CHAIN_COLORS: Array[Color] = [
	Color(0.945, 0.769, 0.059),
	Color(0.902, 0.494, 0.133),
	Color(0.180, 0.800, 0.443),
	Color(0.608, 0.349, 0.714),
]

# --- Paramètres (modifiables via touches) ---
var _auto_loop := true
var _cradle_angle := 45.0       # degrés
var _piston_speed := 2.0        # m/s
var _raycast_speed := 1.0       # cycles/s

# --- Internes ---
var _camera: Camera3D
var _hud: Label

# Station 1 : berce de Newton
var _cradle_balls: Array[RigidBody3D] = []
var _cradle_strings: Array[MeshInstance3D] = []
var _cradle_timer := 0.0

# Station 2 : piston
var _piston: RigidBody3D
var _piston_joint: Generic6DOFJoint3D
var _piston_dir := 1.0
var _piston_timer := 0.0
var _box: RigidBody3D

# Station 3 : chaîne
var _chain_bodies: Array[RigidBody3D] = []
var _chain_timer := 0.0

# Station 4 : raycast
var _raycast: RayCast3D
var _raycast_marker: MeshInstance3D
var _raycast_angle := 0.0
var _raycast_hit_dist := -1.0


func _ready() -> void:
	_setup_camera()
	_setup_light()
	_setup_ground()
	_setup_hud()
	_create_cradle()
	_create_piston()
	_create_chain()
	_create_raycast_station()
	# Démarrer le berceau
	_pull_cradle()


## ============================================================
##  MISE EN PLACE GÉNÉRALE
## ============================================================

func _setup_camera() -> void:
	_camera = Camera3D.new()
	_camera.position = Vector3(0, 7, 22)
	add_child(_camera)
	_camera.look_at(Vector3(0, 3, 0))
	_camera.current = true


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


func _setup_ground() -> void:
	var ground := StaticBody3D.new()
	ground.position = Vector3(0, -0.1, 0)

	var col := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(60, 0.2, 60)
	col.shape = box
	ground.add_child(col)

	var mesh := MeshInstance3D.new()
	var box_mesh := BoxMesh.new()
	box_mesh.size = Vector3(60, 0.2, 60)
	var mat := StandardMaterial3D.new()
	if ResourceLoader.exists("res://textures/grid.png"):
		mat.albedo_texture = load("res://textures/grid.png")
		mat.uv1_scale = Vector3(20, 20, 20)
	else:
		mat.albedo_color = Color(0.3, 0.3, 0.35)
	mat.roughness = 0.9
	mesh.material_override = mat
	mesh.mesh = box_mesh
	ground.add_child(mesh)

	add_child(ground)


func _setup_hud() -> void:
	var canvas := CanvasLayer.new()
	add_child(canvas)
	_hud = Label.new()
	_hud.add_theme_font_size_override("font_size", 18)
	_hud.add_theme_color_override("font_color", Color(0.0, 1.0, 0.8))
	_hud.position = Vector2(20, 20)
	canvas.add_child(_hud)


## ============================================================
##  STATION 1 : BERCE DE NEWTON — HingeJoint3D (Revolute)
##  5 balles suspendues à un support. Pas de moteur.
## ============================================================

func _create_cradle() -> void:
	const CRADLE_X := -8.0
	const CRADLE_Y := 5.0
	const BALL_R := 0.35
	const BALL_GAP := 0.70   # = 2 × radius → les balles se touchent exactement
	const STRING_LEN := 2.5
	const BALL_COUNT := 5

	# --- Support fixe (barre horizontale) ---
	var bar := StaticBody3D.new()
	bar.position = Vector3(CRADLE_X, CRADLE_Y, 0)

	var bar_col := CollisionShape3D.new()
	var bar_shape := BoxShape3D.new()
	bar_shape.size = Vector3(BALL_COUNT * BALL_GAP + 0.6, 0.15, 0.3)
	bar_col.shape = bar_shape
	bar.add_child(bar_col)

	var bar_mesh := MeshInstance3D.new()
	var bar_box := BoxMesh.new()
	bar_box.size = Vector3(BALL_COUNT * BALL_GAP + 0.6, 0.15, 0.3)
	var bar_mat := StandardMaterial3D.new()
	bar_mat.albedo_color = Color(0.33, 0.33, 0.33)
	bar_mat.metallic = 0.5
	bar_mat.roughness = 0.9
	bar_mesh.material_override = bar_mat
	bar_mesh.mesh = bar_box
	bar.add_child(bar_mesh)
	add_child(bar)

	# Deux piliers
	for dx in [-(BALL_COUNT * BALL_GAP + 0.6) / 2.0, (BALL_COUNT * BALL_GAP + 0.6) / 2.0]:
		var post_mesh := MeshInstance3D.new()
		var post_box := BoxMesh.new()
		post_box.size = Vector3(0.15, CRADLE_Y, 0.15)
		post_mesh.mesh = post_box
		post_mesh.position = Vector3(dx, -CRADLE_Y / 2.0, 0)
		var post_mat := StandardMaterial3D.new()
		post_mat.albedo_color = Color(0.33, 0.33, 0.33)
		post_mat.roughness = 0.9
		post_mesh.material_override = post_mat
		bar.add_child(post_mesh)

	# --- Les 5 balles ---
	for i in BALL_COUNT:
		var x := CRADLE_X + (i - (BALL_COUNT - 1) / 2.0) * BALL_GAP
		var ball_y := CRADLE_Y - STRING_LEN

		# Balle (RigidBody3D)
		var ball := RigidBody3D.new()
		ball.position = Vector3(x, ball_y, 0)
		ball.mass = 1.0
		ball.linear_damp = 0.0
		ball.angular_damp = 0.0
		# Restitution élevée — collisions quasi-élastiques (indispensable pour Newton)
		var ball_pmat := PhysicsMaterial.new()
		ball_pmat.friction = 0.0
		ball_pmat.bounce = 1.0
		ball.physics_material_override = ball_pmat

		var col := CollisionShape3D.new()
		var shape := SphereShape3D.new()
		shape.radius = BALL_R
		col.shape = shape
		ball.add_child(col)

		var mesh := MeshInstance3D.new()
		var sphere := SphereMesh.new()
		sphere.radius = BALL_R
		sphere.height = BALL_R * 2.0
		var mat := StandardMaterial3D.new()
		mat.albedo_color = BALL_COLORS[i]
		mat.metallic = 0.9
		mat.roughness = 0.15
		mesh.material_override = mat
		mesh.mesh = sphere
		ball.add_child(mesh)
		add_child(ball)
		_cradle_balls.append(ball)

		# Fil visuel (mis à jour chaque frame)
		var string_mesh := _make_line(Vector3(x, CRADLE_Y, 0), Vector3(x, ball_y, 0))
		add_child(string_mesh)
		_cradle_strings.append(string_mesh)

		# --- HINGEJOINT3D (le revolute de Godot) ---
		var hinge := HingeJoint3D.new()
		hinge.node_a = ball.get_path()
		hinge.node_b = bar.get_path()
		# Position du joint = point d'attache (en haut de la balle)
		hinge.global_position = Vector3(x, CRADLE_Y, 0)
		# Axe de rotation = Z (pendule avant/arrière)
		hinge.set_param(HingeJoint3D.PARAM_BIAS, 0.0)
		add_child(hinge)


func _make_line(p1: Vector3, p2: Vector3) -> MeshInstance3D:
	# Crée un cylindre fin entre deux points (le fil du berceau)
	var mid := (p1 + p2) / 2.0
	var dir := p2 - p1
	var len := dir.length()
	var mesh := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.01
	cyl.bottom_radius = 0.01
	cyl.height = len
	mesh.mesh = cyl
	mesh.global_position = mid
	# Orienter le cylindre le long du fil
	mesh.look_at(p1, Vector3.UP)
	mesh.rotate_x(PI / 2.0)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.53, 0.53, 0.53)
	mesh.material_override = mat
	return mesh


func _update_cradle_strings() -> void:
	const CRADLE_Y := 5.0
	for i in _cradle_balls.size():
		var ball := _cradle_balls[i]
		var string_mesh := _cradle_strings[i]
		var anchor_x := -8.0 + (i - 2) * 0.70
		var top := Vector3(anchor_x, CRADLE_Y, 0)
		var bot := ball.global_position
		var mid := (top + bot) / 2.0
		var dir := bot - top
		var len := dir.length()
		string_mesh.global_position = mid
		string_mesh.look_at(top, Vector3.UP)
		string_mesh.rotate_x(PI / 2.0)
		var cyl := string_mesh.mesh as CylinderMesh
		if cyl:
			cyl.height = len


func _pull_cradle() -> void:
	if _cradle_balls.is_empty():
		return
	var angle := deg_to_rad(_cradle_angle)
	var ball := _cradle_balls[0]
	const STRING_LEN := 2.5
	const ANCHOR_X := -8.0 + (0 - 2) * 0.70
	const ANCHOR_Y := 5.0
	var new_x := ANCHOR_X - sin(angle) * STRING_LEN
	var new_y := ANCHOR_Y - cos(angle) * STRING_LEN
	ball.global_position = Vector3(new_x, new_y, 0)
	ball.linear_velocity = Vector3.ZERO
	ball.angular_velocity = Vector3.ZERO
	ball.sleeping = false


## ============================================================
##  STATION 2 : PISTON SUR PENTE — Generic6DOFJoint3D (Prismatic + moteur)
##  Un piston glisse sur une pente et pousse une boîte.
##  Note : SliderJoint3D n'a pas de moteur en Godot 4.
##  On utilise Generic6DOFJoint3D avec linear_motor_x.
## ============================================================

func _create_piston() -> void:
	const SLOPE_ANGLE := deg_to_rad(20.0)
	const SLOPE_CX := -2.0
	const SLOPE_CY := 2.0
	const SLOPE_LEN := 6.0
	const SLOPE_THICK := 0.3

	var slope_quat := Quaternion.from_euler(Vector3(0, 0, SLOPE_ANGLE))

	# --- La pente (StaticBody3D) ---
	var slope := StaticBody3D.new()
	slope.position = Vector3(SLOPE_CX, SLOPE_CY, 0)
	slope.rotation = Vector3(0, 0, SLOPE_ANGLE)

	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(SLOPE_LEN, SLOPE_THICK, 1.0)
	col.shape = shape
	slope.add_child(col)

	var mesh := MeshInstance3D.new()
	var box_mesh := BoxMesh.new()
	box_mesh.size = Vector3(SLOPE_LEN, SLOPE_THICK, 1.0)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.33, 0.33, 0.33)
	mat.roughness = 0.9
	mesh.material_override = mat
	mesh.mesh = box_mesh
	slope.add_child(mesh)
	# Friction faible — la boîte glisse facilement
	var slope_mat := PhysicsMaterial.new()
	slope_mat.friction = 0.1
	slope.physics_material_override = slope_mat
	add_child(slope)

	# --- Le piston (RigidBody3D, glisse le long de la pente) ---
	_piston = RigidBody3D.new()
	# Position : bas de la pente, sur la surface
	var piston_lx := -2.0
	var piston_ly := SLOPE_THICK / 2.0 + 0.35
	var cos_a := cos(SLOPE_ANGLE)
	var sin_a := sin(SLOPE_ANGLE)
	_piston.position = Vector3(
		SLOPE_CX + piston_lx * cos_a - piston_ly * sin_a,
		SLOPE_CY + piston_lx * sin_a + piston_ly * cos_a,
		0
	)
	_piston.rotation = Vector3(0, 0, SLOPE_ANGLE)
	_piston.angular_damp = 5.0
	_piston.linear_damp = 0.5

	var p_col := CollisionShape3D.new()
	var p_shape := BoxShape3D.new()
	p_shape.size = Vector3(0.6, 0.7, 0.7)
	p_col.shape = p_shape
	_piston.add_child(p_col)

	var p_mesh := MeshInstance3D.new()
	var p_box := BoxMesh.new()
	p_box.size = Vector3(0.6, 0.7, 0.7)
	var p_mat := StandardMaterial3D.new()
	p_mat.albedo_color = Color(0.204, 0.596, 0.859)
	p_mat.roughness = 0.5
	p_mesh.material_override = p_mat
	p_mesh.mesh = p_box
	_piston.add_child(p_mesh)
	add_child(_piston)

	# --- GENERIC6DOFJOINT3D (prismatic + moteur en Godot 4) ---
	# SliderJoint3D n'a pas de moteur en Godot 4 → on utilise
	# Generic6DOFJoint3D qui a linear_motor_x.
	_piston_joint = Generic6DOFJoint3D.new()
	_piston_joint.node_a = _piston.get_path()
	_piston_joint.node_b = slope.get_path()
	_piston_joint.global_position = _piston.global_position
	# Aligner les axes du joint avec la pente (sinon X = monde, pas la pente)
	_piston_joint.rotation = Vector3(0, 0, SLOPE_ANGLE)
	# Verrouiller Y et Z (prismatic = un seul axe libre en X)
	_piston_joint.set_flag_x(Generic6DOFJoint3D.FLAG_ENABLE_LINEAR_LIMIT, true)
	_piston_joint.set_param_x(Generic6DOFJoint3D.PARAM_LINEAR_LOWER_LIMIT, -1.5)
	_piston_joint.set_param_x(Generic6DOFJoint3D.PARAM_LINEAR_UPPER_LIMIT, 2.0)
	_piston_joint.set_flag_y(Generic6DOFJoint3D.FLAG_ENABLE_LINEAR_LIMIT, true)
	_piston_joint.set_flag_z(Generic6DOFJoint3D.FLAG_ENABLE_LINEAR_LIMIT, true)
	# Bloquer toutes les rotations
	_piston_joint.set_flag_x(Generic6DOFJoint3D.FLAG_ENABLE_ANGULAR_LIMIT, true)
	_piston_joint.set_flag_y(Generic6DOFJoint3D.FLAG_ENABLE_ANGULAR_LIMIT, true)
	_piston_joint.set_flag_z(Generic6DOFJoint3D.FLAG_ENABLE_ANGULAR_LIMIT, true)
	# Moteur linéaire sur X
	_piston_joint.set_flag_x(Generic6DOFJoint3D.FLAG_ENABLE_LINEAR_MOTOR, true)
	_piston_joint.set_param_x(Generic6DOFJoint3D.PARAM_LINEAR_MOTOR_TARGET_VELOCITY, _piston_speed)
	_piston_joint.set_param_x(Generic6DOFJoint3D.PARAM_LINEAR_MOTOR_FORCE_LIMIT, 200.0)
	add_child(_piston_joint)

	# --- La boîte à pousser (RigidBody3D libre) ---
	_box = RigidBody3D.new()
	var box_lx := -1.0
	var box_ly := SLOPE_THICK / 2.0 + 0.35
	_box.position = Vector3(
		SLOPE_CX + box_lx * cos_a - box_ly * sin_a,
		SLOPE_CY + box_lx * sin_a + box_ly * cos_a,
		0
	)
	_box.rotation = Vector3(0, 0, SLOPE_ANGLE)
	_box.angular_damp = 0.3
	# Friction faible — la boîte glisse sur la pente
	var box_pmat := PhysicsMaterial.new()
	box_pmat.friction = 0.1
	_box.physics_material_override = box_pmat

	var b_col := CollisionShape3D.new()
	var b_shape := BoxShape3D.new()
	b_shape.size = Vector3(0.7, 0.7, 0.7)
	b_col.shape = b_shape
	_box.add_child(b_col)

	var b_mesh := MeshInstance3D.new()
	var b_box := BoxMesh.new()
	b_box.size = Vector3(0.7, 0.7, 0.7)
	var b_mat := StandardMaterial3D.new()
	b_mat.albedo_color = Color(0.906, 0.298, 0.235)
	b_mat.roughness = 0.5
	b_mesh.material_override = b_mat
	b_mesh.mesh = b_box
	_box.add_child(b_mesh)
	add_child(_box)


## ============================================================
##  STATION 3 : CHAÎNE — PinJoint3D (Spherical)
##  4 maillons reliés par des rotules.
## ============================================================

func _create_chain() -> void:
	const CHAIN_X := 4.0
	const CHAIN_TOP := 6.0
	const LINK_COUNT := 4
	const LINK_R := 0.25
	const LINK_GAP := 0.6

	# --- Anneau d'attache fixe ---
	var anchor := StaticBody3D.new()
	anchor.position = Vector3(CHAIN_X, CHAIN_TOP, 0)

	var a_col := CollisionShape3D.new()
	var a_shape := SphereShape3D.new()
	a_shape.radius = 0.3
	a_col.shape = a_shape
	anchor.add_child(a_col)

	var a_mesh := MeshInstance3D.new()
	var a_torus := TorusMesh.new()
	a_torus.inner_radius = 0.22
	a_torus.outer_radius = 0.38
	a_mesh.mesh = a_torus
	var a_mat := StandardMaterial3D.new()
	a_mat.albedo_color = Color(0.33, 0.33, 0.33)
	a_mat.roughness = 0.8
	a_mesh.material_override = a_mat
	anchor.add_child(a_mesh)
	add_child(anchor)

	var prev_body: PhysicsBody3D = anchor
	var prev_anchor := Vector3(0, -0.3, 0)

	for i in LINK_COUNT:
		var y := CHAIN_TOP - (i + 1) * LINK_GAP

		var link := RigidBody3D.new()
		link.position = Vector3(CHAIN_X, y, 0)
		link.angular_damp = 0.3
		link.linear_damp = 0.1

		var col := CollisionShape3D.new()
		var shape := SphereShape3D.new()
		shape.radius = LINK_R
		col.shape = shape
		link.add_child(col)

		var mesh := MeshInstance3D.new()
		var sphere := SphereMesh.new()
		sphere.radius = LINK_R
		sphere.height = LINK_R * 2.0
		var mat := StandardMaterial3D.new()
		mat.albedo_color = CHAIN_COLORS[i]
		mat.metallic = 0.3
		mat.roughness = 0.5
		mesh.material_override = mat
		mesh.mesh = sphere
		link.add_child(mesh)
		add_child(link)
		_chain_bodies.append(link)

		# --- PINJOINT3D (le spherical de Godot) ---
		var pin := PinJoint3D.new()
		pin.node_a = prev_body.get_path()
		pin.node_b = link.get_path()
		# Position du joint = point d'attache entre les deux
		pin.global_position = Vector3(CHAIN_X, y + LINK_GAP / 2.0, 0)
		add_child(pin)

		prev_body = link


## ============================================================
##  STATION 4 : CAPTEUR RAYCAST — RayCast3D
##  Un rayon balaie et détecte les obstacles.
## ============================================================

func _create_raycast_station() -> void:
	const RAY_X := 10.0
	const RAY_Y := 5.0

	# --- Émetteur visuel ---
	var emitter := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.2
	sphere.height = 0.4
	emitter.mesh = sphere
	emitter.position = Vector3(RAY_X, RAY_Y, 0)
	var em_mat := StandardMaterial3D.new()
	em_mat.albedo_color = Color(0.0, 1.0, 0.0)
	em_mat.emission_enabled = true
	em_mat.emission = Color(0.0, 0.3, 0.0)
	emitter.material_override = em_mat
	add_child(emitter)

	# --- RayCast3D (le rayon physique de Godot) ---
	_raycast = RayCast3D.new()
	_raycast.position = Vector3(RAY_X, RAY_Y, 0)
	_raycast.target_position = Vector3(1, 0, 0) * 15.0
	_raycast.enabled = true
	add_child(_raycast)

	# --- Marqueur d'impact ---
	_raycast_marker = MeshInstance3D.new()
	var marker_sphere := SphereMesh.new()
	marker_sphere.radius = 0.15
	marker_sphere.height = 0.3
	_raycast_marker.mesh = marker_sphere
	var m_mat := StandardMaterial3D.new()
	m_mat.albedo_color = Color(1.0, 0.0, 0.0)
	m_mat.emission_enabled = true
	m_mat.emission = Color(0.3, 0.0, 0.0)
	_raycast_marker.material_override = m_mat
	_raycast_marker.visible = false
	add_child(_raycast_marker)

	# --- Mur de cibles (grille dans le plan YZ) ---
	const WALL_CX := RAY_X + 5.0
	const WALL_CY := 2.5
	const COLS := 5
	const ROWS := 4
	const CELL := 0.6
	const CUBE := 0.4

	for row in ROWS:
		for col in COLS:
			var x := WALL_CX
			var y := WALL_CY + (row - (ROWS - 1) / 2.0) * CELL
			var z := (col - (COLS - 1) / 2.0) * CELL

			var block := StaticBody3D.new()
			block.position = Vector3(x, y, z)

			var col2 := CollisionShape3D.new()
			var shape := BoxShape3D.new()
			shape.size = Vector3(CUBE, CUBE, CUBE)
			col2.shape = shape
			block.add_child(col2)

			var mesh := MeshInstance3D.new()
			var box_mesh := BoxMesh.new()
			box_mesh.size = Vector3(CUBE, CUBE, CUBE)
			var mat := StandardMaterial3D.new()
			mat.albedo_color = Color(0.545, 0.271, 0.075)
			mat.roughness = 0.7
			mesh.material_override = mat
			mesh.mesh = box_mesh
			block.add_child(mesh)
			add_child(block)

	# --- Bloc au sol ---
	var block := StaticBody3D.new()
	block.position = Vector3(RAY_X, 0.25, 0)
	var b_col := CollisionShape3D.new()
	var b_shape := BoxShape3D.new()
	b_shape.size = Vector3(2, 0.5, 2)
	b_col.shape = b_shape
	block.add_child(b_col)
	var b_mesh := MeshInstance3D.new()
	var b_box := BoxMesh.new()
	b_box.size = Vector3(2, 0.5, 2)
	b_mesh.mesh = b_box
	var b_mat := StandardMaterial3D.new()
	b_mat.albedo_color = Color(0.33, 0.33, 0.33)
	b_mat.roughness = 0.9
	b_mesh.material_override = b_mat
	block.add_child(b_mesh)
	add_child(block)


func _update_raycast() -> void:
	_raycast_angle += _raycast_speed * get_physics_process_delta_time()
	var v_sweep := sin(_raycast_angle * 2.0) * 0.5
	var h_sweep := sin(_raycast_angle * 0.7) * 0.5
	var dir := Vector3(1, v_sweep, h_sweep).normalized()
	_raycast.target_position = dir * 15.0
	_raycast.force_raycast_update()

	if _raycast.is_colliding():
		var point := _raycast.get_collision_point()
		_raycast_marker.global_position = point
		_raycast_marker.visible = true
		_raycast_hit_dist = (_raycast.global_position - point).length()
	else:
		_raycast_marker.visible = false
		_raycast_hit_dist = -1.0


## ============================================================
##  AUTO-LOOP
## ============================================================

func _physics_process(delta: float) -> void:
	if not _auto_loop:
		return

	# --- 1. Berce : re-tirer quand les balles s'arrêtent ---
	_cradle_timer += delta
	if _cradle_timer > 3.0:
		var total_speed := 0.0
		for b in _cradle_balls:
			total_speed += b.linear_velocity.length()
		if total_speed < 0.5:
			_pull_cradle()
			_cradle_timer = 0.0

	# --- 2. Piston : osciller ---
	_piston_timer += delta
	if _piston_timer > 2.0:
		_piston_dir *= -1.0
		_piston_joint.set_param_x(
			Generic6DOFJoint3D.PARAM_LINEAR_MOTOR_TARGET_VELOCITY,
			_piston_speed * _piston_dir
		)
		_piston_timer = 0.0
	# Reset la boîte si elle tombe
	if _box and (_box.global_position.y < 0.5 or _box.global_position.x > 3.0 or _box.global_position.x < -6.0):
		var a := deg_to_rad(20.0)
		var bx := -2.0 + (-1.0) * cos(a) - 0.5 * sin(a)
		var by := 2.0 + (-1.0) * sin(a) + 0.5 * cos(a)
		_box.global_position = Vector3(bx, by, 0)
		_box.linear_velocity = Vector3.ZERO
		_box.angular_velocity = Vector3.ZERO
		_box.rotation = Vector3(0, 0, a)

	# --- 3. Chaîne : pousser périodiquement ---
	_chain_timer += delta
	if _chain_timer > 4.0:
		for b in _chain_bodies:
			b.apply_impulse(Vector3(3, 2, 0))
		_chain_timer = 0.0

	# --- 4. Raycast ---
	_update_raycast()


## ============================================================
##  ENTRÉES CLAVIER
## ============================================================

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_R: _reset()
			KEY_SPACE: _pull_cradle()
			KEY_UP: _cradle_angle = minf(_cradle_angle + 5.0, 80.0)
			KEY_DOWN: _cradle_angle = maxf(_cradle_angle - 5.0, 10.0)
			KEY_LEFT: _piston_speed = maxf(_piston_speed - 0.5, 0.5)
			KEY_RIGHT: _piston_speed = minf(_piston_speed + 0.5, 5.0)
			KEY_A: _auto_loop = not _auto_loop


func _reset() -> void:
	# Supprimer les corps dynamiques et joints
	for b in _cradle_balls:
		b.queue_free()
	_cradle_balls.clear()
	_cradle_strings.clear()
	for b in _chain_bodies:
		b.queue_free()
	_chain_bodies.clear()
	if _piston:
		_piston.queue_free()
		_piston = null
	if _box:
		_box.queue_free()
		_box = null
	# Supprimer les joints (HingeJoint3D, PinJoint3D, SliderJoint3D)
	for child in get_children():
		if child is HingeJoint3D or child is PinJoint3D or child is Generic6DOFJoint3D:
			child.queue_free()
	# Recréer
	_cradle_timer = 0.0
	_piston_timer = 0.0
	_piston_dir = 1.0
	_chain_timer = 0.0
	_create_cradle()
	_create_piston()
	_create_chain()
	_pull_cradle()


## ============================================================
##  HUD
## ============================================================

func _process(_delta: float) -> void:
	# Mettre à jour les fils du berceau
	_update_cradle_strings()

	var text := "Joint Zoo — Godot (4 stations)\n"
	text += "1. Newton: %d balles | " % _cradle_balls.size()
	text += "2. Piston: %s | " % ("moteur ON" if _piston_joint else "—")
	text += "3. Chaîne: %d maillons | " % _chain_bodies.size()
	text += "4. Raycast: %s\n" % ("%.2f m" % _raycast_hit_dist if _raycast_hit_dist >= 0 else "—")
	text += "Espace: tirer le berceau | ↑↓: angle | ←→: vitesse piston | A: boucle auto (%s) | R: reset" % ("ON" if _auto_loop else "OFF")
	_hud.text = text
