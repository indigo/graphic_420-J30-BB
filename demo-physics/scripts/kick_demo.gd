extends Node3D
## ============================================================
##  KICK DEMO — CharacterBody3D + Impulsion au pied
##
##  Démo de character controller 3D (Jolt) avec un « coup de
##  pied » : clic gauche → rayon devant le joueur → impulsion
##  sur les RigidBody3D touchés.
##
##  Contrôles :
##    ZQSD / WASD  → déplacer
##    Souris       → regarder (cliquer pour capturer)
##    Clic gauche  → COUP DE PIED
##    Espace       → sauter
##    Échap        → libérer la souris
##    R            → reset les props
## ============================================================

# --- Paramètres du personnage ---
const MOVE_SPEED := 6.0           # m/s au sol
const AIR_CONTROL := 0.4          # fraction du contrôle en l'air
const JUMP_VELOCITY := 5.5        # m/s
const GRAVITY := 18.0             # gravité renforcée (feel arcade)
const MOUSE_SENS := 0.0025        # rad / pixel
const EYE_HEIGHT := 1.55          # hauteur de la caméra

# --- Paramètres du coup de pied ---
const KICK_RANGE := 3.0           # portée du pied (m)
const KICK_FORCE := 14.0          # impulsion (N·s)
const KICK_LIFT := 4.0            # composante verticale (pop les props)
const KICK_COOLDOWN := 0.45       # s entre deux coups
const KICK_FOV_PUNCH := 8.0       # punch de FOV pour le game feel

# --- Internes : joueur ---
var _player: CharacterBody3D
var _camera: Camera3D
var _kick_raycast: RayCast3D
var _player_velocity := Vector3.ZERO
var _pitch := 0.0
var _base_fov := 75.0

# --- Internes : kick ---
var _kick_timer := 0.0
var _kick_count := 0
var _impact_flash: MeshInstance3D
var _flash_timer := 0.0

# --- Internes : props & HUD ---
var _props: Array[RigidBody3D] = []
var _prop_spawns: Array[Transform3D] = []
var _hud: Label


func _ready() -> void:
	_setup_light()
	_setup_ground()
	_setup_player()
	_setup_props()
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
##  JOUEUR — CharacterBody3D (capsule + caméra FPS)
## ============================================================

func _setup_player() -> void:
	_player = CharacterBody3D.new()
	_player.position = Vector3(0, 1.0, 6)
	# CharacterBody3D : Godot calcule le mouvement dans move_and_slide()
	# à partir de `velocity` — pas de force, c'est du cinématique.
	add_child(_player)

	# --- Collision capsule ---
	var col := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.4
	capsule.height = 1.8
	col.shape = capsule
	col.position = Vector3(0, 0.9, 0)
	_player.add_child(col)

	# --- Corps visuel ---
	var body_mesh := MeshInstance3D.new()
	var cap_mesh := CapsuleMesh.new()
	cap_mesh.radius = 0.4
	cap_mesh.height = 1.8
	var body_mat := StandardMaterial3D.new()
	body_mat.albedo_color = Color(0.204, 0.596, 0.859)
	body_mat.roughness = 0.5
	body_mesh.material_override = body_mat
	body_mesh.mesh = cap_mesh
	body_mesh.position = Vector3(0, 0.9, 0)
	_player.add_child(body_mesh)

	# --- Caméra FPS (enfant du joueur → suit yaw + pitch) ---
	_camera = Camera3D.new()
	_camera.position = Vector3(0, EYE_HEIGHT, 0)
	_camera.fov = _base_fov
	_camera.current = true
	_player.add_child(_camera)

	# --- RayCast3D du coup de pied (pointe vers -Z, l'avant) ---
	_kick_raycast = RayCast3D.new()
	_kick_raycast.position = Vector3(0, EYE_HEIGHT - 0.6, 0)  # pied = sous les yeux
	_kick_raycast.target_position = Vector3(0, -0.2, -KICK_RANGE)
	_kick_raycast.enabled = true
	_player.add_child(_kick_raycast)

	# --- Flash d'impact (sphère additive, fade rapide) ---
	_impact_flash = MeshInstance3D.new()
	var flash_mesh := SphereMesh.new()
	flash_mesh.radius = 0.35
	flash_mesh.height = 0.7
	var flash_mat := StandardMaterial3D.new()
	flash_mat.albedo_color = Color(1.0, 0.9, 0.2)
	flash_mat.emission_enabled = true
	flash_mat.emission = Color(1.0, 0.7, 0.1)
	flash_mat.emission_energy_multiplier = 4.0
	flash_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	flash_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_impact_flash.material_override = flash_mat
	_impact_flash.mesh = flash_mesh
	_impact_flash.visible = false
	add_child(_impact_flash)


