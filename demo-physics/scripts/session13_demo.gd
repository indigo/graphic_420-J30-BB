extends Node3D
## ============================================================
##  SESSION 13 — La physique intégrée de Godot
##
##  Comparez avec la version Three.js + Rapier :
##  ICI, pas de world.step(), pas de synchronisation mesh/corps.
##  Godot intègre le moteur physique au moteur de jeu : les
##  RigidBody3D sont simulés ET rendus automatiquement.
## ============================================================

const CUBE_COLORS: Array[Color] = [
	Color(0.906, 0.298, 0.235),
	Color(0.902, 0.494, 0.133),
	Color(0.945, 0.769, 0.059),
	Color(0.180, 0.800, 0.443),
	Color(0.204, 0.596, 0.859),
]

var _cannon_speed := 60.0
var _ccd_enabled := true
var _ball_count := 0

var _camera: Camera3D
var _hud: Label
var _dynamic_bodies: Array[RigidBody3D] = []


func _ready() -> void:
	_setup_camera()
	_setup_light()
	_setup_ground()
	_setup_hud()
	_spawn_stack()


## --- MISE EN PLACE -------------------------------------------

func _setup_camera() -> void:
	_camera = Camera3D.new()
	_camera.position = Vector3(14, 9, 18)
	add_child(_camera)
	_camera.look_at(Vector3(0, 2, 0))
	_camera.current = true


func _setup_light() -> void:
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, -30, 0)
	sun.shadow_enabled = true
	add_child(sun)
	add_child(_make_world_environment())


func _make_world_environment() -> WorldEnvironment:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.04, 0.055, 0.08)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.35, 0.4, 0.5)
	env.ambient_light_energy = 0.8
	var we := WorldEnvironment.new()
	we.environment = env
	return we


func _setup_ground() -> void:
	# --- SOL : StaticBody3D (corps FIXE — jamais simulé) ---
	var ground := StaticBody3D.new()
	ground.position = Vector3(0, -0.1, 0)

	# Collider : la forme physique (une grande boîte)
	var col := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(60, 0.2, 60)
	col.shape = box
	ground.add_child(col)

	# Mesh : le rendu (la même boîte, avec la grille du cours)
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


## --- L'EMPILEMENT : corps DYNAMIQUES -------------------------

func _spawn_stack() -> void:
	# Pyramide « bowling » : 5 étages, un cube de moins par étage.
	# Chaque cube = RigidBody3D (corps dynamique) + CollisionShape3D
	# + MeshInstance3D. Dieu fait le reste : intégration, collisions,
	# impulsions, sleeping — tout est automatique.
	var cube_mesh := BoxMesh.new()
	cube_mesh.size = Vector3.ONE

	for row: int in 5:
		var count := 5 - row
		for i in count:
			var cube := RigidBody3D.new()
			cube.position = Vector3((i - (count - 1) / 2.0) * 1.05, 0.5 + row * 1.05, 0)

			var col := CollisionShape3D.new()
			var shape := BoxShape3D.new()
			shape.size = Vector3.ONE
			col.shape = shape
			cube.add_child(col)

			var mesh := MeshInstance3D.new()
			var mat := StandardMaterial3D.new()
			mat.albedo_color = CUBE_COLORS[row % CUBE_COLORS.size()]
			mat.roughness = 0.6
			mesh.material_override = mat
			mesh.mesh = cube_mesh
			cube.add_child(mesh)

			add_child(cube)
			_dynamic_bodies.append(cube)

	# Une sphère témoin qui roule au sol
	var ball := _make_ball(Vector3(6, 0.7, 2), 0.7, Color(0.102, 0.737, 0.612), 1.0)
	ball.linear_velocity = Vector3(-4, 0, 0)
	_dynamic_bodies.append(ball)


func _make_ball(at: Vector3, radius: float, color: Color, mass: float) -> RigidBody3D:
	var ball := RigidBody3D.new()
	ball.position = at
	ball.mass = mass

	var col := CollisionShape3D.new()
	var shape := SphereShape3D.new()
	shape.radius = radius
	col.shape = shape
	ball.add_child(col)

	var mesh := MeshInstance3D.new()
	var sphere_mesh := SphereMesh.new()
	sphere_mesh.radius = radius
	sphere_mesh.height = radius * 2.0
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.metallic = 0.7
	mat.roughness = 0.3
	mesh.material_override = mat
	mesh.mesh = sphere_mesh
	ball.add_child(mesh)

	add_child(ball)
	return ball


## --- ENTRÉES : tirer, reset, CCD, vitesse --------------------

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton \
				and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_fire_cannonball(event.position)
	elif event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_R: _reset()
			KEY_C: _ccd_enabled = not _ccd_enabled
			KEY_UP: _cannon_speed = minf(_cannon_speed + 10.0, 150.0)
			KEY_DOWN: _cannon_speed = maxf(_cannon_speed - 10.0, 10.0)


func _fire_cannonball(screen_pos: Vector2) -> void:
	# Rayon écran → monde : la caméra fait le calcul pour nous.
	var from := _camera.project_ray_origin(screen_pos)
	var dir := _camera.project_ray_normal(screen_pos)

	# Boulet lourd et rapide — le cas d'école du TUNNELING :
	# à 120 u/s, il avance de 2 unités par pas de physique (1/60 s).
	# Sans CCD, il peut SAUTER un cube de 1 unité entre deux pas !
	var ball := _make_ball(from + dir * 2.0, 0.45, Color(0.17, 0.24, 0.32), 5.0)
	ball.continuous_cd = _ccd_enabled
	ball.linear_velocity = dir * _cannon_speed

	_ball_count += 1
	_dynamic_bodies.append(ball)

	# Ménage : on limite le nombre de boulets (16 max)
	var cannonballs := _dynamic_bodies.filter(
		func(b): return b.mass == 5.0
	)
	if cannonballs.size() > 16:
		var old: RigidBody3D = cannonballs[0]
		old.queue_free()
		_dynamic_bodies.erase(old)


func _reset() -> void:
	for body in _dynamic_bodies:
		body.queue_free()
	_dynamic_bodies.clear()
	_ball_count = 0
	_spawn_stack()


## --- HUD ------------------------------------------------------

func _process(_delta: float) -> void:
	var sleeping := 0
	for body in _dynamic_bodies:
		if body.is_sleeping():
			sleeping += 1
	_hud.text = "Corps dynamiques : %d   |   Endormis : %d\n" % [_dynamic_bodies.size(), sleeping]
	_hud.text += "Vitesse du boulet : %d (↑/↓)   |   CCD : %s (C)   |   R : reset\n" % [int(_cannon_speed), "ON" if _ccd_enabled else "OFF"]
	_hud.text += "Cliquez pour lancer un boulet — sans CCD, à haute vitesse, il traverse la pyramide !"