## ============================================================
##  PROPS — cibles à défoncer
## ============================================================

func _make_prop(pos: Vector3, size: Vector3, color: Color, mass_kg: float = 1.0) -> RigidBody3D:
	var prop := RigidBody3D.new()
	prop.position = pos
	prop.mass = mass_kg
	prop.angular_damp = 0.3
	prop.linear_damp = 0.1

	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	col.shape = shape
	prop.add_child(col)

	var mesh := MeshInstance3D.new()
	var box_mesh := BoxMesh.new()
	box_mesh.size = size
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.6
	mesh.material_override = mat
	mesh.mesh = box_mesh
	prop.add_child(mesh)

	add_child(prop)
	_props.append(prop)
	_prop_spawns.append(prop.global_transform)
	return prop


func _make_ball(pos: Vector3, radius: float, color: Color, mass_kg: float = 0.8) -> RigidBody3D:
	var ball := RigidBody3D.new()
	ball.position = pos
	ball.mass = mass_kg
	ball.linear_damp = 0.1
	ball.angular_damp = 0.2

	var col := CollisionShape3D.new()
	var shape := SphereShape3D.new()
	shape.radius = radius
	col.shape = shape
	ball.add_child(col)

	var mesh := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = radius
	sphere.height = radius * 2.0
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.metallic = 0.2
	mat.roughness = 0.4
	mesh.material_override = mat
	mesh.mesh = sphere
	ball.add_child(mesh)

	add_child(ball)
	_props.append(ball)
	_prop_spawns.append(ball.global_transform)
	return ball


func _setup_props() -> void:
	# --- Mur de briques (la cible classique du kick) ---
	const WALL_Z := -4.0
	const COLS := 6
	const ROWS := 4
	const BRICK := Vector3(0.7, 0.35, 0.35)
	for row in ROWS:
		for c in COLS:
			var x := (c - (COLS - 1) / 2.0) * (BRICK.x + 0.02)
			# Décalage brique alternée (mur de briques)
			if row % 2 == 1:
				x += (BRICK.x + 0.02) * 0.5
			var y := 0.2 + row * (BRICK.y + 0.02)
			_make_prop(Vector3(x, y, WALL_Z), BRICK, Color(0.72, 0.25, 0.18), 0.8)

	# --- Quelques boules à frapper ---
	_make_ball(Vector3(3.5, 0.45, 1.0), 0.45, Color(0.945, 0.769, 0.059), 0.6)
	_make_ball(Vector3(4.5, 0.45, 2.5), 0.45, Color(0.180, 0.800, 0.443), 0.6)
	_make_ball(Vector3(-3.5, 0.45, 0.5), 0.45, Color(0.608, 0.349, 0.714), 0.6)

	# --- Un bonhomme à bousculer (pile de boîtes) ---
	const DX := -3.0
	const DZ := -2.0
	_make_prop(Vector3(DX, 0.25, DZ), Vector3(0.5, 0.5, 0.5), Color(0.5, 0.5, 0.55), 1.2)      # bassin
	_make_prop(Vector3(DX, 0.8, DZ), Vector3(0.45, 0.6, 0.35), Color(0.9, 0.6, 0.4), 0.9)    # torse
	_make_prop(Vector3(DX, 1.35, DZ), Vector3(0.32, 0.32, 0.32), Color(0.95, 0.8, 0.65), 0.5) # tête


func _reset_props() -> void:
	for i in _props.size():
		var p := _props[i]
		if is_instance_valid(p):
			p.global_transform = _prop_spawns[i]
			p.linear_velocity = Vector3.ZERO
			p.angular_velocity = Vector3.ZERO
			p.sleeping = false


## ============================================================
##  INPUT — souris capturée, touches physiques
## ============================================================

func _unhandled_input(event: InputEvent) -> void:
	# Capture de la souris au premier clic
	if event is InputEventMouseButton and event.pressed:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		elif event.button_index == MOUSE_BUTTON_LEFT:
			_try_kick()

	# Look
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		_player.rotate_y(-event.relative.x * MOUSE_SENS)
		_pitch = clampf(_pitch - event.relative.y * MOUSE_SENS, -1.45, 1.45)
		_camera.rotation.x = _pitch

	# Libération de la souris
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

	# Reset props
	if event is InputEventKey and event.pressed and event.keycode == KEY_R:
		_reset_props()


## ============================================================
##  LE COUP DE PIED
## ============================================================

func _try_kick() -> void:
	if _kick_timer > 0.0:
		return
	_kick_timer = KICK_COOLDOWN

	# Punch de caméra (game feel)
	_camera.fov = _base_fov + KICK_FOV_PUNCH

	_kick_raycast.force_raycast_update()
	if not _kick_raycast.is_colliding():
		return

	var hit_point := _kick_raycast.get_collision_point()
	var target := _kick_raycast.get_collider()

	# Direction du kick : de la caméra vers le point d'impact
	var dir := (hit_point - _camera.global_position)
	dir.y = 0
	dir = dir.normalized()

	# Impulsion seulement sur les RigidBody3D
	if target is RigidBody3D:
		var body := target as RigidBody3D
		var impulse := dir * KICK_FORCE + Vector3.UP * KICK_LIFT
		# apply_impulse(point, impulse) : torque naturel selon le point de contact
		body.apply_impulse(impulse, hit_point - body.global_position)
		body.sleeping = false
		_kick_count += 1

		# Flash à l'impact
		_impact_flash.global_position = hit_point
		_impact_flash.visible = true
		_flash_timer = 0.15


## ============================================================
##  PHYSIQUE DU PERSONNAGE
## ============================================================

func _physics_process(delta: float) -> void:
	_kick_timer = maxf(_kick_timer - delta, 0.0)

	# Flash d'impact
	if _flash_timer > 0.0:
		_flash_timer -= delta
		if _flash_timer <= 0.0:
			_impact_flash.visible = false

	# FOV punch retour progressif
	_camera.fov = lerpf(_camera.fov, _base_fov, 8.0 * delta)

	# --- Déplacement ZQSD / WASD ---
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

	# Direction dans le repère du joueur (yaw)
	var wish := (_player.global_transform.basis * Vector3(input_dir.x, 0, input_dir.y))
	wish.y = 0
	wish = wish.normalized() * MOVE_SPEED

	var control := 1.0 if _player.is_on_floor() else AIR_CONTROL
	_player_velocity.x = lerpf(_player_velocity.x, wish.x, 12.0 * control * delta)
	_player_velocity.z = lerpf(_player_velocity.z, wish.z, 12.0 * control * delta)

	# --- Gravité + saut ---
	if _player.is_on_floor():
		if Input.is_physical_key_pressed(KEY_SPACE):
			_player_velocity.y = JUMP_VELOCITY
		elif _player_velocity.y < 0.0:
			_player_velocity.y = -1.0  # coller au sol
	else:
		_player_velocity.y -= GRAVITY * delta

	_player.velocity = _player_velocity
	_player.move_and_slide()
	_player_velocity = _player.velocity

	# Sécurité anti-chute (au cas où le joueur tombe du monde)
	if _player.global_position.y < -10.0:
		_player.global_position = Vector3(0, 1.0, 6)
		_player_velocity = Vector3.ZERO

	# --- HUD ---
	var cd_txt := "PRÊT" if _kick_timer <= 0.0 else "%.2fs" % _kick_timer
	_hud.text = "ZQSD/WASD déplacer · Souris regarder · Clic gauche KICK\nEspace sauter · R reset props · Échap souris\nKicks : %d · Cooldown : %s" % [_kick_count, cd_txt]
